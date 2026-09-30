<template>
	<div class="sound-settings">
		<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.sound.title") }}</div>
		<p class="text-body-small text-medium-emphasis mt-0 mb-2">{{ $t("plugins.flexibleLayouts.sound.hint") }}</p>

		<v-alert v-if="!supported" type="info" variant="tonal" density="compact" class="mb-2 sound-unsupported">
			{{ $t("plugins.flexibleLayouts.sound.unsupported") }}
		</v-alert>
		<v-alert v-else-if="!audioUnlocked" type="info" variant="tonal" density="compact" class="mb-2 sound-locked">
			{{ $t("plugins.flexibleLayouts.sound.needsGesture") }}
		</v-alert>

		<div class="d-flex align-center ga-3 flex-wrap">
			<v-switch :model-value="!settings.muted" color="primary" density="compact" hide-details class="sound-master"
					  :label="$t('plugins.flexibleLayouts.sound.enabled')" @update:model-value="updateSoundSettings({ muted: $event !== true })" />
			<v-btn size="small" variant="tonal" prepend-icon="mdi-volume-high" class="sound-test" :disabled="!supported" @click="playCue('chime', { force: true })">
				{{ $t("plugins.flexibleLayouts.sound.testSound") }}
			</v-btn>
		</div>
		<div class="d-flex align-center ga-2 mt-1" style="max-width: 360px">
			<v-icon size="small">mdi-volume-low</v-icon>
			<v-slider :model-value="settings.volume" :min="0" :max="1" :step="0.05" density="compact" hide-details thumb-size="14"
					  :aria-label="$t('plugins.flexibleLayouts.sound.volume')" :disabled="settings.muted"
					  @update:model-value="(v: number) => updateSoundSettings({ volume: v })" />
			<v-icon size="small">mdi-volume-high</v-icon>
		</div>

		<div class="text-caption text-medium-emphasis mt-3 mb-1">{{ $t("plugins.flexibleLayouts.sound.eventsHeading") }}</div>
		<div v-for="name in SOUND_EVENT_NAMES" :key="name" class="sound-event d-flex align-center ga-2 flex-wrap" :data-event="name">
			<v-switch :model-value="settings.events[name].on" color="primary" density="compact" hide-details class="sound-event-on flex-grow-1"
					  :label="$t(`plugins.flexibleLayouts.sound.events.${name}`)"
					  @update:model-value="updateSoundSettings({ events: { [name]: { on: $event === true } } })" />
			<v-select :model-value="settings.events[name].cue" :items="cueItems" density="compact" variant="outlined" hide-details
					  style="max-width: 150px" :aria-label="$t('plugins.flexibleLayouts.sound.cue')" :disabled="!settings.events[name].on"
					  @update:model-value="(v: string) => updateSoundSettings({ events: { [name]: { cue: v as CueName } } })" />
			<v-btn icon="mdi-play" size="x-small" variant="text" class="sound-event-test" :disabled="!supported"
				   :title="$t('plugins.flexibleLayouts.sound.test')" :aria-label="$t('plugins.flexibleLayouts.sound.test')"
				   @click="playCue(settings.events[name].cue, { force: true })" />
			<v-checkbox v-if="haptics" :model-value="settings.events[name].haptic" density="compact" hide-details class="sound-event-haptic flex-grow-0"
						:disabled="!settings.events[name].on" :label="$t('plugins.flexibleLayouts.sound.vibrate')"
						@update:model-value="updateSoundSettings({ events: { [name]: { haptic: $event === true } } })" />
		</div>

		<template v-if="haptics">
			<div class="d-flex align-center ga-3 mt-2 flex-wrap">
				<v-switch :model-value="settings.haptics" color="primary" density="compact" hide-details class="sound-haptics"
						  :label="$t('plugins.flexibleLayouts.sound.haptics')" @update:model-value="updateSoundSettings({ haptics: $event === true })" />
				<v-btn size="small" variant="tonal" prepend-icon="mdi-vibrate" class="haptic-test" :disabled="!settings.haptics" @click="vibrate([80, 60, 80])">
					{{ $t("plugins.flexibleLayouts.sound.testVibration") }}
				</v-btn>
			</div>
		</template>
		<p v-else class="text-caption text-medium-emphasis mt-2 mb-0 sound-no-haptics">{{ $t("plugins.flexibleLayouts.sound.noHaptics") }}</p>

		<p class="text-caption text-medium-emphasis mt-2 mb-0">{{ $t("plugins.flexibleLayouts.sound.backgroundNote") }}</p>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";

import {
	audioSupported, audioUnlocked, CUE_NAMES, type CueName, hapticsSupported, playCue, SOUND_EVENT_NAMES, soundSettings, updateSoundSettings, vibrate,
} from "../util/sound";

const settings = computed(() => soundSettings.value);
const supported = audioSupported();
// Vibration is feature-detected: the whole section is hidden, not broken, where there is no vibrate().
const haptics = hapticsSupported();
const cueItems = computed(() => CUE_NAMES.map((name) => ({ title: i18n.global.t(`plugins.flexibleLayouts.sound.cues.${name}`), value: name })));
</script>
