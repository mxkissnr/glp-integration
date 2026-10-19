"""Boiler/display/LED setpoint numbers for the Gaggiuino machine (#109) --
hass-gaggiuino parity. Every entry writes back the full settings category
payload (read-modify-write) since the add-on's per-category POST replaces
the whole category, not just the changed field -- see light.py's docstring
for the same note on the write semantics.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from homeassistant.components.number import NumberEntity, NumberEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory, UnitOfTemperature, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import GlpEntity
from .settings_coordinator import GlpSettingsCoordinator


@dataclass(frozen=True)
class GlpNumberDescription(NumberEntityDescription):
    category: str = ""
    # Dot-path within the category payload -- a single field name, or
    # "parent.field" for one level of nesting (tof.min/tof.max in `led`).
    data_path: tuple[str, ...] = field(default_factory=tuple)


NUMBERS: tuple[GlpNumberDescription, ...] = (
    GlpNumberDescription(
        key="steam_set_point",
        category="boiler",
        data_path=("steamSetPoint",),
        name="Steam Set Point",
        icon="mdi:kettle-steam",
        entity_category=EntityCategory.CONFIG,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        native_min_value=100,
        native_max_value=160,
        native_step=1,
    ),
    GlpNumberDescription(
        key="offset_temp",
        category="boiler",
        data_path=("offsetTemp",),
        name="Offset Temperature",
        icon="mdi:thermometer",
        entity_category=EntityCategory.CONFIG,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        native_min_value=-10,
        native_max_value=10,
        native_step=0.5,
    ),
    GlpNumberDescription(
        key="hpwr",
        category="boiler",
        data_path=("hpwr",),
        name="Heating Power",
        icon="mdi:flash",
        entity_category=EntityCategory.CONFIG,
        native_min_value=100,
        native_max_value=1500,
        native_step=10,
    ),
    GlpNumberDescription(
        key="main_divider",
        category="boiler",
        data_path=("mainDivider",),
        name="Main Divider",
        icon="mdi:division",
        entity_category=EntityCategory.CONFIG,
        native_min_value=1,
        native_max_value=5,
        native_step=1,
    ),
    GlpNumberDescription(
        key="brew_divider",
        category="boiler",
        data_path=("brewDivider",),
        name="Brew Divider",
        icon="mdi:division",
        entity_category=EntityCategory.CONFIG,
        native_min_value=1,
        native_max_value=5,
        native_step=1,
    ),
    GlpNumberDescription(
        key="startup_heat_delta",
        category="boiler",
        data_path=("startupHeatDelta",),
        name="Startup Heat Delta",
        icon="mdi:thermometer-plus",
        entity_category=EntityCategory.CONFIG,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        native_min_value=0,
        native_max_value=10,
        native_step=0.5,
    ),
    GlpNumberDescription(
        key="lcd_brightness",
        category="display",
        data_path=("lcdBrightness",),
        name="LCD Brightness",
        icon="mdi:brightness-6",
        entity_category=EntityCategory.CONFIG,
        native_unit_of_measurement="%",
        native_min_value=0,
        native_max_value=100,
        native_step=1,
    ),
    GlpNumberDescription(
        # Minutes, not seconds -- confirmed against gaggiuino/gaggiuino.github.io's
        # docs/rest-api/rest-api.md field notes ("Time in minutes before screen
        # sleeps"), unlike lcdGoHome below which really is seconds.
        key="lcd_sleep",
        category="display",
        data_path=("lcdSleep",),
        name="LCD Sleep Timeout",
        icon="mdi:sleep",
        entity_category=EntityCategory.CONFIG,
        native_unit_of_measurement=UnitOfTime.MINUTES,
        native_min_value=0,
        native_max_value=120,
        native_step=1,
    ),
    GlpNumberDescription(
        key="lcd_go_home",
        category="display",
        data_path=("lcdGoHome",),
        name="LCD Go Home Timeout",
        icon="mdi:home-clock",
        entity_category=EntityCategory.CONFIG,
        native_unit_of_measurement=UnitOfTime.SECONDS,
        native_min_value=0,
        native_max_value=60,
        native_step=1,
    ),
    GlpNumberDescription(
        key="led_tof_min",
        category="led",
        data_path=("tof", "min"),
        name="LED Time-of-Flight Min",
        icon="mdi:ruler",
        entity_category=EntityCategory.CONFIG,
        native_min_value=0,
        native_max_value=200,
        native_step=1,
    ),
    GlpNumberDescription(
        key="led_tof_max",
        category="led",
        data_path=("tof", "max"),
        name="LED Time-of-Flight Max",
        icon="mdi:ruler",
        entity_category=EntityCategory.CONFIG,
        native_min_value=0,
        native_max_value=200,
        native_step=1,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    settings_coordinator: GlpSettingsCoordinator = hass.data[DOMAIN][entry.entry_id]["settings"]
    async_add_entities([GlpMachineNumber(settings_coordinator, entry, d) for d in NUMBERS])


class GlpMachineNumber(GlpEntity[GlpSettingsCoordinator], NumberEntity):
    def __init__(
        self,
        coordinator: GlpSettingsCoordinator,
        entry: ConfigEntry,
        description: GlpNumberDescription,
    ) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, description.key, url=_url)
        self.entity_description = description

    @property
    def suggested_object_id(self) -> str | None:
        return self.entity_description.key

    def _settings(self) -> dict:
        return (self.coordinator.data or {}).get(self.entity_description.category) or {}

    @property
    def available(self) -> bool:
        if not super().available:
            return False
        return bool(self._settings())

    @property
    def native_value(self) -> float | None:
        value = self._settings()
        for part in self.entity_description.data_path:
            if not isinstance(value, dict):
                return None
            value = value.get(part)
        return value if isinstance(value, (int, float)) else None

    async def async_set_native_value(self, value: float) -> None:
        category = self.entity_description.category
        # Built from a fresh GET, not the up-to-30 s-old snapshot, so a change
        # made on the machine's touchscreen isn't overwritten.
        payload = dict(await self.coordinator.async_fetch_category(category))
        path = self.entity_description.data_path
        current = payload
        for part in path:
            current = current.get(part) if isinstance(current, dict) else None

        step = self.entity_description.native_step
        if (step is not None and float(step).is_integer()) or isinstance(current, int):
            new_value: float | int = int(value)
        else:
            new_value = value

        if len(path) == 1:
            payload[path[0]] = new_value
        else:
            parent_key, child_key = path
            parent = dict(payload.get(parent_key) or {})
            parent[child_key] = new_value
            payload[parent_key] = parent

        await self.coordinator.auth.post(f"/api/machine/settings/{category}", json=payload)
        await self.coordinator.async_request_refresh()
