<template>
	<div class="hotkey-field">
		<v-text-field :model-value="shown" readonly density="compact" variant="outlined" persistent-placeholder
					  :label="$t('plugins.flexibleLayouts.hotkey.label')" :placeholder="recording ? $t('plugins.flexibleLayouts.hotkey.recording') : $t('plugins.flexibleLayouts.hotkey.none')"
					  :hint="$t('plugins.flexibleLayouts.hotkey.hint')" persistent-hint
					  :error-messages="problemText ? [problemText] : []"
					  :aria-label="$t('plugins.flexibleLayouts.hotkey.label')"
					  class="hotkey-input" @keydown="onKeydown" @focus="onFocus" @blur="onBlur">
			<template v-if="modelValue" #append-inner>
				<v-btn icon="mdi-close" size="x-small" variant="text" density="comfortable" class="hotkey-clear"
					   :title="$t('plugins.flexibleLayouts.hotkey.clear')" :aria-label="$t('plugins.flexibleLayouts.hotkey.clear')"
					   @click.stop="emit('update:modelValue', undefined)" />
			</template>
		</v-text-field>
		<!-- Beside the field, not in its `messages`: the always-on hint above would hide it. -->
		<div v-if="duplicate" class="text-caption text-warning mt-1 hotkey-duplicate" role="status">
			{{ $t("plugins.flexibleLayouts.hotkey.duplicate") }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import i18n from "@/i18n";

import { canonicalizeHotkey, eventToHotkey, formatHotkey, validateHotkey } from "../model/hotkeys";

/**
 * Records a keyboard shortcut: focus the field and press the combination. Rejects combinations the browser or OS
 * owns, and ones without Ctrl/Alt (or an F-key) that would just be typing. Tab still moves focus on, so the field
 * is never a keyboard trap; Backspace/Delete clear it; Escape gives up.
 */
const props = defineProps<{ modelValue?: string; taken?: Array<string> }>();
const emit = defineEmits<{ "update:modelValue": [string | undefined] }>();

const recording = ref(false);
const problem = ref<"invalid" | "needsModifier" | "reserved" | null>(null);

const shown = computed(() => (props.modelValue ? formatHotkey(props.modelValue) : ""));
const problemText = computed(() => (problem.value ? i18n.global.t(`plugins.flexibleLayouts.hotkey.problem.${problem.value}`) : ""));
const duplicate = computed(() => {
	const mine = canonicalizeHotkey(props.modelValue);
	return !!mine && (props.taken ?? []).some((t) => canonicalizeHotkey(t) === mine);
});

function onFocus() { recording.value = true; problem.value = null; }
function onBlur() { recording.value = false; problem.value = null; }

function onKeydown(e: KeyboardEvent) {
	const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
	if (e.key === "Tab" && bare) { return; } // let focus move on
	if (e.key === "Escape" && bare) { e.preventDefault(); (e.target as HTMLElement | null)?.blur(); return; }
	e.preventDefault();
	e.stopPropagation();
	if (bare && (e.key === "Backspace" || e.key === "Delete")) {
		problem.value = null;
		emit("update:modelValue", undefined);
		return;
	}
	const combo = eventToHotkey(e);
	if (!combo) { return; } // a modifier on its own, or a key we cannot bind: keep waiting
	const v = validateHotkey(combo);
	if (!v.ok) { problem.value = v.reason; return; }
	problem.value = null;
	emit("update:modelValue", v.combo);
}
</script>
