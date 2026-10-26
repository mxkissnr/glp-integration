// GLP-SHARED visual card editor normaliser imported by both cards (Shot Card
// and Order Card).
//
// Home Assistant's visual editor produces values in a different shape than
// YAML: a text field the user cleared is '', the theme dropdown says 'none'
// and the multi-line gradient field yields one string instead of an array.
// `setConfig()` normalises with this before it validates or stores anything,
// so every reader of a card's config keeps seeing the YAML shape.
//
// `textKeys` names the options that come from text selectors; the theme
// dropdown and the multi-line gradient are handled for both cards alike.

export function normalizeFormConfig<T extends object>(config: T, textKeys: readonly string[]): T {
  const out: Record<string, unknown> = { ...(config as unknown as Record<string, unknown>) };
  for (const key of textKeys) {
    const value = out[key];
    if (typeof value === 'string' && value.trim() === '') delete out[key];
  }
  if (out.theme === 'none') delete out.theme;
  const gradient = out.accent_gradient;
  if (typeof gradient === 'string') {
    // The multi-line text field yields one string, the YAML option an array.
    const stops = gradient.split(/[\s,]+/).filter(Boolean);
    if (stops.length > 0) out.accent_gradient = stops;
    else delete out.accent_gradient;
  }
  return out as unknown as T;
}
