// Home Assistant and GLP app shapes the card reads (#143). Type-only: this
// module is imported with `import type` and emits nothing at runtime.

export interface HassStateObject {
  state?: string;
  attributes: Record<string, unknown>;
}

export interface HassUser {
  name: string;
  id: string;
}

export interface Hass {
  states: Record<string, HassStateObject>;
  user?: HassUser;
  language?: string;
  fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
}

export interface CardConfig {
  title?: string | null;
  switch_entity?: string | null;
  glp_token?: string | null;
  glp_url?: string | null;
  machine?: string | null;
  theme?: string | null;
  accent_color?: string | null;
  accent_gradient?: string[] | null;
  new_badge_days?: string | null;
}

export interface MachineTheme {
  preset?: string;
  a: string;
  b: string;
}

export interface MachineEntry {
  id?: string;
  name?: string;
  isDefault?: boolean;
  type?: string;
  theme?: MachineTheme;
}

export interface ThemeStops {
  a: string;
  b: string;
}

export interface MenuItem {
  name: string;
  id?: string;
  emoji?: string;
  trending?: boolean;
  useBeans?: boolean;
  variants?: string[];
  createdAt?: number;
}

export interface Origin {
  code?: string;
  percent?: number;
}

export interface Bean {
  id?: number;
  name: string;
  decaf?: boolean;
  category?: string;
  notes?: string;
  variety?: string;
  process?: string;
  origin?: string;
  origins: Origin[];
}

export interface Order {
  id: string;
  item: string;
  variant?: string;
  status: string;
  machine?: string;
  acceptedAt: number;
  eta: number;
  completedAt?: number;
  shotId?: string;
  declineReason?: string;
}

export interface Shot {
  profile?: { name?: string };
  profileName?: string;
  duration?: number;
  datapoints?: Record<string, number[] | undefined>;
}

export interface ShotSeries {
  key: string;
  scale: number;
  axis: string;
  color: string;
  label: string;
  vals: number[];
}

export interface QueueEta {
  positions?: Record<string, { position: number; suggestedEta: number }>;
}

// An [r, g, b] triple (0-255) resolved from a CSS colour string.
export type Rgb = [number, number, number];

// _getVariantsGrouped() returns either a flat list or the two bean sections.
// The optional `never` fields let call sites narrow with `if (grouped.flat)`
// without a runtime change.
export type GroupedVariants =
  | { flat?: never; speciality: string[]; normal: string[] }
  | { flat: string[]; speciality?: never; normal?: never };

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
