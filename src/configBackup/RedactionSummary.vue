<template>
	<div>
		<div class="d-flex align-center ga-2">
			<v-icon size="18" :color="redacted ? 'warning' : 'info'">{{ redacted ? "mdi-eye-off" : "mdi-eye" }}</v-icon>
			<span class="text-body-2">
				{{ redacted
					? $t("plugins.flexibleLayouts.configBackup.redaction.summaryRedacted", { count: entries.length, files: fileCount })
					: $t("plugins.flexibleLayouts.configBackup.redaction.summaryPresent", { count: entries.length, files: fileCount }) }}
			</span>
			<v-btn v-if="entries.length > 0" variant="text" density="compact" size="small" @click="expanded = !expanded">
				{{ expanded
					? $t("plugins.flexibleLayouts.configBackup.redaction.collapse")
					: $t("plugins.flexibleLayouts.configBackup.redaction.expand") }}
			</v-btn>
		</div>

		<v-table v-if="expanded && entries.length > 0" density="compact" class="mt-2">
			<thead>
				<tr>
					<th>{{ $t("plugins.flexibleLayouts.configBackup.redaction.columnFile") }}</th>
					<th>{{ $t("plugins.flexibleLayouts.configBackup.redaction.columnLabel") }}</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="(entry, i) in entries" :key="i">
					<td class="text-caption">{{ entry.path }}<span v-if="entry.line"> :{{ entry.line }}</span></td>
					<td class="text-caption">{{ entry.label }}</td>
				</tr>
			</tbody>
		</v-table>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import type { RedactionEntry } from "dwc-config-backup-core";

const props = defineProps<{
	entries: Array<RedactionEntry>;
	redacted: boolean;
}>();

const expanded = ref(false);
const fileCount = computed(() => new Set(props.entries.map((e) => e.path)).size);
</script>
