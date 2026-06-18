<template>
	<div class="fill-height pa-1">
		<v-btn :color="overrideColor || widget.color || 'primary'" variant="flat" block
			   class="fill-height text-none flex-cmd-btn"
			   :disabled="uiStore.uiFrozen || disabled" :loading="busy" @click="onClick">
			<div class="d-flex align-center justify-center ga-1" :class="iconLayoutClass">
				<v-icon v-if="widget.icon" :size="iconSize">{{ widget.icon }}</v-icon>
				<span v-if="widget.label" class="text-truncate flex-cmd-label">{{ widget.label }}</span>
			</div>
		</v-btn>

		<v-dialog v-model="confirmOpen" max-width="400">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.widgets.confirmTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">{{ $t("plugins.flexibleLayouts.widgets.confirmText") }}</div>
					<pre class="text-body-2 bg-surface-variant rounded pa-2">{{ widget.code }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn :color="widget.color || 'primary'" @click="confirmSend">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{
	widget: Extract<Widget, { type: "codeButton" }>;
	overrideColor?: string;
	disabled?: boolean;
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

// An explicit size wins; otherwise the icon is em-relative so it tracks the panel's typography
// font-size (the button itself inherits that font-size — see the style below).
const iconSize = computed(() => (props.widget.iconSize && props.widget.iconSize > 0
	? `${props.widget.iconSize}px`
	: "1.5em"));

// Icon placement relative to the label: top (default, stacked), bottom, or inline left/right.
const iconLayoutClass = computed(() => {
	switch (props.widget.iconPosition) {
		case "left": return "flex-row";
		case "right": return "flex-row-reverse";
		case "bottom": return "flex-column-reverse";
		default: return "flex-column";
	}
});

const busy = ref(false);
const confirmOpen = ref(false);

// Debounce guard: ignore repeat presses within `debounceMs` of the last accepted one.
let lastFire = 0;
function debounced(): boolean {
	const ms = props.widget.debounceMs ?? 0;
	if (ms <= 0) {
		return false;
	}
	const now = Date.now();
	if (now - lastFire < ms) {
		return true;
	}
	lastFire = now;
	return false;
}

async function send() {
	const action = props.widget.action ?? "gcode";
	busy.value = true;
	try {
		if (action === "url") {
			if (props.widget.url) {
				window.open(props.widget.url, "_blank", "noopener");
			}
		} else if (action === "http") {
			if (props.widget.url) {
				const res = await fetch(props.widget.url, { method: "GET", mode: "cors" });
				if (res.ok) {
					uiStore.log(LogLevel.success, i18n.global.t("plugins.flexibleLayouts.widgets.httpOk", { status: res.status }));
				} else {
					uiStore.log(LogLevel.warning, i18n.global.t("plugins.flexibleLayouts.widgets.httpFail", { status: res.status }));
				}
			}
		} else {
			await machineStore.sendCode(props.widget.code, false, false);
		}
	} catch (e) {
		uiStore.log(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.widgets.actionError", { error: (e as Error).message }));
	} finally {
		busy.value = false;
	}
}

function onClick() {
	if (debounced()) {
		return;
	}
	if (props.widget.confirm) {
		confirmOpen.value = true;
	} else {
		void send();
	}
}

function confirmSend() {
	confirmOpen.value = false;
	void send();
}
</script>

<style scoped>
.flex-cmd-btn {
	min-height: 100%;
	white-space: normal;
	/* Inherit the panel's typography font-size (Vuetify buttons otherwise pin their own), so both the
	   label and the em-sized icon scale with the per-panel typography setting. */
	font-size: inherit;
}
/* Allow the label to ellipsis inside a flex row (icon-left/right layouts). */
.flex-cmd-label {
	min-width: 0;
}
</style>
