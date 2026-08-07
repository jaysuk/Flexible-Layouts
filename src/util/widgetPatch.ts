/**
 * Lets a widget component update its OWN persisted document entry - e.g. a probe diameter typed
 * into XyzProbeWidget being remembered next time, without going through the Properties dialog.
 *
 * Provided per grid item (FlexGridItem.vue, alongside the existing SETTINGS_SCOPE_KEY) and relayed
 * up through FlexGrid.vue to FlexPage.vue's patchWidget(id, patch), which merges into the document
 * and debounces persist()+commit() together (see FlexPage.vue's patchWidget for why persist and
 * commit share one debounce rather than two separately-timed ones).
 *
 * A widget rendered inside a group's free-layout mode has no natural per-item provide() scope of
 * its own (GroupWidget renders every child through one shared WidgetView instance stream, and
 * provide() can't differentiate v-for iterations) - WidgetView.vue's optional `itemId` prop exists
 * to close that gap: when set, WidgetView injects the ambient patcher and re-provides an
 * id-wrapped version to its own descendants.
 */
import type { InjectionKey } from "vue";

export type WidgetPatchFn = (patch: Record<string, unknown>) => void;

export const WIDGET_PATCH_KEY: InjectionKey<WidgetPatchFn> = Symbol("flexibleLayouts.widgetPatch");
