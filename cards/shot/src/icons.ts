// Drawn icon geometry for the Shot Card. The GLP-SHARED machine icon and
// ICONS lookup now live in cards/shared/icons.ts and are re-exported here.

import { GLP_ICON_PATHS, ICONS, MACHINE_BODY, MACHINE_ICON_MINI } from '../../shared/icons.ts';

// #170: card-local addition -- glp-order-card has no live-brewing view and no
// use for a descaling icon. Same droplet silhouette as `droplet` (water) with
// a jagged crystalline line through it, standing in for the mineral/scale
// deposit being flushed out -- visually distinct from the plain droplet used
// for the water-level banner.
type IconPathMap = Record<string, string>;
(GLP_ICON_PATHS as IconPathMap).descale = '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M8.3 13.6l1.5 1.7 1.4-2.3 1.5 1.7 1.5-2.3"/>';

export { MACHINE_BODY, MACHINE_ICON_MINI, GLP_ICON_PATHS, ICONS };
