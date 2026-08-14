<template>
	<div class="fill-height d-flex flex-column justify-center pa-2">
		<div v-if="widget.label" class="text-caption text-medium-emphasis mb-1 text-truncate">
			{{ widget.label }}
		</div>
		<div class="d-flex ga-1 align-center">
			<v-text-field v-model="val" :type="widget.inputKind === 'number' ? 'number' : 'text'"
						  density="compact" variant="outlined" hide-details
						  :disabled="uiStore.uiFrozen || disabled" @keyup.enter="send" />
			<v-btn icon="mdi-send" :color="widget.color || 'primary'" variant="flat" size="small"
				   :disabled="uiStore.uiFrozen || disabled" :loading="busy"
				   :title="$t('plugins.flexibleLayouts.widgets.send')" @click="send" />
		</div>
		<!-- What this box actually sets - without a label, or with several of these on one layout,
			 there was nothing on the widget itself distinguishing one from another. -->
		<div v-if="targetCaption" class="text-caption text-medium-emphasis text-truncate mt-1" style="font-size: 0.7em; opacity: 0.7;">
			{{ targetCaption }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { applyInputModifier, invertLinear } from "../util/inputModifier";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "input" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const val = ref<string | number>(props.widget.default ?? "");
const busy = ref(false);

// What this box is actually going to do, shown as a small caption - the only way to tell two input
// widgets apart on a layout that has more than one, previously.
const targetCaption = computed(() => {
	if (props.widget.mode === "global" && props.widget.globalName) return `global.${props.widget.globalName}`;
	if (props.widget.commandTemplate) return props.widget.commandTemplate;
	return null;
});

// For global mode, prefill the field with the variable's current value once it's available.
const currentGlobal = computed(() =>
	props.widget.mode === "global" && props.widget.globalName
		? resolveOmPath(machineStore.model, `global.${props.widget.globalName}`)
		: undefined);

watch(
	currentGlobal,
	(v) => {
		if (v !== undefined && v !== null && (val.value === "" || val.value === undefined)) {
			// Show the user-facing number: invert the linear part of the modifier. invertLinear returns
			// null when an expression/map is set (can't auto-invert) — then we leave the field as-is.
			if (typeof v === "number") {
				const inv = invertLinear(v, props.widget.modifier);
				if (inv !== null) {
					val.value = inv;
				}
			} else {
				val.value = v as string | number;
			}
		}
	},
	{ immediate: true },
);

async function send() {
	// Transform the entered value before it leaves the widget (units, scaling, value map, …).
	const sent = applyInputModifier(val.value, props.widget.modifier);
	let code = "";
	if (props.widget.mode === "global" && props.widget.globalName) {
		const rhs = props.widget.inputKind === "number" ? sent : `"${sent}"`;
		code = `set global.${props.widget.globalName}=${rhs}`;
	} else if (props.widget.commandTemplate) {
		code = props.widget.commandTemplate.replace(/\{value\}/g, sent);
	}
	if (!code) {
		return;
	}
	busy.value = true;
	try {
		await machineStore.sendCode(code, false, false);
	} catch (e) {
		// NOT "surfaced by the UI store" - that was true only with logReply=true. This call passes
		// false (so a routine, expected reply isn't also logged as a console event), which ALSO
		// suppresses DWC's own automatic error logging for a FAILED code - confirmed by reading
		// machine.ts's sendCode() directly. A failed `set global.X=...` (e.g. X was never declared)
		// was silently swallowed here with nothing shown to the operator at all.
		uiStore.makeNotification(LogLevel.error, "Command failed", (e as Error)?.message ?? String(e));
	} finally {
		busy.value = false;
	}
}
</script>
