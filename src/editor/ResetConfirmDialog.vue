<template>
	<v-dialog :model-value="modelValue" max-width="480" persistent @update:model-value="onDialogToggle">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon color="error" class="me-2">mdi-alert-octagon</v-icon>
				{{ $t("plugins.flexibleLayouts.reset.title") }}
			</v-card-title>
			<v-card-text>
				<v-alert type="error" variant="tonal" density="comfortable" class="mb-3">
					{{ $t("plugins.flexibleLayouts.reset.warning") }}
				</v-alert>
				<p class="text-body-2">{{ $t("plugins.flexibleLayouts.reset.body") }}</p>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="cancel">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="error" variant="flat" :disabled="secondsLeft > 0" @click="confirm">
					{{ secondsLeft > 0
						? $t("plugins.flexibleLayouts.reset.confirmCountdown", { seconds: secondsLeft })
						: $t("plugins.flexibleLayouts.reset.confirm") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

const COUNTDOWN_SECONDS = 5;

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; confirmed: [] }>();

// Ticks down once a second while the dialog is open, re-arming on every re-open. The confirm button
// stays disabled until this hits 0, so a reflex click can't trigger an irreversible wipe.
const secondsLeft = ref(COUNTDOWN_SECONDS);
let timer: ReturnType<typeof setInterval> | undefined;

function stopCountdown(): void {
	if (timer !== undefined) {
		clearInterval(timer);
		timer = undefined;
	}
}
function startCountdown(): void {
	stopCountdown();
	secondsLeft.value = COUNTDOWN_SECONDS;
	timer = setInterval(() => {
		secondsLeft.value = Math.max(0, secondsLeft.value - 1);
		if (secondsLeft.value === 0) {
			stopCountdown();
		}
	}, 1000);
}

watch(
	() => props.modelValue,
	(open) => { if (open) { startCountdown(); } else { stopCountdown(); } },
	{ immediate: true },
);
onBeforeUnmount(stopCountdown);

function cancel(): void {
	emit("update:modelValue", false);
}
function confirm(): void {
	if (secondsLeft.value > 0) {
		return;
	}
	emit("update:modelValue", false);
	emit("confirmed");
}
function onDialogToggle(open: boolean): void {
	if (!open) {
		cancel();
	}
}
</script>
