"""Coerces the Gaggiuino REST API's inconsistent boolean representation
(#109 review follow-up, live-verified against gaggiuino/gaggiuino.github.io's
docs/rest-api/rest-api.md): most settings fields are real JSON booleans, but
several come back as the JSON *strings* `"true"`/`"false"` instead --
`boiler.brewDeltaState`/`dreamSteamState`, `display.lcdDarkMode` (note:
`lcdCloseOnBrewOff`/`simpleUI` in that same category ARE real booleans),
`scales.forcePredictive`/`hwScalesEnabled`/`btScalesEnabled`, and
`led.state`/`disco`.

`bool("false")` is `True` in Python (any non-empty string is truthy), so
switch.py/light.py reading one of the string-typed fields with a plain
`bool(...)` cast showed permanently ON regardless of what the machine
actually reported. `releaseChannel` (select.py's GlpReleaseChannelSelect)
and every number.py field are confirmed plain JSON numbers in the same
docs, not affected by this.
"""
from __future__ import annotations


def coerce_gaggiuino_bool(value: object) -> bool | None:
    """Return the intended bool for a Gaggiuino settings field that may be
    a real bool or the string "true"/"false" -- None if missing or not
    recognizable as either, so callers can distinguish "off" from
    "unknown" rather than silently defaulting to one."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
    return None


def encode_gaggiuino_bool(value: bool, *, like: object) -> bool | str:
    """Write `value` back in whatever representation this same field used
    on read (`like`) -- some fields want a JSON bool, others want the
    string "true"/"false" (see module docstring). Matching what came back
    keeps the read-modify-write settings payload internally consistent
    instead of guessing which type a given field expects; defaults to a
    real bool if the field wasn't present to compare against."""
    if isinstance(like, str):
        return "true" if value else "false"
    return value
