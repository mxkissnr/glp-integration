DOMAIN = "gaggiuino_profiler"
DEFAULT_URL = "http://localhost:8099"
SCAN_INTERVAL_SECONDS = 60
LIVE_INTERVAL_SECONDS = 2
# #708/#736: GlpLiveCoordinator's REST poll of /api/live/data is now a
# fallback safety net behind the SSE `live-snapshot` push (GET /api/events) --
# it skips its own poll tick and returns the cached data unchanged whenever a
# SSE event arrived more recently than this many seconds ago. The app's live
# poll ticks every 1s while the machine is on, so this is a generous multiple
# of that (a few missed ticks, not a hair-trigger), while still being well
# under LIVE_INTERVAL_SECONDS' own polling cadence times a handful of ticks.
LIVE_SSE_STALE_SECONDS = 5
CONF_SCAN_INTERVAL = "scan_interval"

# The add-on's config.yaml slug -- shared between config_flow.py (Supervisor
# add-on discovery, #78/#75) and auth.py (trusting the add-on's own internal
# hostname, #75) so both derive it from one place.
ADDON_SLUG = "gaggiuino_local_profiler"
