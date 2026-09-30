<template>
	<v-card class="fill-height d-flex flex-column tabs-root" variant="tonal">
		<div v-if="widget.title || widget.collapsible" class="tabs-header d-flex align-center px-3 py-1">
			<span class="tabs-title text-truncate flex-grow-1" style="font-size: 0.95em;">{{ widget.title || $t("plugins.flexibleLayouts.widgets.tabs") }}</span>
			<v-btn v-if="widget.collapsible" size="x-small" variant="text" icon class="tabs-fold" :aria-expanded="!folded"
				   :aria-label="folded ? $t('plugins.flexibleLayouts.container.expand') : $t('plugins.flexibleLayouts.container.collapse')"
				   :title="folded ? $t('plugins.flexibleLayouts.container.expand') : $t('plugins.flexibleLayouts.container.collapse')"
				   @click="fold(!folded)">
				<v-icon>{{ folded ? "mdi-chevron-down" : "mdi-chevron-up" }}</v-icon>
			</v-btn>
		</div>

		<div v-if="!folded" class="tabs-layout d-flex flex-grow-1" :class="`tabs-pos-${position}`" style="min-height: 0;">
			<v-tabs v-if="visibleTabs.length > 0" :model-value="activeId" :direction="position === 'left' ? 'vertical' : 'horizontal'"
					density="compact" show-arrows class="tabs-bar flex-shrink-0" :aria-label="widget.title || $t('plugins.flexibleLayouts.widgets.tabs')"
					@update:model-value="(v: unknown) => select(String(v))">
				<v-tab v-for="t in visibleTabs" :key="t.id" :value="t.id" :prepend-icon="t.icon || undefined" class="text-none tabs-tab">
					{{ t.title }}
				</v-tab>
			</v-tabs>

			<!-- Only the showing tab is rendered: an inactive tab's charts, webcams and pollers are unmounted, not just hidden. -->
			<div class="tabs-body flex-grow-1" style="min-height: 0; min-width: 0; overflow: auto;">
				<FlexGrid v-if="activeTab && activeTab.items.length > 0" :key="activeTab.id" :layout="activeTab.items" :cols="widget.cols ?? 12"
						  :row-height="widget.rowHeight ?? 30" :edit-mode="false"
						  @patch-widget="(id: string, patch: Record<string, unknown>) => patchChild(activeTab!.id, id, patch)" />
				<div v-else class="tabs-empty d-flex align-center justify-center text-medium-emphasis pa-4" style="height: 100%">
					<div class="text-center">
						<v-icon>mdi-tab</v-icon>
						<div style="font-size: 0.8em">
							{{ visibleTabs.length === 0 ? $t("plugins.flexibleLayouts.container.noTabs") : $t("plugins.flexibleLayouts.container.tabEmpty") }}
						</div>
					</div>
				</div>
			</div>
		</div>
	</v-card>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject } from "vue";

import { useMachineStore } from "@/stores/machine";

import { getSelectedTab, isCollapsed, setCollapsed, setSelectedTab } from "../model/containerState";
import type { TabDef, Widget } from "../model/document";
import { evaluateRule } from "../util/conditions";
import { ITEM_ID_KEY } from "../util/itemContext";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";

// Lazy import breaks the FlexGrid -> FlexGridItem -> WidgetView -> TabsWidget -> FlexGrid module cycle (same as GroupWidget).
const FlexGrid = defineAsyncComponent(() => import("../page/FlexGrid.vue"));

const props = defineProps<{ widget: Extract<Widget, { type: "tabs" }> }>();

const machineStore = useMachineStore();
const ambientPatch = inject(WIDGET_PATCH_KEY, null);
const itemId = inject(ITEM_ID_KEY, undefined);

/** Key for this widget's per-device state: its item id, else something stable from its own content. */
const stateKey = computed(() => itemId ?? `tabs:${props.widget.tabs.map((t) => t.id).join(",")}`);

const position = computed(() => props.widget.tabPosition ?? "top");

// A tab with a `showWhen` rule appears only while it holds ("Probing" only in CNC mode, say).
const visibleTabs = computed<Array<TabDef>>(() => props.widget.tabs.filter((t) => evaluateRule(machineStore.model, t.showWhen)));

// The tab this device last showed - if it is still there; otherwise the first one that is.
const activeId = computed<string | undefined>(() => {
	const wanted = getSelectedTab(stateKey.value);
	return visibleTabs.value.find((t) => t.id === wanted)?.id ?? visibleTabs.value[0]?.id;
});
const activeTab = computed(() => visibleTabs.value.find((t) => t.id === activeId.value));

function select(id: string): void {
	setSelectedTab(stateKey.value, id);
}

const folded = computed(() => !!props.widget.collapsible && isCollapsed(stateKey.value));
function fold(on: boolean): void {
	setCollapsed(stateKey.value, on);
}

// A widget inside a tab changed its own config (see util/widgetPatch.ts): fold that into this widget's `tabs`
// and forward it as THIS widget's patch - the child does not know it lives in a tab.
function patchChild(tabId: string, id: string, patch: Record<string, unknown>): void {
	const tabs = props.widget.tabs.map((t) =>
		t.id === tabId ? { ...t, items: t.items.map((it) => (it.i === id ? { ...it, widget: { ...it.widget, ...patch } as Widget } : it)) } : t);
	ambientPatch?.({ tabs });
}
</script>

<style scoped>
.tabs-layout.tabs-pos-bottom { flex-direction: column-reverse; }
.tabs-layout.tabs-pos-top { flex-direction: column; }
.tabs-layout.tabs-pos-left { flex-direction: row; }
/* On a phone the bar scrolls sideways instead of wrapping or clipping. */
.tabs-bar { max-width: 100%; }
</style>
