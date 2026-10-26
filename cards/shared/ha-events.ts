// Home Assistant's documented custom-card events. They must bubble and cross
// shadow roots (composed) to reach the frontend's handlers.
export type HapticType = 'success' | 'warning' | 'failure' | 'light' | 'medium' | 'heavy' | 'selection';

export function fireHaEvent(node: EventTarget, type: string, detail: unknown): void {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

export const moreInfo = (node: EventTarget, entityId: string): void => fireHaEvent(node, 'hass-more-info', { entityId });
export const toast = (node: EventTarget, message: string): void => fireHaEvent(node, 'hass-notification', { message });
export const haptic = (node: EventTarget, type: HapticType): void => fireHaEvent(node, 'haptic', type);
