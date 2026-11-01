// GLP-SHARED colour and machine types imported by both cards (Shot Card and Order Card).

// An [r, g, b] triple (0-255) resolved from a CSS colour string.
export type Rgb = [number, number, number];

// A resolved two-stop accent colour pair, as returned by appMachineTheme().
export interface ThemeStops {
  a: string;
  b: string;
}

export interface MachineTheme {
  preset?: string;
  a: string;
  b: string;
}

// One entry in a *_machine_status entity's `machines[]` attribute, as
// forwarded verbatim from the app's GET /api/status (gaggiuino-local-profiler#701).
export interface MachineEntry {
  id?: string;
  name?: string;
  isDefault?: boolean;
  type?: string;
  theme?: MachineTheme;
}

// The minimal `hass` shape the machine lookups read: both cards' own Hass
// types are structurally compatible with it.
export interface MachineHass {
  states: Record<string, { attributes?: Record<string, unknown> }>;
  // Home Assistant's entity and device registries (frontend `hass.entities` /
  // `hass.devices`). Both are optional: a test or an older frontend may only
  // provide `states`, and the lookups then fall back to names (#323).
  entities?: Record<string, MachineRegistryEntry>;
  devices?: Record<string, MachineDeviceEntry>;
}

// One entry of the entity registry, as much as the machine lookup reads.
export interface MachineRegistryEntry {
  entity_id?: string;
  platform?: string;
  translation_key?: string | null;
  device_id?: string | null;
}

// One entry of the device registry, as much as the machine lookup reads.
export interface MachineDeviceEntry {
  name?: string | null;
  name_by_user?: string | null;
}

