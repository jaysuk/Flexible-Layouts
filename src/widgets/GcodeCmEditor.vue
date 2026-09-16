<style scoped>
.gcode-cm-editor {
	min-height: 0;
}
.gcode-cm-editor-host {
	min-height: 0;
	overflow: hidden;
}
.gcode-cm-editor-host :deep(.cm-editor) {
	height: 100%;
}
.gcode-cm-editor-host :deep(.cm-scroller) {
	overflow: auto;
	font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
	font-size: 0.8125rem;
}
</style>

<template>
	<div class="d-flex flex-column fill-height gcode-cm-editor">
		<v-toolbar density="compact" color="surface" class="flex-shrink-0">
			<v-btn :loading="saving" :disabled="!dirty || loading" icon="mdi-content-save-outline"
				   :title="$t('plugins.flexibleLayouts.gcodeEditor.save')" @click="save" />
			<v-btn :loading="checking" :disabled="loading" icon="mdi-alert-circle-check-outline"
				   :title="$t('plugins.flexibleLayouts.gcodeEditor.checkErrors')" @click="checkForErrors" />
			<span v-if="diagnosticCount !== null" class="text-caption text-medium-emphasis ml-1">
				{{ diagnosticCount }}
			</span>
			<v-spacer />
			<span class="text-caption text-medium-emphasis text-truncate">{{ basename(filename) }}{{ dirty ? " *" : "" }}</span>
		</v-toolbar>
		<v-alert v-if="loadError !== null" type="error" variant="tonal" density="compact" class="ma-2">
			{{ loadError }}
		</v-alert>
		<v-progress-linear v-if="loading" indeterminate />
		<div ref="hostEl" class="flex-grow-1 gcode-cm-editor-host"></div>
	</div>
</template>

<script setup lang="ts">
/**
 * The `dwc-gcode-editor` alternative to DWC's own bundled `MonacoEditor` for a G-code file -
 * `ExplorerPanel.vue` renders this one instead when `editorPreference.ts`'s toggle is on and the
 * file is G-code syntax. Deliberately mirrors `MonacoEditor.vue`'s own external contract exactly
 * (a bare `filename` prop, `dirty`/`saved` emits) so swapping between the two needs no other change
 * at the call site - see `docs/gcode-editor-plan.md` in `duet-gcode-postprocessor` for the design
 * this implements, and that repo's own `GcodeEditor.vue` for the sibling, read-only-plus-diagnostics
 * version of this same idea (this one additionally saves, matching what this panel actually needs
 * Monaco for here).
 */
import { onUnmounted, ref, shallowRef, watch } from "vue";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { EditorView, lineNumbers } from "@codemirror/view";
import { diagnoseDocument, parseDocument } from "dwc-gcode-core";
import {
	applyDiagnostics, buildDocFromString, createEditorInstance, gcodeLanguage, gcodeLintUi,
	type EditorInstance,
} from "dwc-gcode-editor";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

const props = defineProps<{ filename: string }>();
const emit = defineEmits<{ dirty: [boolean]; saved: [string] }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const hostEl = ref<HTMLElement | null>(null);
const loading = ref(true);
const saving = ref(false);
const checking = ref(false);
const loadError = ref<string | null>(null);
const dirty = ref(false);
const diagnosticCount = ref<number | null>(null);
// shallowRef: EditorInstance wraps a live CM6 EditorView - Vue must never try to deep-reactive-proxy it.
const editorInstance = shallowRef<EditorInstance | null>(null);

function basename(path: string): string {
	return path.replace(/\/+$/, "").split("/").pop() || path;
}

function setDirty(value: boolean): void {
	dirty.value = value;
	emit("dirty", value);
}

function editorExtensions() {
	return [
		lineNumbers(),
		gcodeLanguage,
		syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
		gcodeLintUi(),
		lintGutter(),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) setDirty(true);
		}),
	];
}

async function load(): Promise<void> {
	loading.value = true;
	loadError.value = null;
	try {
		const content = await machineStore.download({ filename: props.filename, type: "text" }, false, false, false, false) as string;
		const doc = await buildDocFromString(content);
		editorInstance.value?.destroy();
		if (hostEl.value === null) return;
		editorInstance.value = createEditorInstance({ doc, parent: hostEl.value, extensions: editorExtensions() });
		setDirty(false);
	} catch (e) {
		loadError.value = i18n.global.t("plugins.flexibleLayouts.gcodeEditor.loadFailed", {
			name: basename(props.filename), error: (e as Error)?.message ?? String(e),
		});
	} finally {
		loading.value = false;
	}
}

async function save(): Promise<void> {
	const instance = editorInstance.value;
	if (instance === null || saving.value) return;
	saving.value = true;
	try {
		const content = instance.flush().toString();
		await machineStore.upload({ filename: props.filename, content: new Blob([content]) }, false, false, false, false);
		setDirty(false);
		uiStore.makeNotification(LogLevel.success, basename(props.filename),
			i18n.global.t("plugins.flexibleLayouts.gcodeEditor.saved", { name: basename(props.filename) }));
		emit("saved", props.filename);
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, basename(props.filename),
			i18n.global.t("plugins.flexibleLayouts.gcodeEditor.saveFailed", {
				name: basename(props.filename), error: (e as Error)?.message ?? String(e),
			}));
	} finally {
		saving.value = false;
	}
}

async function checkForErrors(): Promise<void> {
	const instance = editorInstance.value;
	if (instance === null) return;
	checking.value = true;
	try {
		const text = instance.view.state.doc.toString();
		const parsed = parseDocument(text);
		const firmwareVersion = (machineStore.model as { boards?: Array<{ firmwareVersion?: string }> })?.boards?.[0]?.firmwareVersion ?? "0.0.0";
		const diagnostics = diagnoseDocument(parsed, props.filename, { firmwareVersion });
		applyDiagnostics(instance.view, diagnostics);
		diagnosticCount.value = diagnostics.length;
	} finally {
		checking.value = false;
	}
}

watch(hostEl, (el) => { if (el !== null) void load(); }, { immediate: true });

onUnmounted(() => editorInstance.value?.destroy());

// `save` mirrors MonacoEditor.vue's own exposed surface. `editorInstance` is additionally exposed
// (read-only in spirit - callers should only ever dispatch through `.view`) purely so tests can
// drive a real CM6 edit directly, the same way this family's other editor tests do when a
// synthetic DOM `beforeinput`/composition event under happy-dom would be unreliable to fake.
defineExpose({ save, editorInstance });
</script>
