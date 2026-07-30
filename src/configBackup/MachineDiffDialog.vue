<template>
	<v-dialog :model-value="modelValue" max-width="600" @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2" :color="diff.sameMachine ? 'info' : 'warning'">
					{{ diff.sameMachine ? "mdi-check-decagram-outline" : "mdi-swap-horizontal" }}
				</v-icon>
				{{ $t("plugins.flexibleLayouts.configBackup.restore.diffHeading") }}
			</v-card-title>
			<v-card-text>
				<v-alert :type="diff.sameMachine ? 'info' : 'warning'" variant="tonal" density="comfortable" class="mb-3">
					{{ diff.sameMachine
						? $t("plugins.flexibleLayouts.configBackup.restore.diffSameMachine")
						: $t("plugins.flexibleLayouts.configBackup.restore.diffDifferentMachine", { hostname: backupHostname }) }}
				</v-alert>

				<v-table density="compact">
					<thead>
						<tr>
							<th></th>
							<th>{{ $t("plugins.flexibleLayouts.configBackup.restore.diffColumnBackup") }}</th>
							<th>{{ $t("plugins.flexibleLayouts.configBackup.restore.diffColumnLive") }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(row, i) in diff.rows" :key="i">
							<td class="text-caption">
								<v-icon size="14" class="me-1" :color="severityColor(row.severity)">{{ severityIcon(row.severity) }}</v-icon>
								{{ row.label }}
							</td>
							<td class="text-caption">{{ row.backupValue }}</td>
							<td class="text-caption">{{ row.liveValue }}</td>
						</tr>
					</tbody>
				</v-table>

				<template v-if="diff.missingDriverRefs.length > 0">
					<div class="text-title-small mt-4 mb-1">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.diffDriverRefsHeading") }}
					</div>
					<v-alert v-for="(ref, i) in diff.missingDriverRefs" :key="i" type="warning" variant="tonal" density="compact" class="mb-1">
						{{ ref }}
					</v-alert>
				</template>
			</v-card-text>
			<v-divider />
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" color="card-actions" @click="emit('update:modelValue', false)">
					{{ $t("plugins.flexibleLayouts.configBackup.restore.diffClose") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import type { DiffSeverity, MachineDiff } from "../model/configBackup/types";

defineProps<{
	modelValue: boolean;
	diff: MachineDiff;
	backupHostname: string;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

function severityColor(s: DiffSeverity): string {
	return s === "danger" ? "error" : s === "warning" ? "warning" : "info";
}
function severityIcon(s: DiffSeverity): string {
	return s === "danger" ? "mdi-alert-circle" : s === "warning" ? "mdi-alert" : "mdi-information-outline";
}
</script>
