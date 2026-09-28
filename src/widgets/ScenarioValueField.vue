<style scoped>
.scenario-field :deep(input) {
	font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
	font-size: 0.8125rem;
}
</style>

<template>
	<v-text-field v-model="draft" density="compact" hide-details variant="outlined" class="scenario-field"
				  :label="label" :placeholder="placeholder" :aria-label="ariaLabel ?? label ?? placeholder"
				  :clearable="clearable" spellcheck="false" autocomplete="off"
				  @blur="commit" @keyup.enter="commit" @click:clear="onClear" />
</template>

<script setup lang="ts">
/**
 * A text field that keeps what's being typed to itself and reports it once, on blur or Enter - so a
 * half-typed value never rebuilds a whole simulation run, and typing `1` on the way to `12` doesn't
 * flash through a different scenario. Emits the raw text; the parent decides what it means (a number,
 * an object-model value, ...). An emptied field commits "" so the parent can treat it as "unset".
 */
import { ref, watch } from "vue";

const props = defineProps<{
	/** The committed value, as text. Changing it from outside (a reset, another edit) replaces the draft. */
	modelValue: string;
	label?: string;
	placeholder?: string;
	ariaLabel?: string;
	clearable?: boolean;
}>();
const emit = defineEmits<{ commit: [text: string] }>();

const draft = ref<string | null>(props.modelValue);
watch(() => props.modelValue, (value) => { draft.value = value; });

function commit(): void {
	const text = draft.value ?? "";
	if (text !== props.modelValue) emit("commit", text);
}

function onClear(): void {
	draft.value = "";
	emit("commit", "");
}
</script>
