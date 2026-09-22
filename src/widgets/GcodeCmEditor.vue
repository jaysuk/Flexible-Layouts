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
			<v-btn :disabled="loading" icon="mdi-magnify" title="Search (Ctrl+F)" @click="openSearch" />
			<v-btn :disabled="loading" icon="mdi-help-circle-outline" title="G-code reference"
				   :href="docsUrl" target="_blank" rel="noopener noreferrer" />
			<v-btn :disabled="loading" icon="mdi-format-indent-increase" title="Align comments" @click="alignComments" />
			<v-btn v-if="canRun" :loading="running" :disabled="loading || uiStore.uiFrozen" icon="mdi-play"
				   title="Run" @click="run" />
			<v-btn :disabled="!dirty || loading" icon="mdi-restore" title="Revert" @click="revert" />
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
 * file is G-code syntax. Deliberately mirrors `MonacoEditor.vue`'s own external contract exactly -
 * `filename`/`initialContent` props, `dirty`/`saved` emits, an exposed `focus()` and a `save()`
 * that returns `Promise<boolean>` - so swapping between the two needs no other change at the call
 * site, and so this same component satisfies DWC core's `FileEditorEntry` contract (PR #519,
 * `registerFileEditor`) when used to replace Monaco on DWC's own native Explorer page. See
 * `docs/gcode-editor-plan.md` in `duet-gcode-postprocessor` for the design this implements, and
 * that repo's own `GcodeEditor.vue` for the sibling, read-only-plus-diagnostics version of this same
 * idea (this one additionally saves, matching what this panel actually needs Monaco for here).
 */
import { computed, onUnmounted, ref, shallowRef, watch } from "vue";
import { DisconnectedError } from "@duet3d/connectors";
import { lintGutter } from "@codemirror/lint";
import { EditorView, lineNumbers } from "@codemirror/view";
import { diagnoseDocument, parseDocument } from "dwc-gcode-core";
import {
	alignLineComments, applyDiagnostics, buildDocFromString, codeAtCursor, createEditorInstance,
	createThemeController, gcodeCompletion, gcodeLanguage, gcodeLintUi, gcodeSearch, openSearchPanel,
	saveKeymap, type EditorInstance, type ThemeController,
} from "dwc-gcode-editor";
import type { Text } from "@codemirror/state";

import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

// DWC's own Path.escapeFilename (src/utils/path.ts) is not in a plugin's externalised import
// surface (only @/plugins, @/stores/*, and DWC's public component palette are - see this repo's own
// CLAUDE.md and dwc-plugin-test-kit's typecheck.mjs) - ported as the one real line it is rather than
// pulled in, for embedding a filename inside M98's own quoted string argument.
function escapeFilename(filename: string): string {
	return filename.replace(/'/g, "''");
}

// DWC's own Path.startsWith (same file, same reason as escapeFilename above) - normalises a leading
// "/" to "0:/" and strips a trailing "/" on both sides before comparing, so "0:/gcodes" and "/gcodes/"
// are recognised as the same directory. Ported faithfully since this drives a real safety gate
// (whether Run is even offered), not approximated.
function pathStartsWith(path: string, value: string): boolean {
	if (!path || !value) return false;
	if (path.startsWith("/")) path = "0:" + path;
	if (path.endsWith("/")) path = path.slice(0, -1);
	if (value.startsWith("/")) value = "0:" + value;
	if (value.endsWith("/")) value = value.slice(0, -1);
	return path.startsWith(value);
}

const props = defineProps<{
	filename: string;
	/** Pre-fetched content (e.g. from a route data loader) - when set, the on-mount download is
	 *  skipped and the editor opens with this text already loaded. Mirrors MonacoEditor.vue's own
	 *  `initialContent` prop exactly, since `FileEditorEntry`'s contract requires it. */
	initialContent?: string;
}>();
const emit = defineEmits<{ dirty: [boolean]; saved: [string] }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();
// Narrow cast, matching this repo's own convention elsewhere - this component only reads one field.
const settingsStore = useSettingsStore() as unknown as { darkTheme: boolean };

const hostEl = ref<HTMLElement | null>(null);
const loading = ref(true);
const saving = ref(false);
const checking = ref(false);
const loadError = ref<string | null>(null);
const dirty = ref(false);
const diagnosticCount = ref<number | null>(null);
const cursorCode = ref<string | null>(null);
const running = ref(false);
// shallowRef: EditorInstance wraps a live CM6 EditorView - Vue must never try to deep-reactive-proxy it.
const editorInstance = shallowRef<EditorInstance | null>(null);
// One ThemeController per instance (a Compartment belongs to exactly one EditorView) - this
// component is mounted fresh per filename (see ExplorerPanel.vue's tab-per-file model), so
// load() only ever runs once and this is only ever set once.
let themeController: ThemeController | null = null;
// Snapshot of the document as loaded, for revert() - a real CM6 Text, not a string (ChangeSpec's
// `insert` field accepts one directly, no round-trip needed).
let originalDoc: Text | null = null;

const docsUrl = computed(() => {
	const base = "https://docs.duet3d.com/en/User_manual/Reference/Gcodes";
	return cursorCode.value !== null ? `${base}/${cursorCode.value}` : base;
});

// Mirrors MonacoEditor.vue's own canRun exactly: M98 executes any macro-style file in place, but
// sliced job files under the gcodes directory start via M32 from the Jobs page instead, never this
// button. machineStore.model is loosely typed from a plugin's perspective (this repo's own established
// convention elsewhere) - cast only the one field actually read.
const canRun = computed(() => {
	const gCodesDir = (machineStore.model as { directories?: { gCodes?: string } }).directories?.gCodes ?? "";
	return !pathStartsWith(props.filename, gCodesDir);
});

function basename(path: string): string {
	return path.replace(/\/+$/, "").split("/").pop() || path;
}

function setDirty(value: boolean): void {
	dirty.value = value;
	emit("dirty", value);
}

function editorExtensions(theme: ThemeController) {
	return [
		lineNumbers(),
		gcodeLanguage,
		theme.extension,
		gcodeCompletion(),
		gcodeLintUi(),
		lintGutter(),
		// `save` is a hoisted function declaration below - referencing it here (only ever invoked
		// later, on a real Ctrl+S) does not depend on declaration order.
		saveKeymap(() => { void save(); }),
		gcodeSearch(),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) setDirty(true);
			if (update.docChanged || update.selectionSet) cursorCode.value = codeAtCursor(update.view);
		}),
	];
}

async function load(): Promise<void> {
	loading.value = true;
	loadError.value = null;
	try {
		const content = props.initialContent ?? await machineStore.download(
			{ filename: props.filename, type: "text" }, false, false, false, false,
		) as string;
		const doc = await buildDocFromString(content);
		editorInstance.value?.destroy();
		if (hostEl.value === null) return;
		themeController = createThemeController(settingsStore.darkTheme);
		originalDoc = doc;
		editorInstance.value = createEditorInstance({ doc, parent: hostEl.value, extensions: editorExtensions(themeController) });
		setDirty(false);
	} catch (e) {
		loadError.value = i18n.global.t("plugins.flexibleLayouts.gcodeEditor.loadFailed", {
			name: basename(props.filename), error: (e as Error)?.message ?? String(e),
		});
	} finally {
		loading.value = false;
	}
}

// Mirrors MonacoEditor.vue's save() contract exactly: true on a successful upload, false if a save
// was already in flight, there's no editor yet, or the upload itself failed - never throws, so a
// caller (e.g. DWC's Explorer page save-before-close) can just `if (!(await save())) ...` .
async function save(): Promise<boolean> {
	const instance = editorInstance.value;
	if (instance === null || saving.value) return false;
	saving.value = true;
	try {
		const content = instance.flush().toString();
		await machineStore.upload({ filename: props.filename, content: new Blob([content]) }, false, false, false, false);
		setDirty(false);
		uiStore.makeNotification(LogLevel.success, basename(props.filename),
			i18n.global.t("plugins.flexibleLayouts.gcodeEditor.saved", { name: basename(props.filename) }));
		emit("saved", props.filename);
		return true;
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, basename(props.filename),
			i18n.global.t("plugins.flexibleLayouts.gcodeEditor.saveFailed", {
				name: basename(props.filename), error: (e as Error)?.message ?? String(e),
			}));
		return false;
	} finally {
		saving.value = false;
	}
}

// Mirrors MonacoEditor.vue's focusEditor(): give the CM6 view keyboard focus so typing and Ctrl+S
// work right away once this tab becomes active. No-op if the instance hasn't mounted yet.
function focus(): void {
	editorInstance.value?.view.focus();
}

function openSearch(): void {
	const instance = editorInstance.value;
	if (instance !== null) openSearchPanel(instance.view);
}

function alignComments(): void {
	const instance = editorInstance.value;
	if (instance !== null) alignLineComments(instance.view);
}

function revert(): void {
	const instance = editorInstance.value;
	if (instance === null || originalDoc === null) return;
	instance.view.dispatch({ changes: { from: 0, to: instance.view.state.doc.length, insert: originalDoc } });
	setDirty(false);
}

// Mirrors MonacoEditor.vue's run() exactly: save first if dirty (M98 executes the file on disk, not
// the live buffer), send M98 P"<escaped path>", swallow a disconnect rather than surfacing a console
// warning for it (the same DisconnectedError guard MonacoEditor.vue itself uses).
async function run(): Promise<void> {
	if (running.value || (dirty.value && !(await save()))) return;
	running.value = true;
	try {
		await machineStore.sendCode(`M98 P"${escapeFilename(props.filename)}"`);
	} catch (e) {
		if (!(e instanceof DisconnectedError)) console.warn(e);
	} finally {
		running.value = false;
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

// Follow DWC's own dark/light toggle live - the same flag MonacoEditor.vue reads to pick "vs" vs
// "vs-dark".
watch(() => settingsStore.darkTheme, (dark) => {
	const instance = editorInstance.value;
	if (instance !== null && themeController !== null) themeController.setDark(instance.view, dark);
});

onUnmounted(() => editorInstance.value?.destroy());

// `save`/`focus` mirror MonacoEditor.vue's own exposed surface exactly (both required by DWC core's
// `FileEditorEntry` contract - PR #519's `registerFileEditor`). `editorInstance` is additionally
// exposed (read-only in spirit - callers should only ever dispatch through `.view`) purely so tests
// can drive a real CM6 edit directly, the same way this family's other editor tests do when a
// synthetic DOM `beforeinput`/composition event under happy-dom would be unreliable to fake.
defineExpose({ save, focus, editorInstance });
</script>
