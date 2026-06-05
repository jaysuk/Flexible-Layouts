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
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "input" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const val = ref<string | number>(props.widget.default ?? "");
const busy = ref(false);

// For global mode, prefill the field with the variable's current value once it's available.
const currentGlobal = computed(() =>
	props.widget.mode === "global" && props.widget.globalName
		? resolveOmPath(machineStore.model, `global.${props.widget.globalName}`)
		: undefined);

watch(
	currentGlobal,
	(v) => {
		if (v !== undefined && v !== null && (val.value === "" || val.value === undefined)) {
			val.value = v as string | number;
		}
	},
	{ immediate: true },
);

async function send() {
	let code = "";
	if (props.widget.mode === "global" && props.widget.globalName) {
		const rhs = props.widget.inputKind === "number" ? Number(val.value) : `"${val.value}"`;
		code = `set global.${props.widget.globalName}=${rhs}`;
	} else if (props.widget.commandTemplate) {
		code = props.widget.commandTemplate.replace(/\{value\}/g, String(val.value));
	}
	if (!code) {
		return;
	}
	busy.value = true;
	try {
		await machineStore.sendCode(code, false, false);
	} catch {
		// surfaced by the UI store
	} finally {
		busy.value = false;
	}
}
</script>
