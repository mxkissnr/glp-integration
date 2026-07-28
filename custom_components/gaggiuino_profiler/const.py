DOMAIN = "gaggiuino_profiler"
DEFAULT_URL = "http://localhost:8099"
SCAN_INTERVAL_SECONDS = 60
LIVE_INTERVAL_SECONDS = 2
CONF_SCAN_INTERVAL = "scan_interval"

# The add-on's config.yaml slug -- shared between config_flow.py (Supervisor
# add-on discovery, #78/#75) and auth.py (trusting the add-on's own internal
# hostname, #75) so both derive it from one place.
ADDON_SLUG = "gaggiuino_local_profiler"
