// Shared, type-only shapes the card reads (#180). Reused by the Order Card
// where the data is the same; this module is imported with `import type` and
// emits nothing at runtime.

// ─── Home Assistant ──────────────────────────────────────────────────────────

export interface HassStateObject {
  state?: string;
  attributes: Record<string, unknown>;
}

export interface HassLocale {
  language?: string;
}

export interface HassUser {
  name: string;
  id: string;
}

// Home Assistant's active frontend theme, as the card reads it: the contrast
// pass depends on the theme's colours, so a theme or dark-mode switch is a
// reason to re-run it.
export interface HassThemes {
  selectedTheme?: string | null;
  theme?: string | null;
  darkMode?: boolean;
}

export interface Hass {
  states: Record<string, HassStateObject>;
  language?: string;
  locale?: HassLocale;
  user?: HassUser;
  themes?: HassThemes;
  callService?: (domain: string, service: string, data?: Record<string, unknown>) => unknown;
  fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
}

export interface CardConfig {
  title?: string | null;
  entity_prefix?: string | null;
  switch_entity?: string | null;
  glp_token?: string | null;
  glp_url?: string | null;
  machine?: string | null;
  theme?: string | null;
  accent_color?: string | null;
  accent_gradient?: string[] | null;
  new_badge_days?: string | null;
}

// ─── GLP app shapes ──────────────────────────────────────────────────────────

// One entry in a `*_machine_status` entity's `recent_shots[]` attribute.
export interface RecentShot {
  id?: string | number;
  ts?: string;
  profile?: string;
  coffee?: string;
  drink_type?: string;
  grinder?: string;
  grind?: string;
  duration?: number;
  yield_g?: number;
  ratio?: number;
  pressure?: number;
  rating?: number;
  score?: number;
  beanId?: number;
  dp?: { p?: number[]; t?: number[]; w?: number[]; f?: number[] };
}

// An active barista order from the integration REST proxy (/api/glp/orders).
export interface BaristaOrder {
  id: string;
  status: string;
  item: string;
  variant?: string;
  customer?: string;
  note?: string;
  eta?: number;
  acceptedAt?: number;
  createdAt?: number;
}

// One entry from the integration REST proxy (/api/glp/library/beans-info).
export interface BeanInfo {
  id?: number;
  name?: string;
  variety?: string;
  roastDate?: string;
}

// A `maintenance_grinders` attribute value.
export interface GrinderEntry {
  status?: string;
  pct?: string;
  days_since?: number;
  shots_since?: number;
  task?: string;
}

// The colour and machine-lookup shapes now live in cards/shared/types.ts;
// re-exported here so every card file keeps importing from './types.ts'.
export type { Rgb, ThemeStops, MachineTheme, MachineEntry } from '../../shared/types.ts';

export interface CustomCardConfig {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL: string;
}

declare global {
  interface Window {
    customCards?: CustomCardConfig[];
  }
}
