<template>
	<v-sheet border rounded class="pa-3">
		<div class="d-flex align-center mb-1">
			<v-icon class="me-2">mdi-lock</v-icon>
			<span class="text-title-small">{{ $t("plugins.flexibleLayouts.lock.title") }}</span>
		</div>
		<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.lock.help") }}</div>

		<v-switch :model-value="enabled" color="primary" hide-details density="compact"
				  :label="$t('plugins.flexibleLayouts.lock.enable')"
				  @update:model-value="onToggle" />

		<div v-if="enabled" class="d-flex ga-2 mt-2">
			<v-btn size="small" variant="tonal" prepend-icon="mdi-key-change" @click="openSet(true)">
				{{ $t("plugins.flexibleLayouts.lock.change") }}
			</v-btn>
			<v-btn v-if="isUnlocked" size="small" variant="text" prepend-icon="mdi-lock"
				   @click="relock">
				{{ $t("plugins.flexibleLayouts.lock.lockNow") }}
			</v-btn>
		</div>

		<!-- Set / change password -->
		<v-dialog v-model="setOpen" max-width="400">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.lock.setTitle") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="pw1" type="password" density="compact" variant="outlined" autofocus
								  class="mb-2" :label="$t('plugins.flexibleLayouts.lock.newPassword')" />
					<v-text-field v-model="pw2" type="password" density="compact" variant="outlined"
								  :label="$t('plugins.flexibleLayouts.lock.confirmPassword')"
								  :error="mismatch" :error-messages="mismatch ? [$t('plugins.flexibleLayouts.lock.mismatch')] : []" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="cancelSet">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="dialog-action" :disabled="!pw1 || mismatch" @click="savePassword">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Verify to disable -->
		<v-dialog v-model="disableOpen" max-width="380">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.lock.disableTitle") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="verifyPw" type="password" density="compact" variant="outlined" autofocus
								  :label="$t('plugins.flexibleLayouts.lock.password')"
								  :error="verifyError" :error-messages="verifyError ? [$t('plugins.flexibleLayouts.lock.wrong')] : []"
								  @update:model-value="verifyError = false" @keyup.enter="confirmDisable" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="disableOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="error" @click="confirmDisable">{{ $t("plugins.flexibleLayouts.lock.disable") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-sheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import {
	getLock,
	hashPassword,
	isUnlocked,
	markUnlocked,
	relock,
	setLock,
	verifyPassword,
} from "../model/lock";

const enabled = computed(() => getLock().enabled);

// Toggle on -> set a password; toggle off -> verify (unless already unlocked this session).
function onToggle(val: boolean | null) {
	if (val) {
		openSet(false);
	} else if (isUnlocked.value) {
		setLock({ enabled: false, hash: "" });
	} else {
		verifyPw.value = "";
		verifyError.value = false;
		disableOpen.value = true;
	}
}

// Set / change password dialog
const setOpen = ref(false);
const pw1 = ref("");
const pw2 = ref("");
const mismatch = computed(() => pw2.value.length > 0 && pw1.value !== pw2.value);

function openSet(_isChange: boolean) {
	pw1.value = "";
	pw2.value = "";
	setOpen.value = true;
}
function cancelSet() {
	setOpen.value = false;
}
function savePassword() {
	if (!pw1.value || mismatch.value) {
		return;
	}
	setLock({ enabled: true, hash: hashPassword(pw1.value) });
	markUnlocked(); // don't lock the user out of the session they just configured
	setOpen.value = false;
}

// Verify-to-disable dialog
const disableOpen = ref(false);
const verifyPw = ref("");
const verifyError = ref(false);
function confirmDisable() {
	if (verifyPassword(verifyPw.value)) {
		setLock({ enabled: false, hash: "" });
		disableOpen.value = false;
	} else {
		verifyError.value = true;
	}
}
</script>
