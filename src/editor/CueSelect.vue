<template>
	<div class="cue-select">
		<div class="d-flex align-center ga-2">
			<v-select :model-value="cue ?? null" :items="items" clearable density="compact" variant="outlined" hide-details persistent-placeholder
					  :label="label ?? $t('plugins.flexibleLayouts.sound.cue')" :placeholder="$t('plugins.flexibleLayouts.sound.none')"
					  @update:model-value="(v: string | null) => emit('update:cue', v ?? undefined)" />
			<v-btn icon="mdi-play" size="small" variant="tonal" :disabled="!cue" class="cue-test"
				   :title="$t('plugins.flexibleLayouts.sound.test')" :aria-label="$t('plugins.flexibleLayouts.sound.test')" @click="test" />
		</div>
		<v-text-field v-if="cue && showRepeat" :model-value="repeat ?? ''" type="number" :min="0" density="compact" variant="outlined"
					  hide-details clearable persistent-placeholder class="mt-2" suffix="s"
					  :label="$t('plugins.flexibleLayouts.sound.repeat')" :placeholder="$t('plugins.flexibleLayouts.sound.repeatOnce')"
					  @update:model-value="onRepeat" />
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";

import { CUE_NAMES, isCueName, playCue } from "../util/sound";

/** Picks one of the built-in cues (and, optionally, how often to repeat it while a condition holds). */
const props = defineProps<{ cue?: string; repeat?: number; label?: string; showRepeat?: boolean }>();
const emit = defineEmits<{ "update:cue": [string | undefined]; "update:repeat": [number | undefined] }>();

const items = computed(() => CUE_NAMES.map((name) => ({ title: i18n.global.t(`plugins.flexibleLayouts.sound.cues.${name}`), value: name })));

function onRepeat(v: string | number | null) {
	const n = Number(v);
	emit("update:repeat", v === null || v === "" || !Number.isFinite(n) || n <= 0 ? undefined : n);
}
// A test press is a user gesture, so it also lets the browser start audio.
function test() {
	if (props.cue && isCueName(props.cue)) { playCue(props.cue, { force: true }); }
}
</script>
