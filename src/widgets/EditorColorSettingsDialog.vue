<style scoped>
.color-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
	gap: 0.5rem 1rem;
}
.color-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.color-swatch {
	inline-size: 2rem;
	block-size: 1.75rem;
	padding: 0;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 4px;
	background: none;
}
.preview-host {
	block-size: 10rem;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 4px;
	overflow: hidden;
}
.preview-host :deep(.cm-editor) {
	height: 100%;
	font-size: 0.8125rem;
}
</style>

<template>
	<v-dialog :model-value="modelValue" max-width="46rem" persistent :attach="props.attach" @update:model-value="onClose">
		<v-card :title="$t('plugins.flexibleLayouts.gcodeEditor.colors')">
			<v-card-subtitle>{{ $t("plugins.flexibleLayouts.gcodeEditor.colorsHint", { path: GCODE_EDITOR_COLORS_SD_PATH }) }}</v-card-subtitle>
			<v-card-text>
				<v-tabs v-model="mode" density="compact" class="mb-3">
					<v-tab value="light">{{ $t("plugins.flexibleLayouts.gcodeEditor.colorsLight") }}</v-tab>
					<v-tab value="dark">{{ $t("plugins.flexibleLayouts.gcodeEditor.colorsDark") }}</v-tab>
				</v-tabs>

				<div class="color-grid mb-3">
					<div v-for="key in COLOR_KEYS" :key="key" class="color-row">
						<label :for="inputId(key)" class="text-body-2">{{ $t(`plugins.flexibleLayouts.gcodeEditor.colorLabels.${key}`) }}</label>
						<input :id="inputId(key)" type="color" class="color-swatch" v-model="draft[mode][key]" />
					</div>
				</div>

				<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.gcodeEditor.colorsPreview") }}</div>
				<div ref="previewEl" class="preview-host"></div>
			</v-card-text>
			<v-card-actions>
				<v-btn variant="text" @click="resetToDefaults">{{ $t("plugins.flexibleLayouts.gcodeEditor.colorsReset") }}</v-btn>
				<v-spacer />
				<v-alert v-if="error !== null" type="error" variant="tonal" density="compact" class="mr-2 py-1">{{ error }}</v-alert>
				<v-btn variant="text" @click="onClose(false)">{{ $t("plugins.flexibleLayouts.gcodeEditor.colorsCancel") }}</v-btn>
				<v-btn :loading="saving" color="primary" @click="saveAndClose">{{ $t("plugins.flexibleLayouts.gcodeEditor.save") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
/**
 * Site-wide syntax color + background settings for the G-code editor, persisted to the SD card via
 * `editorColorSettings.ts` (the same file `duet-gcode-postprocessor` also reads/writes). `draft` is a
 * local, unsaved copy so Cancel/closing without Save never touches the shared `editorColorScheme` ref
 * every open editor instance is watching - only `saveAndClose` commits it.
 */
import { onBeforeUnmount, reactive, ref, watch } from "vue";
import {
	createEditorInstance, createThemeController, DEFAULT_COLOR_SCHEME_FILE, gcodeLanguage,
	GCODE_COLOR_SCHEME_KEYS, GCODE_EDITOR_COLORS_SD_PATH,
	type EditorInstance, type GcodeColorSchemeFile, type ThemeController,
} from "dwc-gcode-editor";

import { editorColorScheme, saveEditorColorScheme } from "../model/editorColorSettings";

// `attach` mirrors GcodeFilePickerDialog.vue's own pass-through - unset in real use, `attach: true`
// in tests so Vue Test Utils can see the (otherwise body-teleported) dialog content.
const props = defineProps<{ modelValue: boolean; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const COLOR_KEYS = GCODE_COLOR_SCHEME_KEYS;

function inputId(key: string): string {
	return `gcode-editor-color-${key}`;
}

const mode = ref<"light" | "dark">("light");
const saving = ref(false);
const error = ref<string | null>(null);
// editorColorScheme is null until the user has genuinely saved a customisation - DEFAULT_COLOR_SCHEME_FILE
// is only ever shown here as a starting point to edit, never applied on its own (see
// editorColorSettings.ts's own doc comment for why the shared ref itself stays null until then).
const draft = reactive<GcodeColorSchemeFile>(cloneScheme(editorColorScheme.value ?? DEFAULT_COLOR_SCHEME_FILE));

function cloneScheme(scheme: GcodeColorSchemeFile): GcodeColorSchemeFile {
	return { light: { ...scheme.light }, dark: { ...scheme.dark } };
}

watch(() => props.modelValue, (open) => {
	if (open) {
		Object.assign(draft, cloneScheme(editorColorScheme.value ?? DEFAULT_COLOR_SCHEME_FILE));
		mode.value = "light";
		error.value = null;
	}
});

function resetToDefaults(): void {
	Object.assign(draft, cloneScheme(DEFAULT_COLOR_SCHEME_FILE));
}

function onClose(value: boolean): void {
	if (!value) emit("update:modelValue", false);
}

async function saveAndClose(): Promise<void> {
	saving.value = true;
	error.value = null;
	try {
		await saveEditorColorScheme(cloneScheme(draft));
		emit("update:modelValue", false);
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
	} finally {
		saving.value = false;
	}
}

// --- Live preview -----------------------------------------------------------------------------
// Reuses the real ThemeController/createEditorInstance path production editors go through, rather
// than a hand-rolled color swatch - so what the user sees here is exactly what they'll get, not an
// approximation. A Compartment-based live swap (setCustomColors/setDark) on every draft change,
// not a full instance recreate, since a native <input type="color"> fires many "input" events while
// the user drags inside the browser's own picker.
const previewEl = ref<HTMLElement | null>(null);
const PREVIEW_TEXT = "if true\n\tG28 ; home all axes\n\tM104 S{200 + var.offset} T0\nvar offset = 1\n";
let previewInstance: EditorInstance | null = null;
let previewTheme: ThemeController | null = null;

watch(previewEl, (el) => {
	if (el === null) return;
	previewTheme = createThemeController(mode.value === "dark");
	previewInstance = createEditorInstance({
		doc: PREVIEW_TEXT,
		parent: el,
		extensions: [gcodeLanguage, previewTheme.extension],
	});
	previewTheme.setCustomColors(previewInstance.view, { light: draft.light, dark: draft.dark });
});

watch(mode, (m) => {
	if (previewInstance !== null && previewTheme !== null) previewTheme.setDark(previewInstance.view, m === "dark");
});

watch(draft, () => {
	if (previewInstance !== null && previewTheme !== null) {
		previewTheme.setCustomColors(previewInstance.view, { light: draft.light, dark: draft.dark });
	}
}, { deep: true });

onBeforeUnmount(() => {
	previewInstance?.destroy();
	previewInstance = null;
});
</script>
