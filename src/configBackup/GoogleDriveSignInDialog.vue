<template>
	<v-dialog :model-value="state.open" max-width="440" persistent :attach="attach">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-google-drive</v-icon>
				{{ $t("plugins.flexibleLayouts.configBackup.drive.signInTitle") }}
			</v-card-title>
			<v-card-text>
				<template v-if="state.status === 'waiting'">
					<p class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.configBackup.drive.signInInstructions") }}</p>
					<div class="text-center mb-3">
						<div class="text-h4 font-weight-bold" style="letter-spacing: 3px;">{{ state.userCode }}</div>
					</div>
					<div class="text-center mb-4">
						<a :href="state.verificationUrl" target="_blank" rel="noopener">{{ state.verificationUrl }}</a>
					</div>
					<div class="d-flex align-center ga-2 text-medium-emphasis">
						<v-progress-circular indeterminate size="18" width="2" />
						<span class="text-caption">{{ $t("plugins.flexibleLayouts.configBackup.drive.signInWaiting") }}</span>
					</div>
				</template>
				<v-alert v-else-if="state.status === 'authorized'" type="success" variant="tonal" density="comfortable">
					{{ $t("plugins.flexibleLayouts.configBackup.drive.signInSuccess") }}
				</v-alert>
				<v-alert v-else type="error" variant="tonal" density="comfortable">
					{{ statusMessage }}
				</v-alert>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn color="primary" @click="closeDriveSignInPrompt">{{ $t("plugins.flexibleLayouts.configBackup.drive.signInOk") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";

import { closeDriveSignInPrompt, useDriveSignInPromptState } from "../composables/useDriveSignInPrompt";

// Purely for testability, per this repo's v-dialog convention - Vuetify teleports to <body> by default,
// which Vue Test Utils' wrapper can't see otherwise.
defineProps<{ attach?: boolean | string }>();

// Reads the shared singleton directly (see the composable's own doc comment) rather than taking props -
// runBackup.ts, a plain module with no dialog of its own, is what actually drives this state.
const state = useDriveSignInPromptState();

const statusMessage = computed(() => {
	if (state.status === "denied") { return i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInDenied"); }
	if (state.status === "expired") { return i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInExpired"); }
	return state.message || i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInGenericError");
});
</script>
