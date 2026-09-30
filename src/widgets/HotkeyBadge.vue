<template>
	<span v-if="text" class="fl-hotkey-badge" aria-hidden="true">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { formatHotkey, hotkeysEnabled, validateHotkey } from "../model/hotkeys";

/** A small key hint in the corner of a button (view mode). Shown only for a valid combo, while hotkeys are on. */
const props = defineProps<{ combo?: string }>();
const text = computed(() => (hotkeysEnabled.value && validateHotkey(props.combo).ok ? formatHotkey(props.combo) : ""));
</script>

<style scoped>
.fl-hotkey-badge {
	position: absolute;
	right: 6px;
	bottom: 4px;
	z-index: 1;
	padding: 0 4px;
	border-radius: 3px;
	font-size: 0.65em;
	line-height: 1.5;
	font-family: monospace;
	color: rgb(var(--v-theme-on-surface));
	background: rgba(var(--v-theme-surface), 0.75);
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	pointer-events: none;
}
</style>
