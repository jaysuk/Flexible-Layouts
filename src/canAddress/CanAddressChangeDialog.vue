<template>
	<v-dialog :model-value="modelValue" max-width="760" scrollable persistent @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-swap-horizontal</v-icon>
				{{ $t("plugins.flexibleLayouts.canAddress.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<template v-if="step === 'form'">
					<div class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.canAddress.intro") }}</div>

					<v-alert v-if="busy" type="warning" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.canAddress.machineBusy") }}
					</v-alert>

					<v-select v-if="boardItems.length" v-model="selectedAddress" :items="boardItems" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.canAddress.board')" class="mb-3" />
					<v-alert v-else type="info" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.canAddress.noExpansionBoards") }}
					</v-alert>

					<v-text-field v-model.number="newAddress" type="number" :min="CAN_ADDRESS_MIN" :max="CAN_ADDRESS_MAX"
								  density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.canAddress.newAddress')" class="mb-1" />
					<div class="text-caption text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.canAddress.newAddressHelp") }}</div>

					<v-alert v-if="validationError" type="error" variant="tonal" density="compact" class="mb-3">{{ validationError }}</v-alert>

					<v-btn color="primary" :disabled="!!validationError || busy" :loading="scanning" @click="onScan">
						{{ $t("plugins.flexibleLayouts.canAddress.scanButton") }}
					</v-btn>
				</template>

				<template v-else-if="step === 'preview'">
					<div class="text-body-2 mb-2">
						{{ $t("plugins.flexibleLayouts.canAddress.previewIntro", { old: selectedAddress, new: newAddress }) }}
					</div>

					<v-alert v-if="plans.length === 0" type="success" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.canAddress.nothingFound") }}
					</v-alert>
					<template v-else>
						<div class="text-caption text-medium-emphasis mb-1">
							{{ $t("plugins.flexibleLayouts.canAddress.filesAffected", { count: plans.length }) }}
						</div>
						<v-expansion-panels variant="accordion" class="mb-3">
							<v-expansion-panel v-for="plan in plans" :key="plan.path">
								<v-expansion-panel-title>
									<span class="text-body-2">{{ plan.path }}</span>
									<v-chip size="x-small" class="ms-2" variant="tonal">
										{{ $t("plugins.flexibleLayouts.canAddress.lineCount", { count: plan.result.changedLines.length }) }}
									</v-chip>
								</v-expansion-panel-title>
								<v-expansion-panel-text>
									<div v-for="lc in plan.result.changedLines" :key="lc.line" class="can-line-diff mb-2">
										<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.canAddress.lineNumber", { n: lc.line }) }}</div>
										<div class="can-diff-before"><span class="can-diff-tag">−</span>{{ lc.before }}</div>
										<div class="can-diff-after"><span class="can-diff-tag">+</span>{{ lc.after }}</div>
									</div>
								</v-expansion-panel-text>
							</v-expansion-panel>
						</v-expansion-panels>
					</template>

					<v-alert type="info" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.canAddress.boardRestartNote") }}
					</v-alert>

					<v-alert v-if="applyError" type="error" variant="tonal" density="compact" class="mb-3">{{ applyError }}</v-alert>

					<div class="d-flex ga-2">
						<v-btn color="primary" :loading="applying" :disabled="busy" @click="onApply">
							{{ $t("plugins.flexibleLayouts.canAddress.applyButton") }}
						</v-btn>
						<v-btn variant="text" @click="step = 'form'">{{ $t("plugins.flexibleLayouts.canAddress.back") }}</v-btn>
					</div>
				</template>

				<template v-else-if="step === 'done'">
					<v-alert type="success" variant="tonal" density="comfortable" class="mb-3">
						{{ $t("plugins.flexibleLayouts.canAddress.doneHeading") }}
					</v-alert>
					<p class="text-body-2">{{ $t("plugins.flexibleLayouts.canAddress.doneBody") }}</p>
				</template>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="close">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";
import { showConfirmDialog } from "@/composables/useConfirmDialog";

import { can, requestAdmin } from "../model/access";
import {
	applyCanAddressRewrite, CAN_ADDRESS_MAX, CAN_ADDRESS_MIN, planCanAddressRewrite, sendCanAddressChange,
	type CanAddressFilePlan,
} from "../model/canAddress/change";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const machineStore = useMachineStore();

type Step = "form" | "preview" | "done";
const step = ref<Step>("form");

// Reprogramming a board's CAN address (and restarting it) is exactly the kind of live-hardware action
// that must never race a running job - same conservative "don't touch hardware right now" stance
// FirmwareUpdateWidget.vue takes for firmware updates, deliberately broader than just "printing".
const BUSY_STATUSES = new Set([
	"starting", "updating", "processing", "simulating", "pausing", "paused",
	"resuming", "cancelling", "busy", "changingTool", "halted",
]);
const busy = computed(() => BUSY_STATUSES.has(String(resolveOmPath(machineStore.model, "state.status") ?? "")));

interface RawBoard { canAddress?: number | null; name?: string; shortName?: string }
const boardItems = computed(() => {
	const arr = resolveOmPath(machineStore.model, "boards");
	if (!Array.isArray(arr)) { return []; }
	return (arr as Array<RawBoard | null>)
		.filter((b): b is RawBoard => !!b && typeof b.canAddress === "number" && b.canAddress > 0) // board 0 is the main board - M952 only reprograms expansion boards
		.map((b) => ({ title: `${b.canAddress}${b.name ? ` — ${b.name}` : ""}`, value: b.canAddress as number }));
});

const selectedAddress = ref<number | null>(null);
watch(boardItems, (items) => {
	if (selectedAddress.value == null && items.length > 0) { selectedAddress.value = items[0].value; }
}, { immediate: true });

const newAddress = ref<number | null>(null);

const validationError = computed(() => {
	if (selectedAddress.value == null) { return i18n.global.t("plugins.flexibleLayouts.canAddress.errorNoBoard"); }
	if (newAddress.value == null || !Number.isInteger(newAddress.value)) { return i18n.global.t("plugins.flexibleLayouts.canAddress.errorRange"); }
	if (newAddress.value < CAN_ADDRESS_MIN || newAddress.value > CAN_ADDRESS_MAX) { return i18n.global.t("plugins.flexibleLayouts.canAddress.errorRange"); }
	if (newAddress.value === selectedAddress.value) { return i18n.global.t("plugins.flexibleLayouts.canAddress.errorSameAddress"); }
	if (boardItems.value.some((b) => b.value === newAddress.value)) { return i18n.global.t("plugins.flexibleLayouts.canAddress.errorInUse"); }
	return null;
});

// --- Scan --------------------------------------------------------------------------------------------

const scanning = ref(false);
const plans = ref<Array<CanAddressFilePlan>>([]);

async function onScan(): Promise<void> {
	if (validationError.value || selectedAddress.value == null || newAddress.value == null) { return; }
	scanning.value = true;
	applyError.value = null;
	try {
		const io = defaultMachineIO();
		plans.value = await planCanAddressRewrite(io, selectedAddress.value, newAddress.value);
		step.value = "preview";
	} finally {
		scanning.value = false;
	}
}

// --- Apply ---------------------------------------------------------------------------------------------

const applying = ref(false);
const applyError = ref<string | null>(null);

async function onApply(): Promise<void> {
	if (selectedAddress.value == null || newAddress.value == null) { return; }
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	const ok = await showConfirmDialog(
		i18n.global.t("plugins.flexibleLayouts.canAddress.confirmTitle"),
		i18n.global.t("plugins.flexibleLayouts.canAddress.confirmBody", { old: selectedAddress.value, new: newAddress.value, count: plans.value.length }),
		"mdi-swap-horizontal",
	);
	if (!ok) { return; }
	applying.value = true;
	applyError.value = null;
	try {
		const io = defaultMachineIO();
		await applyCanAddressRewrite(io, plans.value);
		await sendCanAddressChange(io, selectedAddress.value, newAddress.value);
		step.value = "done";
		// The expansion board is now restarting itself, but the MAIN board's own in-memory drive
		// mapping (from the M584/M569 lines just rewritten in config.g) is only re-read at ITS next
		// boot - see change.ts's module doc comment. Offer that restart now rather than just telling
		// the user in doneBody and leaving it to them to remember, matching RestorePanel.vue's own
		// post-restore M999 prompt.
		const restartNow = await showConfirmDialog(
			i18n.global.t("plugins.flexibleLayouts.canAddress.promptRestartTitle"),
			i18n.global.t("plugins.flexibleLayouts.canAddress.promptRestartBody"),
			"mdi-restart",
		);
		if (restartNow) { await io.sendCode("M999"); }
	} catch (e) {
		applyError.value = e instanceof Error ? e.message : String(e);
	} finally {
		applying.value = false;
	}
}

watch(() => props.modelValue, (open) => {
	if (open) {
		step.value = "form";
		plans.value = [];
		applyError.value = null;
		newAddress.value = null;
	}
});

function close(): void {
	emit("update:modelValue", false);
}
</script>

<style scoped>
.can-line-diff {
	font-family: monospace;
	font-size: 0.8rem;
	white-space: pre-wrap;
	word-break: break-all;
}
.can-diff-before {
	color: rgb(var(--v-theme-error));
}
.can-diff-after {
	color: rgb(var(--v-theme-success));
}
.can-diff-tag {
	display: inline-block;
	width: 1.2em;
	font-weight: 700;
}
</style>
