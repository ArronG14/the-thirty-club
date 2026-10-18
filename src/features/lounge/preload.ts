import { canRender3D } from '../entrance/scene/canRender3D';

/** Warms the lounge chunk while the entrance doors are still opening. */
export function preloadLounge() {
  if (canRender3D()) void import('./scene/LoungeCanvas');
}
