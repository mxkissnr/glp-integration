// GLP-SHARED machine-lookup helpers imported by both cards (Shot Card and Order Card).

import { THEME_PRESETS } from './helpers.ts';
import type { MachineEntry, MachineHass, MachineRegistryEntry, ThemeStops } from './types.ts';

// True when `id` carries `<needleSlug>_machine_status` as a whole token — the
// slug starts the object id, or another underscore precedes it. "Kitchen" then
// matches sensor.kitchen_machine_status but not sensor.kitchen_2_machine_status,
// which a plain `includes` would.
function hasExactStatusId(id: string, needleSlug: string): boolean {
  const lower = id.toLowerCase();
  const suffix = `${needleSlug}_machine_status`;
  if (!lower.endsWith(suffix)) return false;
  if (lower.length === suffix.length) return true;
  const boundary = lower[lower.length - suffix.length - 1];
  return boundary === '.' || boundary === '_';
}

// True when the friendly name is exactly this machine's status name — the
// needle alone, or the needle plus the English " Machine Status" tail, which
// is the only tail we can recognise (other languages are translated). A bare
// prefix match would make "Kitchen 2 Machine Status" answer for "Kitchen".
function hasExactFriendlyName(id: string, hass: MachineHass, needle: string): boolean {
  const friendly = String(hass.states[id]?.attributes?.friendly_name ?? '').toLowerCase();
  return friendly === needle || friendly === `${needle} machine status`;
}

// Picks the *_machine_status entity matching this card's configured
// `machine` — the same "name or id" needle way both cards have always
// matched it: the entity's friendly_name contains the needle, or its id
// contains the same needle slugified. An exact match wins first, so a
// machine called "Kitchen" cannot resolve to another machine's "Kitchen 2"
// just by coming first in hass.states; the contains-match stays as the
// fallback that keeps existing setups (and partial names) working. What each
// card does with the match (a prefix here, the raw entity id there) stays
// with the caller.
function matchMachineStatusEntity(
  hass: MachineHass,
  candidates: string[],
  machine: unknown,
): string | undefined {
  const needle = String(machine).toLowerCase();
  const needleSlug = needle.replace(/\s+/g, '_');
  const exact = candidates.find(id =>
    hasExactStatusId(id, needleSlug) || hasExactFriendlyName(id, hass, needle));
  if (exact) return exact;
  return candidates.find(id =>
    (hass.states[id]?.attributes?.friendly_name as string)?.toLowerCase().includes(needle) ||
    id.toLowerCase().includes(needleSlug));
}

// Reads this card's own machine's entry out of `hass` state's `machines[]`
// array, or null when unavailable (no app-side sync yet, e.g. a card's
// zero-config/standalone mode).
// glp-integration forwards every machine's attributes verbatim off the
// app's GET /api/status `machines[]` (gaggiuino-local-profiler#701): any
// `*_machine_status`-suffixed entity carries the WHOLE array (every
// machine, not just the default one) as its `machines` attribute, so any
// one such entity is enough regardless of which machine this card
// instance represents. Matched against the configured `machine` the same
// "name or id" needle way the machine-status-entity matching works,
// falling back to the isDefault entry when unconfigured. Shared by
// appMachineTheme() (theme colours) and appMachineType() (machine body
// shape for MACHINE_ICON_MINI, mxkissnr/glp-lovelace-card#127 /
// mxkissnr/glp-order-card#97) so both read the one resolved entry instead
// of duplicating the lookup.
function appMachineEntry(hass: MachineHass | null | undefined, machine: unknown): MachineEntry | null | undefined {
  if (!hass) return null;
  const statusIds = Object.keys(hass.states).filter(id => id.endsWith('_machine_status'));
  let machines: MachineEntry[] | null = null;
  for (const id of statusIds) {
    const list = hass.states[id]?.attributes?.machines;
    if (Array.isArray(list)) { machines = list; break; }
  }
  if (!machines) return null;
  let entry: MachineEntry | null | undefined = null;
  if (machine) {
    const needle = String(machine).toLowerCase();
    entry = machines.find(m =>
      String(m.name || '').toLowerCase() === needle || String(m.id) === needle);
  }
  if (!entry) entry = machines.find(m => m.isDefault) || null;
  return entry;
}

function appMachineTheme(entry: MachineEntry | null | undefined): ThemeStops | null {
  const theme = entry?.theme;
  if (!theme) return null;
  if (typeof theme.preset === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, theme.preset)) {
    return THEME_PRESETS[theme.preset as keyof typeof THEME_PRESETS];
  }
  // Inline literal regex rather than either card's own hex-validation
  // helper, so this module stays independent of what that helper is named.
  if (/^#[0-9a-fA-F]{6}$/.test(theme.a) && /^#[0-9a-fA-F]{6}$/.test(theme.b)) {
    return { a: theme.a, b: theme.b };
  }
  return null;
}

// Machine type ('gaggiuino' | 'gaggimate') for MACHINE_BODY/MACHINE_ICON_MINI's
// badge shape. Defaults to 'gaggiuino' when unresolved/unrecognized, same
// backward-compatible default MACHINE_BODY itself falls back to.
function appMachineType(entry: MachineEntry | null | undefined): 'gaggiuino' | 'gaggimate' {
  const type = entry?.type;
  return type === 'gaggimate' ? 'gaggimate' : 'gaggiuino';
}

// The *_machine_status entity ids this integration registers, read from Home
// Assistant's entity registry (frontend `hass.entities`). Sorted, so the
// "no `machine` configured" pick does not depend on object insertion order.
// Entities without a state are left out: a disabled or not-yet-added entity
// cannot be this card's machine, and its attributes are unreadable.
function registryMachineStatusEntities(hass: MachineHass): MachineRegistryEntry[] {
  const entities = hass.entities;
  if (!entities) return [];
  return Object.values(entities)
    .filter(e =>
      e?.platform === 'gaggiuino_profiler' && e.translation_key === 'machine_status' &&
      Boolean(e.entity_id) && Boolean(hass.states[String(e.entity_id)]))
    .sort((a, b) => String(a.entity_id).localeCompare(String(b.entity_id)));
}

// The device's display name: the user's rename wins over the integration's
// own name, exactly as Home Assistant composes an entity's friendly name.
function registryDeviceName(hass: MachineHass, entry: MachineRegistryEntry): string {
  const device = entry.device_id ? hass.devices?.[entry.device_id] : undefined;
  return String(device?.name_by_user ?? device?.name ?? '');
}

// Picks this card's *_machine_status entity id.
//
// The entity registry is the primary source (#323): Home Assistant 2026.11
// composes entity names from device + entity name, lets a user mark a "main
// entity" (which then shows only the device name) and plans to deprecate
// friendly_name, so a translated or renamed entity no longer carries a name
// the cards can match on. `translation_key="machine_status"` identifies the
// sensor independently of any name.
//
// Matching a configured `machine` runs in that order: the device's name
// (renamed devices included) first, then the pre-existing name/id match over
// the registered ids — exact id or friendly name, then the contains-match.
// An unmatched `machine` still ends on a real machine (the first
// Gaggiuino-named status entity, else the first registration), so a stale or
// misspelt option never leaves the card without one. Without `machine` the
// first registration in entity-id order answers, which is the same
// single-machine setup the cards used to find by name.
//
// Without a registry (an older frontend, or a test that only seeds `states`)
// both cards keep their previous friendly-name behaviour unchanged.
function findMachineStatusEntity(
  hass: MachineHass | null | undefined,
  machine?: unknown,
  candidates?: string[],
): string | undefined {
  if (!hass) return undefined;
  const registered = registryMachineStatusEntities(hass);
  const [first] = registered;
  if (first) {
    if (!machine) return first.entity_id;
    const needle = String(machine).toLowerCase();
    const byDevice = registered.find(e => registryDeviceName(hass, e).toLowerCase() === needle);
    if (byDevice) return byDevice.entity_id;
    return matchByFriendlyName(hass, machine, registered.map(e => String(e.entity_id)));
  }
  return matchByFriendlyName(hass, machine, candidates);
}

// The pre-#323 name match, unchanged: a configured `machine` goes through
// matchMachineStatusEntity(), and the answer without a match (or without a
// `machine` at all) is the first Gaggiuino-named status entity, else any.
function matchByFriendlyName(hass: MachineHass, machine?: unknown, known?: string[]): string | undefined {
  const candidates = known ?? Object.keys(hass.states).filter(id => id.endsWith('_machine_status'));
  if (machine) {
    const matched = matchMachineStatusEntity(hass, candidates, machine);
    if (matched) return matched;
  }
  const found = candidates.find(id =>
    (hass.states[id]?.attributes?.friendly_name as string)?.toLowerCase().includes('gaggiuino'));
  return found || candidates[0];
}

export {
  matchMachineStatusEntity,
  findMachineStatusEntity,
  appMachineEntry,
  appMachineTheme,
  appMachineType,
};
