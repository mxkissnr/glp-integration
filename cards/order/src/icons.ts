// Drawn icon geometry plus the menu-icon helper for the Order Card. The
// GLP-SHARED machine icon and ICONS lookup now live in cards/shared/icons.ts
// and are re-exported here.

import { _esc } from './helpers.ts';
import { GLP_ICON_PATHS, ICONS, MACHINE_BODY, MACHINE_ICON_MINI } from '../../shared/icons.ts';

// `emoji` on a menu entry is a PERSISTED DATA FIELD, not styling — it's
// defined app-side in DEFAULT_MENU (gaggiuino-local-profiler lib/constants.js)
// and writable through POST/PUT api/orders/menu, so it stays exactly as-is,
// no migration. This only changes how it renders: the six default drinks
// (espresso/ristretto/lungo/cappuccino/latte/flat_white — the only ids that
// exist in GLP_ICON_PATHS) get a drawn icon instead; any other id — a
// user-created entry, whose id is always `m_${Date.now()}` server-side and
// so can never collide with the six known ones — falls back to that entry's
// own stored emoji character, escaped the same way any other user-supplied
// text reaching innerHTML is.
function _menuIconHtml(item: { id?: string; emoji?: string } | null | undefined): string {
  return ICONS.of(item?.id as string) || _esc(item?.emoji);
}

export { MACHINE_BODY, MACHINE_ICON_MINI, GLP_ICON_PATHS, ICONS, _menuIconHtml };
