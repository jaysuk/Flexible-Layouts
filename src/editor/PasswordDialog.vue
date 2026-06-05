<template>
	<v-dialog :model-value="lockPromptOpen" max-width="380" persistent>
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-lock</v-icon>{{ $t("plugins.flexibleLayouts.lock.promptTitle") }}
			</v-card-title>
			<v-card-text>
				<div class="text-body-2 text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.lock.promptHelp") }}</div>
				<v-text-field v-model="pw" type="password" density="compact" variant="outlined" autofocus
							  :label="$t('plugins.flexibleLayouts.lock.password')"
							  :error="lockPromptError"
							  :error-messages="lockPromptError ? [$t('plugins.flexibleLayouts.lock.wrong')] : []"
							  @keyup.enter="submit" @update:model-value="lockPromptError = false" />
			</v-card-text>
			<v-card-actions>
				<v-btn variant="text" @click="onCancel">{{ $t("generic.cancel") }}</v-btn>
				<v-spacer />
				<v-btn color="primary" :disabled="!pw" @click="submit">
					{{ $t("plugins.flexibleLayouts.lock.unlock") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

import { cancelPrompt, lockPromptError, lockPromptOpen, submitPassword } from "../model/lock";

const pw = ref("");

// Clear the field whenever the prompt (re)opens.
watch(lockPromptOpen, (open) => { if (open) { pw.value = ""; } });

function submit() {
	submitPassword(pw.value);
}
function onCancel() {
	pw.value = "";
	cancelPrompt();
}
</script>
