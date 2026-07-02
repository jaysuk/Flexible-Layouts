<template>
	<v-sheet border rounded class="pa-3">
		<div class="d-flex align-center mb-1">
			<v-icon class="me-2">mdi-shield-account</v-icon>
			<span class="text-title-small">{{ $t("plugins.flexibleLayouts.access.title") }}</span>
		</div>
		<div class="text-caption text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.access.help") }}</div>

		<v-switch :model-value="observerEnabled" color="primary" density="compact" hide-details class="mb-1"
				  :label="$t('plugins.flexibleLayouts.access.enableObserver')"
				  @update:model-value="onToggleObserver" />
		<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.access.observerHelp") }}</div>

		<v-switch :model-value="operatorEnabled" color="primary" density="compact" hide-details class="mb-1"
				  :label="$t('plugins.flexibleLayouts.access.enableOperator')"
				  @update:model-value="onToggleOperator" />
		<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.access.operatorHelp") }}</div>

		<v-alert v-if="operatorPasswordMissing" type="warning" variant="tonal" density="compact" class="mb-2">
			<div class="d-flex align-center flex-wrap ga-2">
				<span class="flex-grow-1">{{ $t("plugins.flexibleLayouts.access.operatorPasswordMissing") }}</span>
				<v-btn size="small" variant="tonal" @click="openOperatorSet(null)">
					{{ $t("plugins.flexibleLayouts.access.setPassword") }}
				</v-btn>
			</div>
		</v-alert>

		<template v-if="anyEnabled">
			<v-divider class="my-2" />
			<div class="d-flex flex-wrap ga-2 mb-1">
				<v-btn size="small" variant="tonal" prepend-icon="mdi-key-change" @click="openAdminSet(null)">
					{{ $t("plugins.flexibleLayouts.access.changeAdminPassword") }}
				</v-btn>
				<v-btn v-if="bothEnabled" size="small" variant="tonal" prepend-icon="mdi-key-change"
					   @click="openOperatorSet(null)">
					{{ $t("plugins.flexibleLayouts.access.changeOperatorPassword") }}
				</v-btn>
				<v-btn v-if="isElevated" size="small" variant="text" prepend-icon="mdi-lock" @click="relock">
					{{ $t("plugins.flexibleLayouts.access.lockNow") }}
				</v-btn>
			</div>

			<v-switch :model-value="hideEmergencyStop" color="primary" density="compact" hide-details class="mt-2"
					  :label="$t('plugins.flexibleLayouts.access.hideEmergencyStop')"
					  @update:model-value="onToggleHideEstop" />
			<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.access.hideEmergencyStopHelp") }}</div>
		</template>

		<p class="text-caption text-medium-emphasis mt-3 mb-0">{{ $t("plugins.flexibleLayouts.access.recoveryHint") }}</p>

		<!-- Set / change Admin password -->
		<v-dialog v-model="adminSetOpen" max-width="400">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.access.setAdminTitle") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="adminPw1" type="password" density="compact" variant="outlined" autofocus
								  class="mb-2" :label="$t('plugins.flexibleLayouts.access.newPassword')" />
					<v-text-field v-model="adminPw2" type="password" density="compact" variant="outlined"
								  :label="$t('plugins.flexibleLayouts.access.confirmPassword')"
								  :error="adminMismatch" :error-messages="adminMismatch ? [$t('plugins.flexibleLayouts.access.mismatch')] : []" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="cancelAdminSet">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="card-actions" :disabled="!adminPw1 || adminMismatch" @click="saveAdminSet">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Set / change Operator password -->
		<v-dialog v-model="operatorSetOpen" max-width="400">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.access.setOperatorTitle") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="operatorPw1" type="password" density="compact" variant="outlined" autofocus
								  class="mb-2" :label="$t('plugins.flexibleLayouts.access.newPassword')" />
					<v-text-field v-model="operatorPw2" type="password" density="compact" variant="outlined"
								  :label="$t('plugins.flexibleLayouts.access.confirmPassword')"
								  :error="operatorMismatch" :error-messages="operatorMismatch ? [$t('plugins.flexibleLayouts.access.mismatch')] : []" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="cancelOperatorSet">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="card-actions" :disabled="!operatorPw1 || operatorMismatch" @click="saveOperatorSet">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-sheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import {
	type AccessConfig,
	currentLevel,
	defaultLevel,
	getAccess,
	hashPassword,
	markAdmin,
	relock as relockAccess,
	setAccess,
} from "../model/access";

type Tier = "observerEnabled" | "operatorEnabled";

const config = computed(() => getAccess());
const observerEnabled = computed(() => config.value.observerEnabled);
const operatorEnabled = computed(() => config.value.operatorEnabled);
const bothEnabled = computed(() => observerEnabled.value && operatorEnabled.value);
const anyEnabled = computed(() => observerEnabled.value || operatorEnabled.value);
const hideEmergencyStop = computed(() => config.value.hideEmergencyStop ?? false);
const operatorPasswordMissing = computed(() => bothEnabled.value && !config.value.operatorHash);
const isElevated = computed(() => currentLevel() !== defaultLevel());

// This component is only ever rendered while `can('editLayout')` (see FlexSettingsTab.vue) — i.e.
// either the session is already elevated to Admin, or nothing is locked yet. Either way, once we're
// here, disabling a tier or changing an existing password needs no further re-verification (matches
// how the sibling Page-manager/Theme/IO/Profiles dialogs behave once their own gate has passed).

// #region Toggling a tier on/off
const pendingEnableFlag = ref<Tier | null>(null);

function onToggleObserver(val: boolean | null): void {
	toggleTier("observerEnabled", val === true);
}
function onToggleOperator(val: boolean | null): void {
	toggleTier("operatorEnabled", val === true);
}

function toggleTier(flag: Tier, turnOn: boolean): void {
	if (!turnOn) {
		setAccess({ ...getAccess(), [flag]: false });
		return;
	}
	const current = getAccess();
	if (!current.adminHash) {
		// First tier ever enabled: an Admin password is mandatory before anything can be restricted.
		pendingEnableFlag.value = flag;
		openAdminSet(flag);
		return;
	}
	const otherOn = flag === "observerEnabled" ? current.operatorEnabled : current.observerEnabled;
	if (otherOn && !current.operatorHash) {
		// This flips the config to "both enabled", which requires its own Operator password before
		// the flag is actually turned on (never leave a tier enabled with no way to log into it).
		pendingEnableFlag.value = flag;
		openOperatorSet(flag);
		return;
	}
	setAccess({ ...current, [flag]: true });
}
// #endregion

// #region Set / change Admin password
const adminSetOpen = ref(false);
const adminPw1 = ref("");
const adminPw2 = ref("");
const adminMismatch = computed(() => adminPw2.value.length > 0 && adminPw1.value !== adminPw2.value);

function openAdminSet(forFlag: Tier | null): void {
	pendingEnableFlag.value = forFlag;
	adminPw1.value = "";
	adminPw2.value = "";
	adminSetOpen.value = true;
}
function cancelAdminSet(): void {
	adminSetOpen.value = false;
	pendingEnableFlag.value = null;
}
function saveAdminSet(): void {
	if (!adminPw1.value || adminMismatch.value) {
		return;
	}
	const patch: Partial<AccessConfig> = { adminHash: hashPassword(adminPw1.value) };
	if (pendingEnableFlag.value) {
		patch[pendingEnableFlag.value] = true;
	}
	setAccess({ ...getAccess(), ...patch });
	markAdmin(); // don't lock the user out of the session they just configured
	adminSetOpen.value = false;
	pendingEnableFlag.value = null;
}
// #endregion

// #region Set / change Operator password
const operatorSetOpen = ref(false);
const operatorPw1 = ref("");
const operatorPw2 = ref("");
const operatorMismatch = computed(() => operatorPw2.value.length > 0 && operatorPw1.value !== operatorPw2.value);

function openOperatorSet(forFlag: Tier | null): void {
	pendingEnableFlag.value = forFlag;
	operatorPw1.value = "";
	operatorPw2.value = "";
	operatorSetOpen.value = true;
}
function cancelOperatorSet(): void {
	operatorSetOpen.value = false;
	pendingEnableFlag.value = null; // don't leave the tier half-enabled with no way to log into it
}
function saveOperatorSet(): void {
	if (!operatorPw1.value || operatorMismatch.value) {
		return;
	}
	const patch: Partial<AccessConfig> = { operatorHash: hashPassword(operatorPw1.value) };
	if (pendingEnableFlag.value) {
		patch[pendingEnableFlag.value] = true;
	}
	setAccess({ ...getAccess(), ...patch });
	operatorSetOpen.value = false;
	pendingEnableFlag.value = null;
}
// #endregion

function onToggleHideEstop(val: boolean | null): void {
	setAccess({ ...getAccess(), hideEmergencyStop: val === true });
}
function relock(): void {
	relockAccess();
}
</script>
