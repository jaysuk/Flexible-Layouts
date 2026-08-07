<template>
	<v-container fluid class="py-4">
		<div class="d-flex align-center mb-4">
			<v-icon size="large" class="me-3">mdi-content-cut</v-icon>
			<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.vectorImport.title") }}</div>
		</div>

		<v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="mb-4">{{ loadError }}</v-alert>

		<!-- Kept out of the v-if/v-else chain below - an element between a v-if and its v-else breaks
			 their adjacency (Vue then treats the v-else as orphaned), which crashes the compiler's
			 codegen entirely rather than just warning. -->
		<input ref="fileInput" type="file" accept=".svg,.dxf,image/svg+xml" class="d-none" @change="onFileInput" />

		<!-- No file loaded yet: just the drop zone. -->
		<div v-if="!drawing" class="vip-drop d-flex flex-column align-center justify-center ga-2 pa-8"
			 @dragover.prevent @drop.prevent="onDrop" @click="pickFile">
			<v-icon size="40" class="text-medium-emphasis">mdi-file-upload-outline</v-icon>
			<strong>{{ busy ? $t("plugins.flexibleLayouts.vectorImport.dropBusy") : $t("plugins.flexibleLayouts.vectorImport.dropHint") }}</strong>
			<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.vectorImport.pickFile") }}</span>
		</div>

		<template v-else>
			<v-card variant="outlined" class="mb-4">
				<v-card-text>
					<div class="d-flex align-center flex-wrap ga-2 mb-2">
						<div class="flex-grow-1">
							<strong>{{ drawing.name }}</strong>
							<div class="text-caption text-medium-emphasis">
								{{ drawing.source.toUpperCase() }} · {{ $t("plugins.flexibleLayouts.vectorImport.fileSummary", { count: placed.length, closed: closedCount }) }}
							</div>
						</div>
						<div class="text-h6">
							{{ size ? $t("plugins.flexibleLayouts.vectorImport.sizeReadout", { w: size.w.toFixed(1), h: size.h.toFixed(1) }) : "—" }}
						</div>
						<v-btn size="small" variant="tonal" @click="reset">{{ $t("plugins.flexibleLayouts.vectorImport.anotherFile") }}</v-btn>
					</div>

					<v-alert v-if="drawing.units === 'unknown'" type="warning" variant="tonal" density="compact" class="mb-2">
						{{ $t("plugins.flexibleLayouts.vectorImport.sizeUnknownWarning", {
							reading: scale === 1
								? $t("plugins.flexibleLayouts.vectorImport.sizeUnknownMm")
								: $t("plugins.flexibleLayouts.vectorImport.sizeUnknownScaled", { scale: scale.toFixed(4) }),
						}) }}
						<v-btn v-if="scale === 1" size="x-small" variant="text" class="ml-1" @click="scale *= 25.4">
							{{ $t("plugins.flexibleLayouts.vectorImport.assumeInches") }}
						</v-btn>
					</v-alert>
					<v-alert v-for="(w, i) in drawing.warnings" :key="`dw-${i}`" type="warning" variant="tonal" density="compact" class="mb-2">{{ w }}</v-alert>

					<!-- Preview -->
					<div class="vip-canvas-wrap mb-2">
						<canvas ref="canvasRef" class="vip-canvas" :title="$t('plugins.flexibleLayouts.vectorImport.pickTitle')"
								@mousemove="onPreviewMove" @mouseleave="onPreviewLeave" @click="onPreviewClick" />
					</div>
					<div class="d-flex align-center flex-wrap ga-3 text-caption text-medium-emphasis mb-4">
						<span><span class="vip-swatch vip-swatch-drawing" /> {{ $t("plugins.flexibleLayouts.vectorImport.previewLegendDrawing") }}</span>
						<span><span class="vip-swatch vip-swatch-cut" />
							{{ cutLoops.loops.length
								? $t("plugins.flexibleLayouts.vectorImport.previewLegendCut", { side: inputs.side === "on" ? $t("plugins.flexibleLayouts.vectorImport.sideOn") : `${inputs.side} the line` })
								: $t("plugins.flexibleLayouts.vectorImport.previewLegendNoCut") }}
						</span>
						<span>{{ $t("plugins.flexibleLayouts.vectorImport.previewArrowHint") }}</span>
						<v-spacer />
						<span v-if="excluded.size">
							{{ $t("plugins.flexibleLayouts.vectorImport.pathsIncluded", { cut: placed.length - excluded.size, total: placed.length }) }}
							<v-btn size="x-small" variant="text" @click="excluded = new Set()">{{ $t("plugins.flexibleLayouts.vectorImport.cutAll") }}</v-btn>
						</span>
						<span v-else>{{ $t("plugins.flexibleLayouts.vectorImport.pickHint") }}</span>
					</div>

					<div class="text-subtitle-2 mb-1">{{ $t("plugins.flexibleLayouts.vectorImport.place") }}</div>
					<v-row dense class="mb-2">
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="scale" type="number" step="0.0001" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.scale')" :title="$t('plugins.flexibleLayouts.vectorImport.scaleHelp')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field :model-value="size ? Number(size.w.toFixed(3)) : null" type="number" step="0.1" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.makeItWide')" :title="$t('plugins.flexibleLayouts.vectorImport.makeItWideHelp')"
										  @change="onMakeItWide" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-select v-model="anchor" density="compact" variant="outlined" hide-details :items="anchorItems"
									  :label="$t('plugins.flexibleLayouts.vectorImport.place')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-checkbox v-model="mirrorY" density="compact" hide-details
										:label="$t('plugins.flexibleLayouts.vectorImport.mirrorY')" :title="$t('plugins.flexibleLayouts.vectorImport.mirrorYHelp')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="originX" type="number" density="compact" variant="outlined" hide-details
										  label="Origin X" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="originY" type="number" density="compact" variant="outlined" hide-details
										  label="Origin Y" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="curveTolerance" type="number" step="0.005" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.curveTolerance')" suffix="mm" :title="$t('plugins.flexibleLayouts.vectorImport.curveToleranceHelp')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="joinTolerance" type="number" step="0.01" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.joinGap')" suffix="mm" :title="$t('plugins.flexibleLayouts.vectorImport.joinGapHelp')" />
						</v-col>
					</v-row>

					<v-divider class="my-3" />

					<div class="text-subtitle-2 mb-1">{{ $t("plugins.flexibleLayouts.vectorImport.side") }}</div>
					<v-row dense class="mb-2">
						<v-col cols="6" sm="3">
							<v-select v-model="side" density="compact" variant="outlined" hide-details :items="sideItems"
									  :label="$t('plugins.flexibleLayouts.vectorImport.side')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-checkbox v-model="climb" density="compact" hide-details :label="$t('plugins.flexibleLayouts.vectorImport.climb')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="toolDiameter" type="number" step="0.1" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.toolDiameter')" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="toolNumber" type="number" density="compact" variant="outlined" hide-details clearable
										  :label="$t('plugins.flexibleLayouts.vectorImport.toolNumber')" :title="$t('plugins.flexibleLayouts.vectorImport.toolNumberHelp')" />
						</v-col>
						<v-col v-if="side !== 'on'" cols="6" sm="3">
							<v-text-field v-model.number="allowance" type="number" step="0.05" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.allowance')" suffix="mm" :title="$t('plugins.flexibleLayouts.vectorImport.allowanceHelp')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="zTop" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.zTop')" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="depth" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.depth')" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="depthPerPass" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.depthPerPass')" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="rampLength" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.ramp')" suffix="mm" :title="$t('plugins.flexibleLayouts.vectorImport.rampHelp')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="feedRate" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.feed')" suffix="mm/min" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="plungeFeed" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.plungeFeed')" suffix="mm/min" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="rpm" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.rpm')" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="safeZ" type="number" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.safeZ')" suffix="mm" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="spindleDwell" type="number" step="0.5" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.spindleDwell')" suffix="s" />
						</v-col>
						<v-col cols="6" sm="3">
							<v-text-field v-model.number="tabCount" type="number" min="0" step="1" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.vectorImport.tabCount')" :title="$t('plugins.flexibleLayouts.vectorImport.tabCountHelp')" />
						</v-col>
						<template v-if="tabCount > 0">
							<v-col cols="6" sm="3">
								<v-text-field v-model.number="tabWidth" type="number" density="compact" variant="outlined" hide-details
											  :label="$t('plugins.flexibleLayouts.vectorImport.tabWidth')" suffix="mm" />
							</v-col>
							<v-col cols="6" sm="3">
								<v-text-field v-model.number="tabHeight" type="number" step="0.1" density="compact" variant="outlined" hide-details
											  :label="$t('plugins.flexibleLayouts.vectorImport.tabHeight')" suffix="mm" />
							</v-col>
						</template>
					</v-row>

					<UnhomedWarning :axes="unhomedNow" class="mb-2" />
					<v-alert v-if="allWarnings.length" type="warning" variant="tonal" density="compact" class="mb-2">
						<div class="font-weight-medium mb-1">{{ $t("plugins.flexibleLayouts.vectorImport.warningsHeading") }}</div>
						<div v-for="(w, i) in allWarnings" :key="i">{{ w }}</div>
					</v-alert>
					<div v-if="built" class="text-caption text-medium-emphasis mb-2">{{ built.program.summary }}</div>

					<div class="d-flex ga-2">
						<v-btn variant="tonal" :disabled="!built" @click="onDownload">
							{{ $t("plugins.flexibleLayouts.vectorImport.downloadButton") }}
						</v-btn>
						<v-btn color="warning" prepend-icon="mdi-content-cut" :disabled="cutDisabled" :loading="running" @click="onRun">
							{{ $t("plugins.flexibleLayouts.vectorImport.runButton") }}
						</v-btn>
						<span v-if="!cutDisabled" />
						<span v-else-if="unhomedNow.length" class="text-caption text-error align-self-center">{{ $t("plugins.flexibleLayouts.vectorImport.unhomedBlocked") }}</span>
						<span v-else-if="isPrintingStatus(status)" class="text-caption text-error align-self-center">{{ $t("plugins.flexibleLayouts.vectorImport.printingBlocked") }}</span>
						<span v-else-if="!canRunJobs" class="text-caption text-error align-self-center">{{ $t("plugins.flexibleLayouts.vectorImport.notCutCapable") }}</span>
					</div>
				</v-card-text>
			</v-card>
		</template>
	</v-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { downloadBlob } from "dwc-plugin-runtime";

import { showConfirmDialog } from "@/composables/useConfirmDialog";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

import { can } from "../model/access";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { profile, type ProfileParams } from "../model/cam/profile";
import type { GeneratedProgram } from "../model/cam/format";
import { chain, place } from "../model/vectorImport/geometry";
import { importDxf } from "../model/vectorImport/dxf";
import { importSvg } from "../model/vectorImport/svg";
import { offsetPaths, orderForCut, orientForCut, type CutSide } from "../model/vectorImport/offset";
import { boundsOf, pathLength, type ImportedDrawing, type Polyline } from "../model/vectorImport/types";
import { unhomedAxes } from "../util/homedCheck";
import { isPrintingStatus } from "../util/printLock";
import UnhomedWarning from "../widgets/UnhomedWarning.vue";

const machineStore = useMachineStore();
const uiStore = useUiStore();

// --- Numeric fields -----------------------------------------------------------------------------
//
// Vuetify does not implement Vue's `v-model.number` modifier (it never reads `modelModifiers`), so
// `v-model.number` on a `v-text-field` is inert: typing gives a number, but CLEARING the field
// leaves the empty string. That string then coerces silently through arithmetic - `Math.round("")`
// is 0 - so every value is normalised here, at the boundary, before it can reach the geometry or the
// G-code emitter. format.ts refuses non-numbers as a second line of defence.

function num(v: unknown, fallback: number): number {
	const parsed = typeof v === "number" ? v : parseFloat(String(v));
	return Number.isFinite(parsed) ? parsed : fallback;
}

/** A blank or invalid tool field means "use whatever is already in the spindle" - never tool 0. */
function toolOrNull(v: unknown): number | null {
	if (v === null || v === undefined || v === "") return null;
	const parsed = typeof v === "number" ? v : parseFloat(String(v));
	return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

// --- Loading --------------------------------------------------------------------------------------

const drawing = ref<ImportedDrawing | null>(null);
const loadError = ref<string | null>(null);
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

/** The file as read, kept so a curve-tolerance change can re-flatten it (see the watcher below). */
const sourceText = ref<string | null>(null);
const sourceName = ref("");
const sourceIsDxf = ref(false);

function pickFile(): void { fileInput.value?.click(); }

function detectIsDxf(name: string, text: string): boolean {
	return /\.dxf$/i.test(name) || /^\s*0\s*[\r\n]+\s*SECTION/.test(text.slice(0, 200));
}

function runImport(text: string, name: string, isDxf: boolean, tolerance: number): ImportedDrawing {
	return isDxf
		? importDxf(text, { tolerance, name })
		: importSvg(text, { tolerance, name });
}

async function loadFile(file: File): Promise<void> {
	busy.value = true;
	loadError.value = null;
	excluded.value = new Set();
	hovered.value = null;
	try {
		const text = await file.text();
		const isDxf = detectIsDxf(file.name, text);
		const result = runImport(text, file.name, isDxf, num(curveTolerance.value, 0.02));
		sourceText.value = text;
		sourceName.value = file.name;
		sourceIsDxf.value = isDxf;
		drawing.value = result;
		// Take the file at its word initially; the size readout is what tells the operator whether
		// that word was worth anything (see the "unknown units" warning below).
		scale.value = result.mmPerUnit;
		// F4: SVG's Y axis grows downward, the machine's grows up. DXF is usually already Y-up.
		mirrorY.value = result.source === "svg";
		// Apply the new scale/mirror to the pipeline at once rather than 150ms later, so a freshly
		// loaded drawing is never briefly shown placed at the previous file's scale.
		flushInputs();
	} catch (e) {
		drawing.value = null;
		sourceText.value = null;
		loadError.value = i18n.global.t("plugins.flexibleLayouts.vectorImport.invalidFile", { error: e instanceof Error ? e.message : String(e) });
	} finally {
		busy.value = false;
	}
}
function onFileInput(ev: Event): void {
	const file = (ev.target as HTMLInputElement).files?.[0];
	if (file) void loadFile(file);
}
function onDrop(ev: DragEvent): void {
	const file = ev.dataTransfer?.files?.[0];
	if (file) void loadFile(file);
}
function reset(): void {
	drawing.value = null;
	sourceText.value = null;
	loadError.value = null;
	excluded.value = new Set();
	hovered.value = null;
}

// --- Placement --------------------------------------------------------------------------------------

const scale = ref(1);
const anchor = ref<"bottom-left" | "centre" | "as-drawn">("bottom-left"); // F5: default keeps the part on-bed
const originX = ref(0);
const originY = ref(0);
const mirrorY = ref(false); // F4: set from the file's source on load, but always a real, overridable field
const curveTolerance = ref(0.02);
const joinTolerance = ref(0.05);

const anchorItems = [
	{ title: i18n.global.t("plugins.flexibleLayouts.vectorImport.placeBottomLeft"), value: "bottom-left" },
	{ title: i18n.global.t("plugins.flexibleLayouts.vectorImport.placeCentre"), value: "centre" },
	{ title: i18n.global.t("plugins.flexibleLayouts.vectorImport.placeAsDrawn"), value: "as-drawn" },
];

// --- Which paths are included -----------------------------------------------------------------------

/** Indices into `placed`, not identities - the geometry is recomputed from the file on every render,
 *  so nothing persists to hold an id on. Cleared whenever the join gap changes (it renumbers the
 *  list), the drawing is re-flattened, or a new file loads. Deliberately NOT debounced: this changes
 *  by clicking a path, where instant feedback is the whole point. */
const excluded = ref<Set<number>>(new Set());

// --- Cutting ----------------------------------------------------------------------------------------

const side = ref<CutSide>("outside");
const climb = ref(true);
const toolDiameter = ref(3);
const toolNumber = ref<number | null>(null);
const allowance = ref(0);
const zTop = ref(0);
const depth = ref(6);
const depthPerPass = ref(1.5);
const feedRate = ref(1200);
const plungeFeed = ref(300);
const rpm = ref(18000);
const safeZ = ref(5);
const spindleDwell = ref(3);
const rampLength = ref(20);
const tabCount = ref(4);
const tabWidth = ref(6);
const tabHeight = ref(1.5);

const sideItems = [
	{ title: i18n.global.t("plugins.flexibleLayouts.vectorImport.sideOutside"), value: "outside" },
	{ title: i18n.global.t("plugins.flexibleLayouts.vectorImport.sideInside"), value: "inside" },
	{ title: i18n.global.t("plugins.flexibleLayouts.vectorImport.sideOn"), value: "on" },
];

// --- Debounced pipeline inputs ------------------------------------------------------------------------
//
// Every parameter the geometry pipeline reads, normalised to real numbers and snapshotted 150ms after
// the last edit. The debounce has to live HERE, on the inputs, rather than on the canvas repaint:
// `built` is read by the template (for the summary, the warnings and the buttons' disabled state), so
// a computed chain hanging off the raw refs re-runs Clipper's offsetting on every keystroke no matter
// how lazily the repaint is scheduled. Debouncing the inputs is what actually stops that.

interface PipelineInputs {
	scale: number; mirrorY: boolean; anchor: "bottom-left" | "centre" | "as-drawn";
	originX: number; originY: number; curveTolerance: number; joinTolerance: number;
	side: CutSide; climb: boolean; toolDiameter: number; tool: number | null; allowance: number;
	zTop: number; depth: number; depthPerPass: number; feedRate: number; plungeFeed: number;
	rpm: number; safeZ: number; spindleDwell: number; rampLength: number;
	tabCount: number; tabWidth: number; tabHeight: number;
}

const liveInputs = computed<PipelineInputs>(() => ({
	scale: num(scale.value, 1), mirrorY: mirrorY.value, anchor: anchor.value,
	originX: num(originX.value, 0), originY: num(originY.value, 0),
	curveTolerance: Math.max(num(curveTolerance.value, 0.02), 1e-4),
	joinTolerance: Math.max(num(joinTolerance.value, 0.05), 0),
	side: side.value, climb: climb.value,
	toolDiameter: num(toolDiameter.value, 0), tool: toolOrNull(toolNumber.value),
	allowance: num(allowance.value, 0),
	zTop: num(zTop.value, 0), depth: num(depth.value, 0), depthPerPass: num(depthPerPass.value, 1),
	feedRate: num(feedRate.value, 0), plungeFeed: num(plungeFeed.value, 0),
	rpm: num(rpm.value, 0), safeZ: num(safeZ.value, 0), spindleDwell: num(spindleDwell.value, 0),
	rampLength: Math.max(num(rampLength.value, 0), 0),
	tabCount: Math.max(Math.round(num(tabCount.value, 0)), 0),
	tabWidth: num(tabWidth.value, 0), tabHeight: num(tabHeight.value, 0),
}));

const inputs = ref<PipelineInputs>(liveInputs.value);
let inputTimer: ReturnType<typeof setTimeout> | null = null;
watch(liveInputs, (v) => {
	if (inputTimer) clearTimeout(inputTimer);
	inputTimer = setTimeout(() => { inputTimer = null; inputs.value = v; }, 150);
});
/** Apply pending edits immediately - used when a change is not a keystroke (loading a file). */
function flushInputs(): void {
	if (inputTimer) { clearTimeout(inputTimer); inputTimer = null; }
	inputs.value = liveInputs.value;
}

// Curve tolerance is consumed when the file is FLATTENED, so changing it has to re-run the importer -
// it is not a downstream parameter. (It is also passed to offsetPaths as the arc tolerance for
// rounded joins, which is why a stale value still had a visible-but-partial effect.) Scale and mirror
// are deliberately left alone: they are the operator's, not the file's, once a file is loaded.
watch(() => inputs.value.curveTolerance, (tolerance) => {
	const text = sourceText.value;
	if (text === null) return;
	try {
		drawing.value = runImport(text, sourceName.value, sourceIsDxf.value, tolerance);
		excluded.value = new Set(); // re-flattening renumbers the paths
		hovered.value = null;
	} catch (e) {
		loadError.value = i18n.global.t("plugins.flexibleLayouts.vectorImport.invalidFile", { error: e instanceof Error ? e.message : String(e) });
	}
});

// Joining segments differently renumbers the chained path list, so exclusions would silently land on
// other paths. Watched rather than hung off the field's @change, which only fires on blur - between
// typing and blurring the indices and the exclusion set disagreed.
watch(() => inputs.value.joinTolerance, () => { excluded.value = new Set(); });

// --- Geometry pipeline ---------------------------------------------------------------------------------

/**
 * Chained, scaled/mirrored and anchored into work coordinates - everything downstream of the file
 * itself. Kept separate from `cutLoops`/`built` so that changing a cutting parameter (feed, rpm,
 * depth...) doesn't re-run chain()/place(): Vue only re-evaluates a computed when something it
 * actually read has changed, which splits the memo between the three stages for free.
 */
const placed = computed<Array<Polyline>>(() => {
	const d = drawing.value;
	const p = inputs.value;
	if (!d) return [];
	try {
		// joinTolerance is a physical (mm) field, but chain() operates in the drawing's own source
		// units - same reasoning as the F2 fix in dxf.ts.
		const chained = chain(d.paths, p.joinTolerance / Math.max(p.scale, 1e-9));
		const scaled = place(chained, { scale: p.scale, flipY: p.mirrorY, offsetX: 0, offsetY: 0 });
		const box = boundsOf(scaled);
		if (!box) return scaled;
		let dx = p.originX;
		let dy = p.originY;
		if (p.anchor === "bottom-left") {
			dx -= box.min[0];
			dy -= box.min[1];
		} else if (p.anchor === "centre") {
			dx -= (box.min[0] + box.max[0]) / 2;
			dy -= (box.min[1] + box.max[1]) / 2;
		}
		return place(scaled, { scale: 1, flipY: false, offsetX: dx, offsetY: dy });
	} catch {
		return [];
	}
});
const closedCount = computed(() => placed.value.filter((p) => p.closed).length);
const size = computed<{ w: number; h: number } | null>(() => {
	const box = boundsOf(placed.value);
	return box ? { w: box.max[0] - box.min[0], h: box.max[1] - box.min[1] } : null;
});

interface CutResult { loops: Array<Polyline>; warnings: Array<string> }

/** Offset for the tool, oriented for climb/conventional, ordered holes-first. The expensive Clipper
 *  step lives here, isolated from both `placed` (chain/place) above and `built` (profile) below. */
const cutLoops = computed<CutResult>(() => {
	const paths = placed.value;
	const p = inputs.value;
	if (!paths.length) return { loops: [], warnings: [] };
	const chosen = paths.filter((_, i) => !excluded.value.has(i));
	if (!chosen.length) return { loops: [], warnings: [] };
	try {
		const opts = { toolDiameter: p.toolDiameter, allowance: p.allowance, tolerance: p.curveTolerance };
		if (p.side === "on") {
			const result = offsetPaths(chosen, { side: "on", ...opts });
			return { loops: result.loops, warnings: result.warnings };
		}
		const closedPaths = chosen.filter((q) => q.closed && q.points.length >= 3);
		const openPaths = chosen.filter((q) => !(q.closed && q.points.length >= 3));
		const result = closedPaths.length
			? offsetPaths(closedPaths, { side: p.side, ...opts })
			: { loops: [] as Array<Polyline>, warnings: [] as Array<string> };
		// Open paths (engraving) first - cutting them after a profile has already been freed means
		// engraving a part that's only held on by tabs.
		const loops = [...openPaths, ...orderForCut(orientForCut(result.loops, p.climb, p.side))];
		return { loops, warnings: result.warnings };
	} catch (e) {
		return { loops: [], warnings: [e instanceof Error ? e.message : String(e)] };
	}
});

/** F5: the highest-value safety check here - geometry reaching below the work origin is very likely
 *  off the front or side of the bed, and it's otherwise invisible until the cutter gets there.
 *  Measured over the TOOLPATH as well as the drawing: an outside cut stands the tool a full radius
 *  clear of the part, so a drawing sitting exactly on X0 is already cutting at -r. */
const negativeBounds = computed(() => {
	const box = boundsOf([...placed.value, ...cutLoops.value.loops]);
	return !!box && (box.min[0] < 0 || box.min[1] < 0);
});

interface BuiltProgram { program: GeneratedProgram; warnings: Array<string> }

const built = computed<BuiltProgram | null>(() => {
	const d = drawing.value;
	const p = inputs.value;
	const ready = cutLoops.value.loops;
	if (!d || !ready.length) return null;
	try {
		const s = size.value;
		const params: ProfileParams = {
			toolDiameter: p.toolDiameter, zTop: p.zTop, depth: p.depth, depthPerPass: p.depthPerPass,
			feedRate: p.feedRate, plungeFeed: p.plungeFeed, rpm: p.rpm, safeZ: p.safeZ,
			tool: p.tool, spindleDwell: p.spindleDwell,
			tabs: { count: p.tabCount, width: p.tabWidth, height: p.tabHeight },
			rampLength: p.rampLength,
			sourceNote: `from ${d.name}` + (s ? `, ${s.w.toFixed(1)}x${s.h.toFixed(1)}mm, ${p.side} of line` : ""),
		};
		const program = profile(ready, params);
		return { program, warnings: [...cutLoops.value.warnings, ...program.warnings] };
	} catch {
		return null;
	}
});
const allWarnings = computed(() => built.value?.warnings ?? cutLoops.value.warnings);

/** Back-computes scale from a target width - usually easier than knowing what a file's units meant. */
function onMakeItWide(ev: Event): void {
	const mm = Number((ev.target as HTMLInputElement).value);
	const current = size.value;
	if (!current || !(current.w > 1e-9) || !(mm > 0)) return;
	scale.value = num(scale.value, 1) * (mm / current.w);
}

// --- Gating -------------------------------------------------------------------------------------------

const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));
const status = computed(() => (machineStore.model as { state?: { status?: string } })?.state?.status);
const canRunJobs = computed(() => can("runJobs"));
// Preview and download gate on nothing - only actually running a cut (upload + M32) needs runJobs.
// Unhomed is a hard block (not just a warning): a surfacing pass starts at the work origin, but a
// vector-imported part can be placed anywhere in the envelope.
const cutDisabled = computed(() =>
	uiStore.uiFrozen || !canRunJobs.value || unhomedNow.value.length > 0 || isPrintingStatus(status.value) || !built.value,
);

const running = ref(false);
const uploadPath = computed(() => {
	const base = (drawing.value?.name ?? "profile").replace(/\.(svg|dxf)$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
	return `0:/gcodes/${base || "profile"}.gcode`;
});

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function onRun(): Promise<void> {
	if (cutDisabled.value || !built.value) return;
	const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(`plugins.flexibleLayouts.vectorImport.${key}`, args ?? {});
	const s = size.value;
	// Read from the settled snapshot, not the raw refs: the dialog must describe the program that was
	// actually generated, and a field edited within the debounce window is not in it yet.
	const p = inputs.value;
	const lines = [
		t("confirmBounds", { w: s ? s.w.toFixed(1) : "?", h: s ? s.h.toFixed(1) : "?" }),
		t("confirmLoops", { count: cutLoops.value.loops.length }),
		t("confirmSide", { side: p.side, direction: p.climb ? "climb" : "conventional" }),
		t("confirmDepth", { depth: p.depth, tool: p.toolDiameter }),
		escapeHtml(built.value.program.summary),
	];
	if (negativeBounds.value) lines.push(`<strong>${t("confirmNegativeBounds")}</strong>`);
	const ok = await showConfirmDialog(t("confirmTitle"), lines.join("<br>"), "mdi-content-cut", true);
	if (!ok) return;

	running.value = true;
	try {
		const io = defaultMachineIO();
		const path = uploadPath.value;
		await io.upload(path, new Blob([built.value.program.gcode], { type: "text/plain" }));
		await io.sendCode(`M32 "${path}"`);
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.vectorImport.title"), e instanceof Error ? e.message : String(e));
	} finally {
		running.value = false;
	}
}

function onDownload(): void {
	if (!built.value) return;
	downloadBlob(uploadPath.value.split("/").pop() ?? "profile.gcode", built.value.program.gcode, "text/plain");
}

// --- Preview canvas -----------------------------------------------------------------------------------

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hovered = ref<number | null>(null);
const PREVIEW_MARGIN = 16;
const PICK_SLACK = 7;

interface View { cx: number; cy: number; scale: number; w: number; h: number }
let view: View | null = null;

function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax, dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared < 1e-12) return Math.hypot(x - ax, y - ay);
	const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
	return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** A point some way along a path, with the direction of travel there - used to place one direction
 *  arrow per cut loop (F3: the only place climb-vs-conventional is actually visible). */
function alongPath(path: Polyline, fraction: number): { x: number; y: number; dx: number; dy: number } | null {
	const total = pathLength(path);
	if (!(total > 0)) return null;
	const target = total * fraction;
	const last = path.closed ? path.points.length : path.points.length - 1;
	let walked = 0;
	for (let i = 0; i < last; i++) {
		const a = path.points[i];
		const b = path.points[(i + 1) % path.points.length];
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (len <= 0) continue;
		if (walked + len >= target) {
			const f = (target - walked) / len;
			return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: (b[0] - a[0]) / len, dy: (b[1] - a[1]) / len };
		}
		walked += len;
	}
	return null;
}

function draw(): void {
	const canvas = canvasRef.value;
	if (!canvas) return;
	const width = canvas.clientWidth, height = canvas.clientHeight;
	if (!(width > 0) || !(height > 0)) return;

	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, width, height);

	const source = placed.value;
	const cut = cutLoops.value.loops;
	const box = boundsOf([...source, ...cut]);
	if (!box) { view = null; return; }

	let [minX, minY] = box.min;
	let [maxX, maxY] = box.max;
	const reach = Math.max(maxX - minX, maxY - minY, 1) * 0.6;
	const nearOrigin = 0 >= minX - reach && 0 <= maxX + reach && 0 >= minY - reach && 0 <= maxY + reach;
	if (nearOrigin) {
		minX = Math.min(minX, 0); minY = Math.min(minY, 0);
		maxX = Math.max(maxX, 0); maxY = Math.max(maxY, 0);
	}

	const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
	const scaleFit = Math.min((width - 2 * PREVIEW_MARGIN) / spanX, (height - 2 * PREVIEW_MARGIN) / spanY);
	if (!(scaleFit > 0) || !isFinite(scaleFit)) { view = null; return; }

	const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
	view = { cx, cy, scale: scaleFit, w: width, h: height };
	const px = (x: number): number => width / 2 + (x - cx) * scaleFit;
	const py = (y: number): number => height / 2 - (y - cy) * scaleFit; // machine Y up, canvas Y down

	const trace = (path: Polyline): void => {
		const pts = path.points;
		if (pts.length < 2) return;
		ctx.beginPath();
		ctx.moveTo(px(pts[0][0]), py(pts[0][1]));
		for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i][0]), py(pts[i][1]));
		if (path.closed) ctx.closePath();
		ctx.stroke();
	};

	const styles = getComputedStyle(canvas);
	const themeColor = (varName: string, fallback: string): string => styles.getPropertyValue(varName).trim() || fallback;

	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	source.forEach((path, index) => {
		const out = excluded.value.has(index);
		ctx.strokeStyle = out ? "rgba(128,128,128,0.45)" : themeColor("--v-theme-on-surface", "#888");
		ctx.lineWidth = index === hovered.value ? 2.5 : 1;
		ctx.setLineDash(out ? [4, 4] : []);
		ctx.globalAlpha = out ? 0.6 : 0.8;
		trace(path);
	});
	ctx.setLineDash([]);
	ctx.globalAlpha = 1;

	if (nearOrigin) {
		const ox = px(0), oy = py(0);
		ctx.save();
		ctx.strokeStyle = themeColor("--v-theme-on-surface", "#888");
		ctx.fillStyle = ctx.strokeStyle;
		ctx.lineWidth = 1;
		ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI / 2); ctx.lineTo(ox, oy); ctx.closePath(); ctx.fill();
		ctx.beginPath(); ctx.arc(ox, oy, 5, Math.PI, Math.PI * 1.5); ctx.lineTo(ox, oy); ctx.closePath(); ctx.fill();
		ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.stroke();
		ctx.restore();
	}

	const accent = "rgb(var(--v-theme-warning))";
	ctx.strokeStyle = accent;
	ctx.lineWidth = 1.75;
	for (const loop of cut) trace(loop);

	ctx.fillStyle = accent;
	for (const loop of cut) {
		const at = alongPath(loop, 0.3);
		if (!at) continue;
		const [ax, ay] = [px(at.x), py(at.y)];
		const [dx, dy] = [at.dx, -at.dy];
		const len = 6, wide = 3.2;
		ctx.beginPath();
		ctx.moveTo(ax + dx * len, ay + dy * len);
		ctx.lineTo(ax - dx * len * 0.4 - dy * wide, ay - dy * len * 0.4 + dx * wide);
		ctx.lineTo(ax - dx * len * 0.4 + dy * wide, ay - dy * len * 0.4 - dx * wide);
		ctx.closePath();
		ctx.fill();
	}
}

function pathAt(offsetX: number, offsetY: number): number | null {
	if (!view || !placed.value.length) return null;
	const { cx, cy, scale: s, w, h } = view;
	const px = (x: number): number => w / 2 + (x - cx) * s;
	const py = (y: number): number => h / 2 - (y - cy) * s;
	let best: number | null = null;
	let bestDistance = PICK_SLACK;
	placed.value.forEach((path, index) => {
		const pts = path.points;
		const last = path.closed ? pts.length : pts.length - 1;
		for (let i = 0; i < last; i++) {
			const a = pts[i], b = pts[(i + 1) % pts.length];
			const d = distanceToSegment(offsetX, offsetY, px(a[0]), py(a[1]), px(b[0]), py(b[1]));
			if (d < bestDistance) { bestDistance = d; best = index; }
		}
	});
	return best;
}

function onPreviewMove(e: MouseEvent): void {
	const found = pathAt(e.offsetX, e.offsetY);
	if (found === hovered.value) return;
	hovered.value = found;
	if (canvasRef.value) canvasRef.value.style.cursor = found === null ? "" : "pointer";
	draw();
}
function onPreviewLeave(): void {
	if (hovered.value === null) return;
	hovered.value = null;
	draw();
}
function onPreviewClick(e: MouseEvent): void {
	const found = pathAt(e.offsetX, e.offsetY);
	if (found === null) return;
	const next = new Set(excluded.value);
	if (next.has(found)) next.delete(found); else next.add(found);
	excluded.value = next;
}

// Repainting is cheap and the expensive work is already debounced upstream (see `inputs`), so this
// draws as soon as the geometry settles rather than deferring again.
//
// Watching `placed` and `cutLoops` rather than `built`: `built` is null whenever there is nothing to
// cut - a tool too large for every profile, or every path excluded - and a null -> null transition
// does not fire a watcher. That left the canvas blank in exactly the case the preview matters most,
// with the drawing loaded, a "the tool does not fit" warning on screen, and nothing rendered to show
// what it was talking about.
watch([placed, cutLoops], () => draw(), { flush: "post" });

// The canvas only exists once a drawing is loaded (it lives inside the v-else), so it is not in the
// DOM at mount and an onMounted hook would find a null ref and silently never observe anything.
let resizeObserver: ResizeObserver | null = null;
watch(canvasRef, (el) => {
	resizeObserver?.disconnect();
	resizeObserver = null;
	if (!el) return;
	resizeObserver = new ResizeObserver(() => draw());
	resizeObserver.observe(el);
	draw();
}, { immediate: true, flush: "post" });

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
	if (inputTimer) clearTimeout(inputTimer);
});
</script>

<style scoped>
.vip-drop { border: 1px dashed rgba(128, 128, 128, 0.5); border-radius: 8px; cursor: pointer; min-height: 200px; }
.vip-canvas-wrap { position: relative; height: 45vh; min-height: 260px; }
.vip-canvas { width: 100%; height: 100%; display: block; cursor: crosshair; border: 1px solid rgba(128, 128, 128, 0.2); border-radius: 4px; }
.vip-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
.vip-swatch-drawing { background: rgba(128, 128, 128, 0.6); }
.vip-swatch-cut { background: rgb(var(--v-theme-warning)); }
</style>
