import asyncio
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


def _num(value: object, cast):
    """Coerce an upstream value, returning None instead of raising (#237)."""
    try:
        return cast(value)
    except (TypeError, ValueError):
        return None


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
        # #191: last /api/machine/firmware/version payload that actually carried
        # an "installed" coreVersion. The machine is powered off most of the
        # time here, and the add-on 502s that endpoint (or drops "installed")
        # whenever it can't reach the machine -- without this the firmware
        # update entity flips to "Unknown" on every brief outage.
        self._last_firmware: dict = {}
        # None until the app proves it supports /shots.json?limit and
        # X-Shots-Today; False switches all later polls to the full list.
        self._shots_limit_supported: bool | None = None

    async def _fetch_status(self, headers: dict) -> dict:
        async with self._session.get(
            f"{self._url}/api/status", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
        ) as r:
            if r.status == 401:
                # The app handed out a new token (reinstall/restore): drop the
                # cached one so the next poll of any coordinator fetches it.
                self.auth.invalidate()
            r.raise_for_status()
            return await r.json()

    async def _fetch_shots_request(self, headers: dict, *, limited: bool) -> tuple[list, str | None]:
        path = "/shots.json?limit=10" if limited else "/shots.json"
        async with self._session.get(
            f"{self._url}{path}", headers=headers, timeout=aiohttp.ClientTimeout(total=10)
        ) as r:
            r.raise_for_status()
            return await r.json(), r.headers.get("X-Shots-Today")

    async def _fetch_shots(self, headers: dict) -> tuple[list, int | None]:
        limited = self._shots_limit_supported is not False
        shots, header = await self._fetch_shots_request(headers, limited=limited)
        if header is not None:
            try:
                return shots, int(header)
            except (TypeError, ValueError):
                pass
        # Older app (no X-Shots-Today / limit support): keep counting the full
        # list client-side, and request it without limit from now on. Re-fetch
        # once now so the very first shots_today value is already correct.
        self._shots_limit_supported = False
        if limited:
            shots, _ = await self._fetch_shots_request(headers, limited=False)
        return shots, None

    async def _fetch_optional(
        self,
        headers: dict,
        path: str,
        default,
        *,
        timeout: int = 10,
        status_ok_only: bool = False,
    ):
        try:
            async with self._session.get(
                f"{self._url}{path}", headers=headers, timeout=aiohttp.ClientTimeout(total=timeout)
            ) as r:
                if status_ok_only:
                    return await r.json() if r.status < 400 else default
                r.raise_for_status()
                return await r.json()
        except Exception:
            return default

    async def _async_update_data(self) -> dict:
        try:
            headers = await self.auth.headers()

            # #170: /api/status must carry the auth header too -- the add-on
            # gates its whole `sensitive` response object (switch_entity,
            # machineUrl, lastSyncError, ...) behind req.glpAuthenticated,
            # which requires X-GLP-Token. Without it switch_entity never
            # reaches machine_status's attributes, so the bundled Lovelace
            # cards can never detect the machine being off or show the power
            # toggle.

            # All independent GETs run concurrently; /api/status and
            # /shots.json stay mandatory (UpdateFailed), the rest keep their
            # per-request fallbacks.
            (
                status,
                (shots, shots_today_header),
                maintenance,
                preheat,
                profiles_data,
                menu_items,
                version_info,
                firmware_info,
            ) = await asyncio.gather(
                self._fetch_status(headers),
                self._fetch_shots(headers),
                self._fetch_optional(headers, "/api/maintenance", {}),
                self._fetch_optional(headers, "/api/preheat", {}),
                self._fetch_optional(headers, "/api/machine/profiles", {}),
                self._fetch_optional(headers, "/api/menu", [], timeout=5, status_ok_only=True),
                self._fetch_optional(headers, "/api/version", {}, status_ok_only=True),
                # Machine firmware update check (#125, gaggiuino-local-profiler#620
                # Phase 1). 501 on a non-Gaggiuino adapter (e.g. GaggiMate, no
                # settingsProxy support) or any other failure both fall back to {},
                # same "no data -> entity goes unavailable" pattern used elsewhere
                # in this coordinator.
                self._fetch_optional(
                    headers, "/api/machine/firmware/version", {}, status_ok_only=True
                ),
            )
        except Exception as err:
            raise UpdateFailed(f"GLP unreachable: {err}") from err

        drink_lookup: dict[str, str] = {
            m["id"]: f"{m.get('emoji', '')} {m['name']}".strip()
            for m in menu_items if m.get("id") and m.get("name")
        }

        last = shots[-1] if shots else {}
        ann  = last.get("annotation") or {}

        dp       = last.get("datapoints") or {}
        pressure = dp.get("pressure") or []
        duration = dp.get("timeInShot") or []

        pressure_nums = [v for p in pressure if (v := _num(p, float)) is not None]
        avg_pressure = round(sum(pressure_nums) / len(pressure_nums) / 10, 2) if pressure_nums else None
        last_duration = _num(duration[-1], float) if duration else None
        duration_s   = round(last_duration / 10, 1) if last_duration is not None else None

        dose  = ann.get("dose")
        yield_g = None
        ratio   = None
        weight_arr = dp.get("shotWeight") or dp.get("weight") or []
        last_weight = _num(weight_arr[-1], float) if weight_arr else None
        if last_weight is not None:
            yield_g = round(last_weight / 10, 1)
        if dose and yield_g:
            dose_f = _num(dose, float)
            if dose_f:
                ratio = round(float(yield_g) / dose_f, 2)

        current_shot_id = last.get("id")

        now_local  = dt_util.now()
        today_date = now_local.date()
        # X-Shots-Today counts in the app's local timezone, the fallback below
        # counts in HA's timezone. On a standard HA OS install both are the same.
        if shots_today_header is not None:
            shots_today = shots_today_header
        else:
            shots_today = sum(
                1 for s in shots
                if (ts := _parse_ts(s.get("timestamp"))) is not None
                and ts.astimezone(now_local.tzinfo).date() == today_date
            )

        data = {
            # #667: machine_reachable is False is the strongest, most direct signal
            # (mirrors the app's own status.js dot logic since #655) -- only fall
            # back to lastSyncError (the add-on's own sync-link health) when
            # reachability is unknown/true, so an add-on predating #106 (no
            # "machineReachable" key, i.e. None here) keeps its old behavior.
            "machine_status": (
                "error" if status.get("machineReachable") is False or status.get("lastSyncError") else "online"
            ),
            # Whether the physical Gaggiuino machine itself is reachable behind the
            # add-on -- see #106. Sensors sourced from live machine values opt into
            # going unavailable on this via GlpSensorDescription.requires_machine_reachable
            # (a separate mechanism from machine_status above, which only affects
            # entity availability, not its state value).
            "machine_reachable":   bool(status.get("machineReachable")),
            "switch_entity":       status.get("switchEntity") or None,
            "shot_count":          status.get("shotCount", 0),
            "shots_today":         shots_today,
            "last_shot_id":        current_shot_id,
            "last_shot_profile":   last.get("profileName") or (last.get("profile") or {}).get("name"),
            "last_shot_rating":    _num(ann.get("rating"), int),
            "last_shot_date":      _parse_ts(last.get("timestamp")),
            "last_shot_duration":  duration_s,
            "last_shot_pressure":  avg_pressure,
            "last_shot_weight":    yield_g,
            "last_shot_ratio":     ratio,
            "last_shot_coffee":    ann.get("coffee"),
            "last_shot_grinder":   ann.get("grinder"),
            "last_shot_dose":      _num(dose, float) if dose else None,
            "last_sync":           _parse_ts(status.get("lastSync")),
            "machine_url":         status.get("machineHostname"),
            # Multi-machine registry (#47, mirrors the app's additive
            # GET /api/status "machines" array added in GLP #317). Every
            # other field in `data` still describes only the default
            # machine, unchanged — this is purely additive.
            "machines":            status.get("machines") or [],
        }

        previous_shot_id = _num(self._last_shot_id, int)
        new_shot_id = _num(current_shot_id, int)
        shot_id_increased = (
            new_shot_id > previous_shot_id
            if new_shot_id is not None and previous_shot_id is not None
            else current_shot_id != self._last_shot_id
        )
        if current_shot_id and shot_id_increased and self._last_shot_id is not None:
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
        # A GaggiMate in standby is reachable but reports ready=false, elapsed=0
        # and the full preheat time as remaining; a missing key (older app
        # versions, Gaggiuino) means not in standby (#219).
        data["machine_standby"]            = bool(preheat.get("standby"))
        # While in standby those two counters are frozen, so expose them as
        # unknown instead of the app's full/zero placeholder values (#219).
        data["preheat_elapsed"]            = None if data["machine_standby"] else preheat.get("elapsed")
        data["preheat_remaining"]          = None if data["machine_standby"] else preheat.get("remaining")
        data["machine_temperature"]        = preheat.get("temp")
        data["machine_target_temperature"] = preheat.get("targetTemp")
        data["preheat_ready_by_target_at"]   = _parse_ts(preheat.get("readyByTargetAt"))
        data["preheat_planned_switch_on_at"] = _parse_ts(preheat.get("plannedSwitchOnAt"))

        # Version / update info
        data["version_current"]        = version_info.get("current")
        data["version_latest"]         = version_info.get("latest")
        data["version_update_available"] = bool(version_info.get("update_available"))
        data["version_release_url"]    = version_info.get("release_url")

        # Machine firmware version / update info (#125). #191: keep the last
        # payload that carried a real "installed" coreVersion -- a failed or
        # machine-unreachable fetch (firmware_info == {}) must not null out a
        # previously known firmware version.
        if firmware_info.get("installed"):
            self._last_firmware = firmware_info
        else:
            firmware_info = self._last_firmware or firmware_info
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
            s_weight = _num(s_wt[-1], float) if s_wt else None
            s_dose_f = _num(s_dose, float) if s_dose else None
            if s_weight is not None and s_dose_f:
                s_ratio = round((s_weight / 10) / s_dose_f, 2)
            s_duration = _num(s_dur[-1], float) if s_dur else None
            s_pres_nums = [v for p in s_pres if (v := _num(p, float)) is not None]
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
                "duration": round(s_duration / 10, 1) if s_duration is not None else None,
                "yield_g":  round(s_weight / 10, 1) if s_weight is not None else None,
                "ratio":    s_ratio,
                "pressure": round(sum(s_pres_nums) / len(s_pres_nums) / 10, 2) if s_pres_nums else None,
                "rating":     _num(s_ann.get("rating"), int),
                "drink_type": drink_lookup.get(s_ann.get("drinkType", "")) or None,
                # Coerced like every sibling above, but via isinstance rather than a
                # bare int(): a non-numeric value here would come from a source we do
                # not control, and raising would take down the whole coordinator
                # refresh. Dropping it to None fails closed instead.
                "score":      int(s["score"]) if isinstance(s.get("score"), (int, float)) else None,
                "dp":         s_dp_small,
            })
        data["recent_shots"] = recent

        return data
