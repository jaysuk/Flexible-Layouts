<template>
	<v-dialog :model-value="modelValue" max-width="440" persistent @update:model-value="onCancel">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-lock-outline</v-icon>
				{{ mode === "set"
					? $t("plugins.flexibleLayouts.configBackup.encryption.setTitle")
					: $t("plugins.flexibleLayouts.configBackup.encryption.unlockTitle") }}
			</v-card-title>
			<v-card-text>
				<div class="text-body-2 text-medium-emphasis mb-3">
					{{ mode === "set"
						? $t("plugins.flexibleLayouts.configBackup.encryption.setHelp")
						: $t("plugins.flexibleLayouts.configBackup.encryption.unlockHelp") }}
				</div>
				<v-text-field v-model="passphrase" type="password" density="compact" variant="outlined" hide-details autofocus
							  :label="$t('plugins.flexibleLayouts.configBackup.encryption.passphraseLabel')" class="mb-2"
							  @keyup.enter="trySubmit" />
				<v-text-field v-if="mode === 'set'" v-model="confirmPassphrase" type="password" density="compact" variant="outlined"
							  hide-details :label="$t('plugins.flexibleLayouts.configBackup.encryption.confirmLabel')" class="mb-2"
							  @keyup.enter="trySubmit" />
				<v-alert v-if="localError" type="error" variant="tonal" density="compact" class="mt-2">{{ localError }}</v-alert>
				<v-alert v-else-if="error" type="error" variant="tonal" density="compact" class="mt-2">{{ error }}</v-alert>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="onCancel">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
				<v-btn color="card-actions" :loading="loading" :disabled="!passphrase" @click="trySubmit">
					{{ mode === "set"
						? $t("plugins.flexibleLayouts.configBackup.encryption.setButton")
						: $t("plugins.flexibleLayouts.configBackup.encryption.unlockButton") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

import i18n from "@/i18n";

const props = defineProps<{
	modelValue: boolean;
	mode: "set" | "unlock";
	loading?: boolean;
	/** Error from the caller (e.g. "wrong passphrase") - shown alongside/instead of local validation. */
	error?: string | null;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean]; submit: [string] }>();

const passphrase = ref("");
const confirmPassphrase = ref("");
const localError = ref<string | null>(null);

watch(() => props.modelValue, (open) => {
	if (open) { passphrase.value = ""; confirmPassphrase.value = ""; localError.value = null; }
});

function trySubmit(): void {
	localError.value = null;
	if (!passphrase.value) { return; }
	if (props.mode === "set") {
		if (passphrase.value.length < 8) {
			localError.value = i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.tooShort");
			return;
		}
		if (passphrase.value !== confirmPassphrase.value) {
			localError.value = i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.mismatch");
			return;
		}
	}
	emit("submit", passphrase.value);
}
function onCancel(): void {
	emit("update:modelValue", false);
}
</script>
