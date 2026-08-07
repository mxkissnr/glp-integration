import logging
from datetime import UTC, datetime, timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .auth import GlpAuth
from .const import DOMAIN, SCAN_INTERVAL_SECONDS

_LOGGER = logging.getLogger(__name__)


def _ds(arr: list, n: int = 40) -> list:
    """Downsample a list to at most *n* evenly-spaced items (last item always kept)."""
    if len(arr) <= n:
        return arr
    step = (len(arr) - 1) / (n - 1)
    return [arr[round(i * step)] for i in range(n)]


# Shot score is computed by the app (single source of truth) and served per shot;
# the coordinator just reads it — see lib/score.js in the add-on.


def _parse_ts(value: object) -> datetime | None:
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            # GLP timestamps are Unix seconds; values > 1e10 are ms
            ts = value / 1000 if value > 1e10 else value
            return datetime.fromtimestamp(ts, tz=UTC)
        s = str(value)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except Exception:
        return None


class GlpDataCoordinator(DataUpdateCoordinator):
    def __init__(
        self,
        hass: HomeAssistant,
        session: aiohttp.ClientSession,
        url: str,
        scan_interval: int = SCAN_INTERVAL_SECONDS,
        auth: GlpAuth | None = None,
    ):
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self._session = session
        self._url     = url.rstrip("/")
        self.auth     = auth or GlpAuth(session, url)
        self._last_shot_id: int | None = None

    async def _async_update_data(self) -> dict:
        try:
            async with self._session.get(f"{self._url}/api/status", timeout=aiohttp.ClientTimeout(total=10)) as r:
                r.raise_for_status()
                status = await r.json()

            headers = await self.auth.headers()

            async with self._session.get(
                f"{self._url}/shots.json", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                r.raise_for_status()
                shots = await r.json()

        except Exception as err:
            raise UpdateFailed(f"GLP unreachable: {err}") from err

        try:
            async with self._session.get(
                f"{self._url}/api/maintenance", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                r.raise_for_status()
                maintenance = await r.json()
        except Exception:
            maintenance = {}

        try:
            async with self._session.get(
                f"{self._url}/api/preheat", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                r.raise_for_status()
                preheat = await r.json()
        except Exception:
            preheat = {}

        try:
            async with self._session.get(
                f"{self._url}/api/machine/profiles", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                r.raise_for_status()
                profiles_data = await r.json()
        except Exception:
            profiles_data = {}

        try:
            async with self._session.get(
                f"{self._url}/api/menu", headers=headers, timeout=aiohttp.ClientTimeout(total=5)
            ) as r:
                menu_items = await r.json() if r.status < 400 else []
        except Exception:
            menu_items = []

        try:
            async with self._session.get(
                f"{self._url}/api/version", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                version_info = await r.json() if r.status < 400 else {}
        except Exception:
            version_info = {}

        # Machine firmware update check (#125, gaggiuino-local-profiler#620
        # Phase 1). 501 on a non-Gaggiuino adapter (e.g. GaggiMate, no
        # settingsProxy support) or any other failure both fall back to {},
        # same "no data -> entity goes unavailable" pattern used elsewhere
        # in this coordinator.
        try:
            async with self._session.get(
                f"{self._url}/api/machine/firmware/version", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
            ) as r:
                firmware_info = await r.json() if r.status < 400 else {}
        except Exception:
            firmware_info = {}
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
            # Whether the physical Gaggiuino machine itself is reachable behind the
            # add-on (distinct from "machine_status", which reflects the add-on's
            # own sync-link health) -- see #106. Sensors sourced from live machine
            # values opt into going unavailable on this via
            # GlpSensorDescription.requires_machine_reachable.
            "machine_reachable":   bool(status.get("machineReachable")),
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
            # Multi-machine registry (#47, mirrors the app's additive
            # GET /api/status "machines" array added in GLP #317). Every
            # other field in `data` still describes only the default
            # machine, unchanged — this is purely additive.
            "machines":            status.get("machines") or [],
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
        data["preheat_ready_by_target_at"]   = _parse_ts(preheat.get("readyByTargetAt"))
        data["preheat_planned_switch_on_at"] = _parse_ts(preheat.get("plannedSwitchOnAt"))

        # Version / update info
        data["version_current"]        = version_info.get("current")
        data["version_latest"]         = version_info.get("latest")
        data["version_update_available"] = bool(version_info.get("update_available"))
        data["version_release_url"]    = version_info.get("release_url")

        # Machine firmware version / update info (#125)
        data["firmware_installed"]        = firmware_info.get("installed")
        data["firmware_latest"]           = firmware_info.get("latest")
        data["firmware_update_available"] = bool(firmware_info.get("updateAvailable"))
        data["firmware_release_url"]      = firmware_info.get("releaseUrl")

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
                "beanId":   s_ann.get("beanId"),
                "grinder":  s_ann.get("grinder"),
                "grind":    s_ann.get("grindSetting"),
                "duration": round(s_dur[-1] / 10, 1) if s_dur else None,
                "yield_g":  round(s_wt[-1] / 10, 1) if s_wt else None,
                "ratio":    s_ratio,
                "pressure": round(sum(s_pres) / len(s_pres) / 10, 2) if s_pres else None,
                "rating":     int(s_ann["rating"]) if s_ann.get("rating") else None,
                "drink_type": drink_lookup.get(s_ann.get("drinkType", "")) or None,
                "score":      s.get("score"),
                "dp":         s_dp_small,
            })
        data["recent_shots"] = recent

        return data
