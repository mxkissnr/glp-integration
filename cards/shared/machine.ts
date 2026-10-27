// GLP-SHARED machine-lookup helpers imported by both cards (Shot Card and Order Card).

import { THEME_PRESETS } from './helpers.ts';
import type { MachineEntry, MachineHass, ThemeStops } from './types.ts';

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

export { matchMachineStatusEntity, appMachineEntry, appMachineTheme, appMachineType };
