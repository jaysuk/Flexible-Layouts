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
					<th v-if="allowExclude"></th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="(entry, i) in entries" :key="i">
					<td class="text-caption">{{ entry.path }}<span v-if="entry.line"> :{{ entry.line }}</span></td>
					<td class="text-caption">{{ entry.label }}</td>
					<td v-if="allowExclude" class="text-right">
						<v-btn v-if="entry.excludableName" variant="text" density="compact" size="small" @click="askExclude(entry.excludableName)">
							{{ $t("plugins.flexibleLayouts.configBackup.redaction.excludeAction") }}
						</v-btn>
					</td>
				</tr>
			</tbody>
		</v-table>

		<v-dialog v-model="confirm.open" max-width="480">
			<v-card>
				<v-card-title :class="{ 'text-error': confirm.strong }">
					{{ $t("plugins.flexibleLayouts.configBackup.redaction.excludeConfirmTitle", { name: confirm.name }) }}
				</v-card-title>
				<v-card-text>
					<p class="mb-2">{{ $t("plugins.flexibleLayouts.configBackup.redaction.excludeConfirmBody", { name: confirm.name }) }}</p>
					<v-alert v-if="confirm.strong" type="warning" variant="tonal" density="compact" class="mb-2">
						{{ $t("plugins.flexibleLayouts.configBackup.redaction.excludeConfirmStrongWarning", { name: confirm.name }) }}
					</v-alert>
					<v-checkbox v-if="confirm.strong" v-model="confirm.acknowledged" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.configBackup.redaction.excludeConfirmStrongCheckbox')" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirm.open = false">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
					<v-btn variant="text" :color="confirm.strong ? 'error' : 'primary'" :disabled="confirm.strong && !confirm.acknowledged" @click="confirmExclude">
						{{ $t("plugins.flexibleLayouts.configBackup.redaction.excludeConfirmButton") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import type { RedactionEntry } from "dwc-config-backup-core";

const props = withDefaults(defineProps<{
	entries: Array<RedactionEntry>;
	redacted: boolean;
	/** Show the per-row "Exclude" action. Off by default: the pre-send unredacted-warning dialog
	 *  reuses this component while blocking on a user choice the caller is `await`-ing, and letting
	 *  an exclude here mutate the very list that dialog is describing would desync it mid-decision.
	 *  Only the post-backup summary (BackupCreatePanel) turns this on. */
	allowExclude?: boolean;
}>(), { allowExclude: false });

const emit = defineEmits<{ exclude: [name: string] }>();

const expanded = ref(false);
const fileCount = computed(() => new Set(props.entries.map((e) => e.path)).size);

// REDACTION-EXCLUSIONS-PLAN.md §5.4 (dwc-config-backup-core) - names that strongly look like real
// credentials get an escalated, harder-to-misclick confirm rather than a hard block (a genuine
// non-secret field named e.g. "token" still needs an out).
const STRONG_CREDENTIAL_WORDS = ["password", "passwd", "pwd", "secret", "token", "psk", "apikey", "api_key", "api-key"];
function isStrongCredentialWord(name: string): boolean {
	const lower = name.toLowerCase();
	return STRONG_CREDENTIAL_WORDS.some((w) => lower.includes(w));
}

interface ConfirmState { open: boolean; name: string; strong: boolean; acknowledged: boolean }
const confirm = reactive<ConfirmState>({ open: false, name: "", strong: false, acknowledged: false });

function askExclude(name: string): void {
	confirm.name = name;
	confirm.strong = isStrongCredentialWord(name);
	confirm.acknowledged = false;
	confirm.open = true;
}
function confirmExclude(): void {
	confirm.open = false;
	emit("exclude", confirm.name);
}
</script>
