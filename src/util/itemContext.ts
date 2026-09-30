import type { InjectionKey } from "vue";

/**
 * The id of the placed grid item a widget is rendered inside (provided by FlexGridItem). Container widgets use it as the
 * key for their per-device view state (selected tab, folded or not - model/containerState.ts). Absent for a widget
 * rendered outside a grid item (a pinned header widget, a preview); those fall back to a key derived from their content.
 */
export const ITEM_ID_KEY: InjectionKey<string> = Symbol("flexible-layouts-item-id");
