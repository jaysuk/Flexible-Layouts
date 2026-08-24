<template>
	<v-dialog v-model="open" max-width="720" scrollable :attach="props.attach">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2" color="primary">mdi-party-popper</v-icon>
				{{ $t("plugins.flexibleLayouts.whatsNew.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="open = false" />
			</v-card-title>
			<v-divider />
			<v-card-text class="wn-body pa-4">
				<template v-for="(entry, i) in entries" :key="entry.version">
					<v-divider v-if="i > 0" class="my-4" />
					<div class="wn-entry">
						<div class="wn-entry-head">
							<v-chip size="small" color="primary" variant="flat" class="wn-version">v{{ entry.version }}</v-chip>
							<span class="wn-name text-truncate">{{ entry.name }}</span>
						</div>

						<template v-if="highlightsFor(entry.version).length">
							<div class="wn-widgets-heading">{{ $t("plugins.flexibleLayouts.whatsNew.newWidgetsHeading") }}</div>
							<div class="wn-widgets-row">
								<WhatsNewWidgetCard v-for="(h, hi) in highlightsFor(entry.version)" :key="hi" :highlight="h" />
							</div>
						</template>

						<div class="wn-notes" v-html="linkifyReleaseNotes(entry.notes)" />
					</div>
				</template>
			</v-card-text>
			<v-divider />
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="open = false">{{ $t("plugins.flexibleLayouts.whatsNew.close") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { ReleaseHistoryEntry } from "dwc-plugin-runtime";

import { WHATS_NEW_WIDGET_HIGHLIGHTS, type WhatsNewWidgetHighlight } from "../model/whatsNewWidgets";
import { linkifyReleaseNotes } from "../util/releaseNotes";
import WhatsNewWidgetCard from "./WhatsNewWidgetCard.vue";

// `attach` is a plain pass-through to v-dialog's own prop, left unset in real use (the default
// teleport-to-body avoids clipping by an ancestor's overflow) - it exists purely so tests can pass
// `attach: true` and keep the dialog's content in the local DOM tree, where Vue Test Utils' wrapper
// queries can actually see it (same convention as GcodeFilePickerDialog.vue).
const props = defineProps<{ modelValue: boolean; entries: Array<ReleaseHistoryEntry>; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const open = computed({
	get: () => props.modelValue,
	set: (v: boolean) => emit("update:modelValue", v),
});

function highlightsFor(version: string): Array<WhatsNewWidgetHighlight> {
	return WHATS_NEW_WIDGET_HIGHLIGHTS[version] ?? [];
}
</script>

<style scoped>
.wn-body { max-height: 65vh; }
.wn-entry-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.wn-version { font-family: monospace; font-weight: 700; }
.wn-name { font-size: 1rem; font-weight: 700; }

.wn-widgets-heading {
	font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
	color: rgba(var(--v-theme-on-surface), 0.6); margin: 4px 0 8px;
}
.wn-widgets-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }

.wn-notes { font-size: 0.85rem; line-height: 1.55; word-break: break-word; }
.wn-notes :deep(h4) {
	margin: 0.9em 0 0.35em; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
	letter-spacing: 0.04em; padding-left: 8px; border-left: 3px solid rgb(var(--v-theme-primary));
	color: rgba(var(--v-theme-on-surface), 0.75);
}
.wn-notes :deep(h4:first-child) { margin-top: 0; }
.wn-notes :deep(div) { margin: 2px 0; }
.wn-notes :deep(code) {
	font-family: monospace; font-size: 0.9em; background: rgba(var(--v-theme-on-surface), 0.08);
	padding: 0 4px; border-radius: 3px;
}
.wn-notes :deep(a.wn-ref) {
	font-family: monospace; font-size: 0.82em; color: rgba(var(--v-theme-on-surface), 0.6);
	background: rgba(var(--v-theme-on-surface), 0.06); padding: 0 5px; border-radius: 3px;
	text-decoration: none;
}
.wn-notes :deep(a.wn-ref:hover) { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.1); }
.wn-notes :deep(hr) { border: none; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); }
</style>
