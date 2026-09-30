<template>
	<div class="ls-root d-flex align-center ga-1">
		<v-btn v-if="lockable && !numeric" icon size="x-small" variant="text" class="ls-lock flex-shrink-0"
			   :color="locked ? 'error' : undefined" :disabled="disabled"
			   :title="locked ? $t('plugins.flexibleLayouts.slider.unlock') : $t('plugins.flexibleLayouts.slider.lock')"
			   :aria-label="locked ? $t('plugins.flexibleLayouts.slider.unlock') : $t('plugins.flexibleLayouts.slider.lock')"
			   @click="locked = !locked">
			<v-icon size="16">{{ locked ? "mdi-lock" : "mdi-lock-open-variant-outline" }}</v-icon>
		</v-btn>

		<!-- DWC's "numeric inputs" setting: a typed value instead of a drag handle, so a stray touch can't move it. -->
		<v-text-field v-if="numeric" type="number" density="compact" variant="outlined" hide-details class="ls-number"
					  :model-value="text" :min="min" :max="max" :step="step" :suffix="suffix" :disabled="disabled"
					  @focus="editing = true" @update:model-value="(v: string) => (text = String(v))"
					  @keydown.enter="commit" @blur="commit" />
		<v-slider v-else :model-value="modelValue" :min="min" :max="max" :step="step" :color="color || 'primary'"
				  density="compact" hide-details thumb-size="14" :disabled="disabled" :readonly="lockable && locked"
				  @update:model-value="(v: number) => emit('update:modelValue', v)" @end="(v: number) => emit('end', v)" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useSettingsStore } from "@/stores/settings";

import { useFlexDisplay } from "../composables/useFlexDisplay";

/**
 * A `v-slider` that honours DWC's slider preferences (Settings > Behaviour): the lock button
 * (`lockableSliders`: always / phones only / never) and numeric entry (`numericInputs`). Both are
 * what stock DWC's PercentageInput does for the fan and factor panels; FL's own sliders use this so
 * they behave the same. Emits `update:modelValue` while the value is being changed and `end` once it is committed
 * (handle released, or Enter/blur in numeric mode).
 */
const props = defineProps<{
	modelValue: number;
	min: number;
	max: number;
	step: number;
	color?: string;
	disabled?: boolean;
	/** Shown after the number in numeric mode ("%", "rpm"). */
	suffix?: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: number): void; (e: "end", v: number): void }>();

const settings = useSettingsStore() as { behaviour?: { numericInputs?: boolean; lockableSliders?: string } };
const { mobile } = useFlexDisplay();

const numeric = computed(() => settings.behaviour?.numericInputs === true);
const lockable = computed(() => {
	const mode = settings.behaviour?.lockableSliders ?? "mobile";
	return mode === "always" || (mode === "mobile" && mobile?.value === true);
});
// Starts locked, like DWC's: the lock exists to stop an accidental drag, so it re-arms on every mount.
const locked = ref(true);

const editing = ref(false);
const text = ref(String(props.modelValue));
watch(() => props.modelValue, (v) => { if (!editing.value) { text.value = String(v); } });

function commit(): void {
	editing.value = false;
	const typed = Number(text.value);
	if (text.value.trim() === "" || !Number.isFinite(typed)) {
		text.value = String(props.modelValue);
		return;
	}
	const clamped = Math.min(props.max, Math.max(props.min, typed));
	text.value = String(clamped);
	if (clamped !== props.modelValue) {
		emit("update:modelValue", clamped);
		emit("end", clamped);
	}
}
</script>

<style scoped>
.ls-root { min-width: 0; flex: 1 1 auto; }
.ls-root :deep(.v-slider) { min-width: 0; flex: 1 1 auto; }
.ls-number { max-width: 9em; }
</style>
