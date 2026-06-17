import logging
import os
from datetime import datetime, timedelta, timezone

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SCAN_INTERVAL_SECONDS

_LOGGER = logging.getLogger(__name__)


def _ds(arr: list, n: int = 40) -> list:
    """Downsample a list to at most *n* evenly-spaced items (last item always kept)."""
    if len(arr) <= n:
        return arr
    step = (len(arr) - 1) / (n - 1)
    return [arr[round(i * step)] for i in range(n)]


def _stddev(vals: list[float]) -> float:
    if len(vals) < 2:
        return 0.0
    m = sum(vals) / len(vals)
    return (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5


def _detect_channeling(times: list[float], pressures: list[float]) -> bool:
    if not times or len(pressures) < 5:
        return False
    for i in range(1, len(pressures)):
        if pressures[i - 1] < 5:
            continue
        dt = times[i] - times[i - 1]
        if dt <= 0 or dt > 3:
            continue
        if pressures[i - 1] - pressures[i] > 1.5:
            return True
    return False


def _calc_shot_score(pres10, temp10, wt10, dur10, ratio) -> int | None:
    """Port of the GLP app's calcShotScore (weighted: pressure 25, temp 20,
    duration 20, ratio 20, channeling 15). Inputs are ×10 integer curves."""
    p = [v / 10 for v in pres10]
    pvals = [v for v in p if v >= 5]
    if len(pvals) <= 3:
        return None
    scores: list[float] = []
    weights: list[int] = []

    avg_p = sum(pvals) / len(pvals)
    if 7 <= avg_p <= 9.5:
        s = 100
    elif avg_p < 7:
        s = max(20, 100 - (7 - avg_p) * 22)
    else:
        s = max(20, 100 - (avg_p - 9.5) * 28)
    scores.append(round(s)); weights.append(25)

    tvals = [v / 10 for v in temp10]
    if len(tvals) > 5:
        sd = _stddev(tvals)
        s = (100 if sd <= 0.3 else 90 if sd <= 0.7 else 72 if sd <= 1.5
             else 50 if sd <= 3 else max(15, 50 - (sd - 3) * 12))
        scores.append(round(s)); weights.append(20)

    secs = (dur10[-1] / 10) if dur10 else 0
    if secs > 5:
        if 25 <= secs <= 35:
            s = 100
        elif 20 <= secs < 25 or 35 < secs <= 42:
            s = 82
        elif 42 < secs <= 55:
            s = 62
        elif secs < 20:
            s = max(15, 70 - (20 - secs) * 5)
        else:
            s = max(15, 62 - (secs - 55) * 3)
        scores.append(round(s)); weights.append(20)

    if ratio:
        r = ratio
        if 1.8 <= r <= 2.5:
            s = 100
        elif 1.5 <= r < 1.8 or 2.5 < r <= 3.2:
            s = 75
        elif r < 1.5:
            s = max(15, 55 - (1.5 - r) * 40)
        else:
            s = max(15, 60 - (r - 3.2) * 22)
        scores.append(round(s)); weights.append(20)

    times = [v / 10 for v in dur10]
    scores.append(20 if _detect_channeling(times, p) else 100)
    weights.append(15)

    tw = sum(weights)
    return round(sum(sc * w for sc, w in zip(scores, weights)) / tw) if tw else None


def _parse_ts(value: object) -> datetime | None:
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            # GLP timestamps are Unix seconds; values > 1e10 are ms
            ts = value / 1000 if value > 1e10 else value
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        s = str(value)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class GlpDataCoordinator(DataUpdateCoordinator):
    def __init__(self, hass: HomeAssistant, session: aiohttp.ClientSession, url: str, scan_interval: int = SCAN_INTERVAL_SECONDS):
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self._session = session
        self._url     = url.rstrip("/")
        self._headers: dict = {}
        self._last_shot_id: int | None = None

    async def _async_update_data(self) -> dict:
        try:
            async with self._session.get(f"{self._url}/api/status", timeout=aiohttp.ClientTimeout(total=10)) as r:
                r.raise_for_status()
                status = await r.json()

            # Fetch GLP API token once.  Send the HA Supervisor token in the
            # Authorization header so the add-on can verify via the Supervisor
            # API, even when the request does not arrive from a private IP.
            if not self._headers:
                try:
                    token_req_headers: dict[str, str] = {}
                    supervisor_token = os.environ.get("SUPERVISOR_TOKEN")
                    if supervisor_token:
                        token_req_headers["Authorization"] = f"Bearer {supervisor_token}"
                    async with self._session.get(
                        f"{self._url}/api/token",
                        headers=token_req_headers,
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as tr:
                        if tr.ok:
                            td = await tr.json()
                            if td.get("apiToken"):
                                self._headers = {"X-GLP-Token": td["apiToken"]}
                        else:
                            _LOGGER.warning(
                                "GLP /api/token returned %s — check add-on logs for denied IP",
                                tr.status,
                            )
                except Exception as token_err:
                    _LOGGER.warning("GLP token fetch failed: %s", token_err)

            async with self._session.get(f"{self._url}/shots.json", headers=self._headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                r.raise_for_status()
                shots = await r.json()

        except Exception as err:
            raise UpdateFailed(f"GLP unreachable: {err}") from err

        try:
            async with self._session.get(f"{self._url}/api/maintenance", headers=self._headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                r.raise_for_status()
                maintenance = await r.json()
        except Exception:
            maintenance = {}

        try:
            async with self._session.get(f"{self._url}/api/preheat", headers=self._headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                r.raise_for_status()
                preheat = await r.json()
        except Exception:
            preheat = {}

        try:
            async with self._session.get(f"{self._url}/api/machine/profiles", headers=self._headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                r.raise_for_status()
                profiles_data = await r.json()
        except Exception:
            profiles_data = {}

        try:
            async with self._session.get(f"{self._url}/api/menu", headers=self._headers, timeout=aiohttp.ClientTimeout(total=5)) as r:
                menu_items = await r.json() if r.ok else []
        except Exception:
            menu_items = []
        drink_lookup: dict[str, str] = {
            m["id"]: f"{m.get('emoji', '')} {m['name']}".strip()
            for m in menu_items if m.get("id") and m.get("name")
        }

        last = shots[-1] if shots else {}
        ann  = last.get("annotation") or {}

        dp       = last.get("datapoints") or {}
        pressure = dp.get("pressure") or []
        duration = dp.get("timeInShot") or []

        avg_pressure = round(sum(pressure) / len(pressure) / 10, 2) if pressure else None
        duration_s   = round(duration[-1] / 10, 1) if duration else None

        dose  = ann.get("dose")
        yield_g = None
        ratio   = None
        weight_arr = dp.get("shotWeight") or dp.get("weight") or []
        if weight_arr:
            yield_g = round(weight_arr[-1] / 10, 1)
        if dose and yield_g:
            try:
                ratio = round(float(yield_g) / float(dose), 2)
            except (ValueError, ZeroDivisionError):
                pass

        current_shot_id = last.get("id")

        now_local  = dt_util.now()
        today_date = now_local.date()
        shots_today = sum(
            1 for s in shots
            if (ts := _parse_ts(s.get("timestamp"))) is not None
            and ts.astimezone(now_local.tzinfo).date() == today_date
        )

        data = {
            "machine_status":      "online" if not status.get("lastSyncError") else "error",
            "switch_entity":       status.get("switchEntity") or None,
            "shot_count":          status.get("shotCount", 0),
            "shots_today":         shots_today,
            "last_shot_id":        current_shot_id,
            "last_shot_profile":   last.get("profileName") or last.get("profile", {}).get("name"),
            "last_shot_rating":    int(ann["rating"]) if ann.get("rating") else None,
            "last_shot_date":      _parse_ts(last.get("timestamp")),
            "last_shot_duration":  duration_s,
            "last_shot_pressure":  avg_pressure,
            "last_shot_weight":    yield_g,
            "last_shot_ratio":     ratio,
            "last_shot_coffee":    ann.get("coffee"),
            "last_shot_grinder":   ann.get("grinder"),
            "last_shot_dose":      float(dose) if dose else None,
            "last_sync":           _parse_ts(status.get("lastSync")),
            "machine_url":         status.get("machineHostname"),
        }

        if current_shot_id and current_shot_id != self._last_shot_id and self._last_shot_id is not None:
            self.hass.bus.async_fire(
                f"{DOMAIN}_shot_completed",
                {
                    "shot_id":      current_shot_id,
                    "profile":      data["last_shot_profile"],
                    "duration_s":   data["last_shot_duration"],
                    "yield_g":      data["last_shot_weight"],
                    "dose_g":       data["last_shot_dose"],
                    "ratio":        data["last_shot_ratio"],
                    "avg_pressure": data["last_shot_pressure"],
                    "rating":       data["last_shot_rating"],
                    "coffee":       data["last_shot_coffee"],
                    "grinder":      data["last_shot_grinder"],
                },
            )

        self._last_shot_id = current_shot_id

        for task in ("descaling", "backflush", "grouphead", "gaskets", "waterfilter"):
            data[f"maint_{task}"] = maintenance.get(task) or {}

        # Aggregate grinder_* maintenance entries into a single worst-status sensor
        _STATUS_RANK = {"due": 3, "never": 2, "soon": 1, "ok": 0}
        grinder_details: dict[str, dict] = {
            k: v for k, v in maintenance.items() if k.startswith("grinder_")
        }
        worst = max(
            (_STATUS_RANK.get(v.get("status", "ok"), 0) for v in grinder_details.values()),
            default=-1,
        )
        data["grinder_maintenance_status"] = (
            next(s for s, r in _STATUS_RANK.items() if r == worst)
            if worst >= 0 else None
        )
        data["grinder_maintenance_details"] = {
            v.get("grinderName", k): {
                "task":          k,  # grinder_<id> — used by the card to mark cleaning done
                "status":        v.get("status"),
                "days_since":    v.get("daysSince"),
                "shots_since":   v.get("shotsSince"),
                "last_date":     v.get("lastDate"),
                "pct":           v.get("pct"),
            }
            for k, v in grinder_details.items()
        }

        data["preheat_ready"]              = bool(preheat.get("ready"))
        data["preheat_elapsed"]            = preheat.get("elapsed")
        data["preheat_remaining"]          = preheat.get("remaining")
        data["machine_temperature"]        = preheat.get("temp")
        data["machine_target_temperature"] = preheat.get("targetTemp")

        # Profile selector data
        data["profile_options"]  = profiles_data.get("options") or []
        data["current_profile"]  = profiles_data.get("current")
        data["profile_options_raw"] = profiles_data.get("optionsRaw") or []

        # Recent shots (last 10, compact) — exposed as machine_status attribute for card navigation
        recent: list[dict] = []
        for s in reversed(shots[-10:]):
            s_ann  = s.get("annotation") or {}
            s_dp   = s.get("datapoints") or {}
            s_pres = s_dp.get("pressure") or []
            s_temp = s_dp.get("temperature") or []
            s_dur  = s_dp.get("timeInShot") or []
            s_wt   = s_dp.get("shotWeight") or s_dp.get("weight") or []
            s_flow = s_dp.get("pumpFlow") or s_dp.get("weightFlow") or []
            s_dose = s_ann.get("dose")
            s_ratio = None
            if s_wt and s_dose:
                try:
                    s_ratio = round(float(s_wt[-1] / 10) / float(s_dose), 2)
                except (ValueError, ZeroDivisionError):
                    pass
            # Compact downsampled curves for the Lovelace card chart (max 40 pts each, ×10 ints)
            s_dp_small: dict | None = {
                k: _ds(v) for k, v in [("p", s_pres), ("t", s_temp), ("w", s_wt), ("f", s_flow)] if v
            } or None
            recent.append({
                "id":       s.get("id"),
                "ts":       s.get("timestamp"),
                "profile":  s.get("profileName") or (s.get("profile") or {}).get("name"),
                "coffee":   s_ann.get("coffee"),
                "duration": round(s_dur[-1] / 10, 1) if s_dur else None,
                "yield_g":  round(s_wt[-1] / 10, 1) if s_wt else None,
                "ratio":    s_ratio,
                "pressure": round(sum(s_pres) / len(s_pres) / 10, 2) if s_pres else None,
                "rating":     int(s_ann["rating"]) if s_ann.get("rating") else None,
                "drink_type": drink_lookup.get(s_ann.get("drinkType", "")) or None,
                "score":      _calc_shot_score(s_pres, s_temp, s_wt, s_dur, s_ratio),
                "dp":         s_dp_small,
            })
        data["recent_shots"] = recent

        return data
