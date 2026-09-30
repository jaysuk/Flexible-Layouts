<template>
	<div class="fs-root fill-height d-flex align-center flex-wrap ga-1 px-1">
		<v-btn v-if="showFullscreen && fsAvailable" variant="tonal" size="small" class="text-none fs-btn" :color="isFullscreen ? (overrideColor || widget.color || 'primary') : undefined"
			   :prepend-icon="isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" :aria-pressed="isFullscreen" @click="toggleFullscreen">
			{{ isFullscreen ? $t("plugins.flexibleLayouts.screen.exitFullscreen") : $t("plugins.flexibleLayouts.screen.fullscreen") }}
		</v-btn>

		<v-btn v-if="showKiosk" variant="tonal" size="small" class="text-none fs-btn fs-kiosk" :color="kioskActive ? (overrideColor || widget.color || 'primary') : undefined"
			   :prepend-icon="kioskActive ? 'mdi-monitor-off' : 'mdi-monitor-dashboard'" :aria-pressed="kioskActive" @click="toggleKiosk">
			{{ kioskActive ? $t("plugins.flexibleLayouts.screen.exitKiosk") : $t("plugins.flexibleLayouts.screen.kiosk") }}
		</v-btn>

		<span v-if="showKeepAwake" class="fs-awake d-inline-flex" :title="awakeReasonText">
			<v-btn variant="tonal" size="small" class="text-none fs-btn fs-awake-btn" :disabled="awakeReason !== null"
				   :color="keepAwakeActive ? (overrideColor || widget.color || 'primary') : undefined"
				   :prepend-icon="keepAwakeActive ? 'mdi-sleep-off' : 'mdi-sleep'" :aria-pressed="keepAwakeActive" @click="toggleAwake">
				{{ $t("plugins.flexibleLayouts.screen.keepAwake") }}
			</v-btn>
		</span>
		<span v-if="showKeepAwake && awakeReason" class="fs-awake-why text-caption text-medium-emphasis">{{ awakeReasonText }}</span>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";

import i18n from "@/i18n";

import type { Widget } from "../model/document";
import {
	enterFullscreen, enterKiosk, exitFullscreen, exitKiosk, fullscreenSupported, isFullscreen, keepAwakeActive,
	keepAwakeUnavailableReason, keepAwakeWanted, kioskActive, setKeepAwake, toggleFullscreen, watchFullscreen,
} from "../model/screenState";

const props = defineProps<{ widget: Extract<Widget, { type: "fullscreen" }>; overrideColor?: string }>();

// Each control is on unless switched off, so an old/blank widget shows all three.
const showFullscreen = computed(() => props.widget.showFullscreen !== false);
const showKiosk = computed(() => props.widget.showKiosk !== false);
const showKeepAwake = computed(() => props.widget.showKeepAwake !== false);

// Not reactive to browser support (it never changes mid-session) - checked once.
const fsAvailable = fullscreenSupported();
const awakeReason = keepAwakeUnavailableReason();
const awakeReasonText = computed(() => awakeReason === null ? "" : i18n.global.t(`plugins.flexibleLayouts.screen.awakeUnavailable.${awakeReason}`));

onMounted(() => watchFullscreen());

async function toggleKiosk(): Promise<void> {
	if (kioskActive.value) {
		// Leaving may ask for the Admin password; only leave fullscreen if it was given.
		if (await exitKiosk() && props.widget.kioskFullscreen !== false) { await exitFullscreen(); }
		return;
	}
	enterKiosk();
	if (props.widget.kioskFullscreen !== false && fsAvailable) { await enterFullscreen(); }
}

async function toggleAwake(): Promise<void> {
	await setKeepAwake(!keepAwakeWanted.value);
}
</script>

<style scoped>
.fs-root { min-height: 0; }
.fs-awake-why { max-width: 22em; line-height: 1.2; }
</style>
