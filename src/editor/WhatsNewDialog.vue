<template>
	<v-dialog v-model="open" width="700" scrollable>
		<v-card>
			<v-card-title>{{ $t("plugins.flexibleLayouts.whatsNew.title") }}</v-card-title>
			<v-divider />
			<v-card-text class="text-body-small" style="word-break: break-word; font-family: system-ui, -apple-system, sans-serif; max-height: 60vh; overflow-y: auto;">
				<div v-for="entry in entries" :key="entry.version" class="mb-4">
					<div class="text-subtitle-2 font-weight-bold mb-1">{{ entry.name }}</div>
					<div v-html="formatReleaseNotesHtml(entry.notes)" />
				</div>
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

import { formatReleaseNotesHtml, type ReleaseHistoryEntry } from "dwc-plugin-runtime";

const props = defineProps<{ modelValue: boolean; entries: Array<ReleaseHistoryEntry> }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const open = computed({
	get: () => props.modelValue,
	set: (v: boolean) => emit("update:modelValue", v),
});
</script>
