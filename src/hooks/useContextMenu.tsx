import { useContextMenuStore } from '../store/useContextMenuStore';
import { useMediaContextMenus } from './useMediaContextMenus';
import { usePlayerContextMenus } from './usePlayerContextMenus';

/**
 * Stable public facade for all context-menu targets. Domain-specific menu
 * construction lives in the smaller hooks beside this file.
 */
export function useContextMenu() {
  const mediaMenus = useMediaContextMenus();
  const playerMenus = usePlayerContextMenus();
  const closeContextMenu = useContextMenuStore((state) => state.closeContextMenu);

  return { ...mediaMenus, ...playerMenus, closeContextMenu };
}
