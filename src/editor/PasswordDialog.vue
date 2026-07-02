<template>
	<v-dialog :model-value="accessPromptOpen" max-width="420" persistent>
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-lock</v-icon>{{ $t("plugins.flexibleLayouts.access.promptTitle") }}
			</v-card-title>
			<v-card-text>
				<div class="text-body-2 text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.access.promptHelp") }}</div>

				<!-- One section per offered login: a real choice between claiming Operator or Admin, never
					 a single field guessed against both hashes. -->
				<div v-for="choice in accessPromptChoices" :key="choice" class="mb-3">
					<div class="text-caption text-medium-emphasis mb-1">
						{{ choice === "admin"
							? $t("plugins.flexibleLayouts.access.loginAsAdmin")
							: $t("plugins.flexibleLayouts.access.loginAsOperator") }}
					</div>
					<div class="d-flex ga-2">
						<v-text-field v-model="pw[choice]" type="password" density="compact" variant="outlined" hide-details
									  autofocus :label="$t('plugins.flexibleLayouts.access.password')"
									  @keyup.enter="submit(choice)" />
						<v-btn color="card-actions" :disabled="!pw[choice]" @click="submit(choice)">
							{{ $t("plugins.flexibleLayouts.access.unlock") }}
						</v-btn>
					</div>
				</div>

				<div v-if="accessPromptError" class="text-caption text-error">{{ $t("plugins.flexibleLayouts.access.wrong") }}</div>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="onCancel">{{ $t("generic.cancel") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";

import {
	accessPromptChoices,
	accessPromptError,
	accessPromptOpen,
	cancelPrompt,
	type LoginChoice,
	submitLogin,
} from "../model/access";

const pw = reactive<Record<LoginChoice, string>>({ operator: "", admin: "" });

// Clear both fields whenever the prompt (re)opens.
watch(accessPromptOpen, (open) => { if (open) { pw.operator = ""; pw.admin = ""; } });

function submit(choice: LoginChoice) {
	submitLogin(choice, pw[choice]);
}
function onCancel() {
	pw.operator = "";
	pw.admin = "";
	cancelPrompt();
}
</script>
