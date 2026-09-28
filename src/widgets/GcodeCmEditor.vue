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
			<v-btn :disabled="loading" icon="mdi-tag-search" :title="quickSearchTitle" @click="openCodeSearch" />
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
			<v-btn icon="mdi-palette" :title="$t('plugins.flexibleLayouts.gcodeEditor.colors')" @click="colorSettingsOpen = true" />
			<v-btn :disabled="loading" :color="stepperOpen ? 'primary' : undefined" icon="mdi-motion-play-outline"
				   title="Step through file" @click="stepperOpen = !stepperOpen" />
		</v-toolbar>
		<v-alert v-if="loadError !== null" type="error" variant="tonal" density="compact" class="ma-2">
			{{ loadError }}
		</v-alert>
		<v-progress-linear v-if="loading" indeterminate />
		<GcodeStepperPanel v-if="stepperOpen && !loading" :current-step="stepperStep" :total-steps="stepperTotalSteps"
							:line="stepperDisplayLine" :view="stepperView" :status="stepperStatus" :pending-path="stepperPendingPath"
							:message-box-prompt="stepperMessageBoxPrompt" :error-message="stepperErrorMessage"
							:inputs="inputs" :referenced="referencedInputs" :message-box-answers="messageBoxAnswersList" class="mx-2 mb-2"
							@update:current-step="stepperStep = $event" @update:inputs="updateInputs" @resolve-path="resolveSimulatedPath"
							@resolve-message-box="resolveMessageBoxPrompt" @remove-message-box-answer="removeMessageBoxAnswer"
							@reset-message-box-answers="resetMessageBoxAnswers" />
		<div ref="hostEl" class="flex-grow-1 gcode-cm-editor-host"></div>
		<EditorColorSettingsDialog v-model="colorSettingsOpen" />
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
 *
 * **Offline conditional stepper** (the "Step through file" toolbar toggle, `GcodeStepperPanel.vue`):
 * lets a user step through ANY file open here — not just gcodes/print files, sys files and macros
 * too, matching this widget's own explorer-wide reach — the same feature `GcodeEditor.vue` has, built
 * on the same shared `dwc-gcode-core/stepper/*` model layer (real if/while control flow, a scenario of
 * starting position and simulated object-model / param.* / global values, each line shown as
 * evaluated, blocking M291 message boxes). `GcodeStepperPanel.vue`, `StepperReadout.vue`,
 * `StepperScenarioPanel.vue` and `ScenarioValueField.vue` are byte-for-byte copies of
 * `duet-gcode-postprocessor`'s own components (they take everything via props/emits, no
 * plugin-specific import at all) — Vue components can't be shared across plugin bundles even once
 * the underlying model layer is, so the presentation layer is duplicated deliberately, once, here.
 */
import { computed, onUnmounted, ref, shallowRef, watch } from "vue";
import { DisconnectedError } from "@duet3d/connectors";
import { lintGutter } from "@codemirror/lint";
import { EditorView, lineNumbers } from "@codemirror/view";
import { diagnoseDocument, parseDocument, type MessageBoxAnswer, type MessageBoxPrompt } from "dwc-gcode-core";
import type { ExecutionIndex } from "dwc-gcode-core/stepper/executionIndex";
import { messageBoxKey } from "dwc-gcode-core/stepper/messageBoxAnswers";
import { parseSimulatedValueInput } from "dwc-gcode-core/stepper/simulatedValues";
import {
	describeStep, emptySimulationInputs, findReferencedInputs, formatEvalValue, runSimulation, sourceLines,
	withInputValue, type ReferencedInput, type SimulationInputs,
} from "dwc-gcode-core/stepper/simulation";
import {
	alignLineComments, applyDiagnostics, buildDocFromString, codeAtCursor, createEditorInstance,
	createThemeController, gcodeCompletion, gcodeCurrentLine, gcodeLanguage, gcodeLintUi,
	gcodeQuickSearchKeymap, gcodeSearch, isInsideExpression, openExpressionQuickSearch,
	openGcodeQuickSearch, openSearchPanel, saveKeymap, setCurrentLine, type EditorInstance, type ThemeController,
} from "dwc-gcode-editor";
import type { Text } from "@codemirror/state";

import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";
import EditorColorSettingsDialog from "./EditorColorSettingsDialog.vue";
import GcodeStepperPanel from "./GcodeStepperPanel.vue";
import { editorColorScheme, loadEditorColorScheme } from "../model/editorColorSettings";
import { loadSimulationScenario, saveSimulationScenario } from "../model/gcode/simulationScenario";
import { trackedObjectModelVersion } from "../model/gcode/objectModelVersion";

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
const cursorInExpression = ref(false);
const running = ref(false);
const colorSettingsOpen = ref(false);
const stepperOpen = ref(false);
// Offline CONDITIONAL stepping: null until the deferred build in load() below finishes.
// stepperStep indexes executionIndex.steps (0-based - a step, not a physical line, since a false
// if/while branch contributes none and a loop body contributes one per iteration) - see
// dwc-gcode-core/stepper/executionIndex's own doc comment.
const executionIndex = shallowRef<ExecutionIndex | null>(null);
const stepperStep = ref(0);
// The scenario the walk runs under - where the machine starts (X/Y/Z and any other axis), the
// object-model / param.* / global values this offline simulation (no live machine) has no way to know,
// and remembered M291 answers (see dwc-gcode-core's stepper/simulation.ts). A shallowRef holding a
// fresh object on every change (never mutated in place) so Vue's reactivity actually notices.
const inputs = shallowRef<SimulationInputs>(emptySimulationInputs());
// What the file reads (object-model paths, param.*, undeclared globals), offered as fields in the
// scenario editor - computed with each rebuild, and only while the stepper is open.
const referencedInputs = shallowRef<ReadonlyArray<ReferencedInput>>([]);
// The source lines the current executionIndex was built from - the SAME text the walker indexed, so a
// step's evaluated-expression offsets always line up with it even if the buffer has since been edited.
const builtSourceLines = shallowRef<ReadonlyArray<string>>([]);
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

// Matches MonacoEditor.vue's own toolbar wording exactly ("Find Code (F4)" / "Find Expression (F4)").
const quickSearchTitle = computed(() => cursorInExpression.value ? "Find Expression (F4)" : "Find Code (F4)");

const stepperTotalSteps = computed(() => executionIndex.value?.steps.length ?? 0);
// Everything the panel and the editor show about the current step - the line as evaluated, both
// machine states with per-axis deltas, the variables (dwc-gcode-core's `describeStep`). Recomputed when
// the step, the run, or the scenario changes.
const stepperView = computed(() => {
	const index = executionIndex.value;
	return index === null ? null : describeStep(index, stepperStep.value, builtSourceLines.value, inputs.value);
});
// 1-based, matching setCurrentLine's own convention - executionIndex's steps are 0-based physical
// line indices (dwc-gcode-core's own convention, shared with walkExecution); describeStep converts.
const stepperDisplayLine = computed(() => stepperView.value?.line ?? null);
const stepperStatus = computed(() => executionIndex.value?.status ?? "complete");
const stepperPendingPath = computed(() => {
	const index = executionIndex.value;
	return index?.status === "paused" ? index.path : null;
});
const stepperMessageBoxPrompt = computed(() => {
	const index = executionIndex.value;
	return index?.status === "message-box" ? index.prompt : null;
});
const stepperErrorMessage = computed(() => {
	const index = executionIndex.value;
	return index?.status === "error" ? index.message : null;
});

/** `prompt` is the SAME prompt the answer was originally given for (recovered from the content key -
 *  see `messageBoxAnswersList` below), which lets a choice answer show the chosen option's own TEXT
 *  rather than just its opaque index. */
function formatMessageBoxAnswer(answer: MessageBoxAnswer, prompt: MessageBoxPrompt | null): string {
	if (answer.cancelled) return "Cancel";
	if (answer.input === null) return "OK";
	if (prompt?.mode === "choice" && typeof answer.input === "number") {
		return prompt.choices[answer.input] ?? `#${answer.input}`;
	}
	return typeof answer.input === "string" ? JSON.stringify(answer.input) : formatEvalValue(answer.input);
}

const messageBoxAnswersList = computed(() => [...inputs.value.messageBoxAnswers.entries()]
	.map(([key, answer]) => {
		// The key IS the prompt's own JSON serialisation (messageBoxKey) - reusing it here avoids
		// storing the prompt a second time just for display purposes.
		let prompt: MessageBoxPrompt | null = null;
		try {
			prompt = JSON.parse(key) as MessageBoxPrompt;
		} catch {
			// Malformed/foreign key (shouldn't happen - messageBoxKey always produces valid JSON) -
			// fall back to showing the raw key rather than breaking the whole list over one entry.
		}
		const message = prompt?.message ?? key;
		return { key, display: `${message} → ${formatMessageBoxAnswer(answer, prompt)}` };
	}));

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
		gcodeQuickSearchKeymap(() => machineStore.model),
		gcodeCurrentLine(),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				setDirty(true);
				if (stepperOpen.value) scheduleRebuild();
			}
			if (update.docChanged || update.selectionSet) {
				cursorCode.value = codeAtCursor(update.view);
				const line = update.state.doc.lineAt(update.state.selection.main.head);
				const beforeCursor = line.text.slice(0, update.state.selection.main.head - line.from);
				cursorInExpression.value = isInsideExpression(beforeCursor);
			}
		}),
	];
}

/** Rebuilds executionIndex from the live doc and the current scenario - deferred (setTimeout) so a
 *  rebuild (e.g. right after a value is entered) doesn't block the next paint. Clamps stepperStep back
 *  into range, since a new value can shrink OR grow the step count (a newly-false branch skips a body
 *  that used to run; a newly-resolved pause can run much further than before). */
function rebuildExecutionIndex(): void {
	const instance = editorInstance.value;
	if (instance === null) return;
	setTimeout(() => {
		if (editorInstance.value !== instance) return; // superseded by a newer load() already
		rebuildNow(instance);
	}, 0);
}

function rebuildNow(instance: EditorInstance): void {
	const text = instance.view.state.doc.toString();
	const objectModelVersion = trackedObjectModelVersion(machineStore.model);
	const index = runSimulation(text, inputs.value, { objectModelVersion });
	executionIndex.value = index;
	// The source lines (for the evaluated-line display) and the values the file reads (offered as fields
	// in the scenario editor) each cost another parse of the text, and this also runs at load with the
	// stepper closed - so only pay for them while it's showing. Opening the stepper rebuilds (below).
	if (stepperOpen.value) {
		builtSourceLines.value = sourceLines(text);
		referencedInputs.value = findReferencedInputs(text, { objectModelVersion });
	}
	const total = index.steps.length;
	stepperStep.value = total === 0 ? 0 : Math.min(stepperStep.value, total - 1);
}

// Editing the file while stepping through it re-runs the walk (debounced), so the steps never describe a
// buffer that has since changed. Nothing runs while the stepper is closed.
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRebuild(): void {
	if (rebuildTimer !== null) clearTimeout(rebuildTimer);
	rebuildTimer = setTimeout(() => {
		rebuildTimer = null;
		rebuildExecutionIndex();
	}, 400);
}

// Opening the stepper builds what only it needs (source lines, what the file reads). Synchronous, not
// deferred: someone just asked to see the steps, and a deferred build would leave the panel briefly
// showing steps with no source line to go with them.
watch(stepperOpen, (open) => {
	const instance = editorInstance.value;
	if (open && instance !== null) rebuildNow(instance);
});

/** Applies an edited scenario: keeps it, saves it for this file, and re-runs the walk under it. */
function updateInputs(next: SimulationInputs): void {
	inputs.value = next;
	saveSimulationScenario(props.filename, next);
	rebuildExecutionIndex();
}

/** The pause prompt's answer for one unresolved path. */
function resolveSimulatedPath(path: string, rawValue: string): void {
	updateInputs(withInputValue(inputs.value, path.startsWith("param.") ? "param" : "objectModel", path, parseSimulatedValueInput(rawValue)));
}

function resolveMessageBoxPrompt(answer: MessageBoxAnswer): void {
	const prompt = stepperMessageBoxPrompt.value;
	if (prompt === null) return;
	const answers = new Map(inputs.value.messageBoxAnswers);
	answers.set(messageBoxKey(prompt), answer);
	updateInputs({ ...inputs.value, messageBoxAnswers: answers });
}

function removeMessageBoxAnswer(key: string): void {
	const answers = new Map(inputs.value.messageBoxAnswers);
	answers.delete(key);
	updateInputs({ ...inputs.value, messageBoxAnswers: answers });
}

function resetMessageBoxAnswers(): void {
	updateInputs({ ...inputs.value, messageBoxAnswers: new Map() });
}

async function load(): Promise<void> {
	loading.value = true;
	loadError.value = null;
	try {
		const content = props.initialContent ?? await machineStore.download(
			{ filename: props.filename, type: "text" }, false, false, false, false,
		) as string;
		const doc = await buildDocFromString(content);
		// A no-op after the first real call this session (every editor instance calls this on load -
		// see editorColorSettings.ts's own doc comment for the shared-load pattern).
		await loadEditorColorScheme();
		editorInstance.value?.destroy();
		if (hostEl.value === null) return;
		themeController = createThemeController(settingsStore.darkTheme);
		originalDoc = doc;
		editorInstance.value = createEditorInstance({ doc, parent: hostEl.value, extensions: editorExtensions(themeController) });
		// Applied right after creation, in the same synchronous block, so there's no visible flash of
		// the fixed theme before the loaded custom colors (if any) take over.
		themeController.setCustomColors(editorInstance.value.view, editorColorScheme.value);
		setDirty(false);
		inputs.value = loadSimulationScenario(props.filename);
		rebuildExecutionIndex();
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

// Matches MonacoEditor.vue's own searchGcode(): the toolbar button always calls this one function,
// which picks G/M-code search vs. object-model-path search off where the cursor sits - the same
// switch the F4 keybinding (gcodeQuickSearchKeymap, in editorExtensions above) already makes.
function openCodeSearch(): void {
	const instance = editorInstance.value;
	if (instance === null) return;
	if (cursorInExpression.value) openExpressionQuickSearch(instance.view, machineStore.model);
	else openGcodeQuickSearch(instance.view);
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

// Highlights the current line and draws the line as evaluated beneath it. Scrolls only when the step
// or line actually moved: a rebuild (the scenario changed, or the buffer was edited) produces a new
// view too, and re-centring on every one of those would yank the page around while someone types.
watch([stepperOpen, stepperView], ([open, view], [wasOpen, oldView]) => {
	const instance = editorInstance.value;
	if (instance === null) return;
	const moved = !wasOpen || oldView?.step !== view?.step || oldView?.line !== view?.line;
	const annotation = open && view !== null && view.evaluated.changed ? { segments: view.evaluated.segments } : null;
	setCurrentLine(instance.view, open ? (view?.line ?? null) : null, { scroll: open && moved, annotation });
});

// Follow DWC's own dark/light toggle live - the same flag MonacoEditor.vue reads to pick "vs" vs
// "vs-dark".
watch(() => settingsStore.darkTheme, (dark) => {
	const instance = editorInstance.value;
	if (instance !== null && themeController !== null) themeController.setDark(instance.view, dark);
});

// Live, site-wide colour updates: a Save from ANY open tab's settings dialog (this instance's own, or
// a different tab's, or duet-gcode-postprocessor's - same shared SD file) updates the shared
// editorColorScheme ref, which every open instance is watching.
watch(editorColorScheme, (scheme) => {
	const instance = editorInstance.value;
	if (instance !== null && themeController !== null) themeController.setCustomColors(instance.view, scheme);
});

onUnmounted(() => {
	if (rebuildTimer !== null) clearTimeout(rebuildTimer);
	editorInstance.value?.destroy();
});

// `save`/`focus` mirror MonacoEditor.vue's own exposed surface exactly (both required by DWC core's
// `FileEditorEntry` contract - PR #519's `registerFileEditor`). `editorInstance` is additionally
// exposed (read-only in spirit - callers should only ever dispatch through `.view`) purely so tests
// can drive a real CM6 edit directly, the same way this family's other editor tests do when a
// synthetic DOM `beforeinput`/composition event under happy-dom would be unreliable to fake.
defineExpose({ save, focus, editorInstance });
</script>
