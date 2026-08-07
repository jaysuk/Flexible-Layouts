<template>
	<div class="tpw-root fill-height d-flex flex-column px-2 py-1">
		<span v-if="widget.label" class="tpw-label text-truncate flex-shrink-0">{{ widget.label }}</span>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<div class="d-flex ga-1 align-center flex-shrink-0">
			<v-text-field v-model="filePath" density="compact" variant="outlined" hide-details
						  class="flex-grow-1" :label="$t('plugins.flexibleLayouts.toolpath.file')"
						  placeholder="0:/gcodes/part.gcode" @change="patch?.({ defaultFile: filePath })" />
			<v-btn size="small" :color="widget.color || 'primary'" :loading="loading" :disabled="!filePath" @click="load">
				{{ $t("plugins.flexibleLayouts.toolpath.load") }}
			</v-btn>
		</div>
		<div v-if="loadError" class="tpw-error mt-1 flex-shrink-0">{{ loadError }}</div>

		<div class="tpw-canvas-wrap flex-grow-1 mt-2">
			<canvas ref="canvasRef" class="tpw-canvas" @click="onCanvasClick" />
			<div v-if="!parseResult" class="tpw-placeholder text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.toolpath.noFile") }}
			</div>
		</div>

		<div v-if="selectedVertex" class="tpw-selected text-caption mt-1 flex-shrink-0">
			{{ $t("plugins.flexibleLayouts.toolpath.selected", { x: selectedVertex.x.toFixed(2), y: selectedVertex.y.toFixed(2), z: selectedVertex.z.toFixed(2) }) }}
		</div>

		<v-btn block class="mt-1 flex-shrink-0" color="warning" prepend-icon="mdi-play-protected-content"
			   :disabled="!selectedVertex" @click="openResumeConfirm">
			{{ $t("plugins.flexibleLayouts.toolpath.resumeFromHere") }}
		</v-btn>

		<v-expansion-panels variant="accordion" class="tpw-panels flex-shrink-0">
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.toolpath.settingsTitle')">
				<v-expansion-panel-text>
					<v-text-field v-model.number="safeZ" type="number" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.toolpath.safeZ')" @change="patch?.({ safeZ })" />
					<div class="text-caption text-medium-emphasis mt-2">{{ $t("plugins.flexibleLayouts.toolpath.safeZHelp") }}</div>
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>

		<v-dialog v-model="resumeConfirmOpen" max-width="520">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.toolpath.confirmTitle") }}</v-card-title>
				<v-card-text>
					<v-alert type="warning" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.toolpath.safetyNote") }}
					</v-alert>
					<UnhomedWarning :axes="unhomedNow" class="mb-3" />
					<pre class="tpw-pre">{{ preambleText }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="resumeConfirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="warning" :loading="resuming" @click="runResume">{{ $t("plugins.flexibleLayouts.toolpath.resume") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { type ParseResult, type ParsedVertex } from "../model/gcode/parse";
import { parseGcodeAsync } from "../model/gcode/parseClient";
import { modalStateAt } from "../model/gcode/modalState";
import { buildResumePreamble } from "../model/gcode/runFromLine";
import { resolveOmPath } from "../util/omPath";
import { resolveColor } from "../util/color";
import { unhomedAxes } from "../util/homedCheck";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "toolpath" }> }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const patch = inject(WIDGET_PATCH_KEY, null);
const widget = props.widget;

function jobFileName(): string {
	const v = resolveOmPath(machineStore.model, "job.file.fileName");
	return typeof v === "string" ? v : "";
}

const filePath = ref(widget.defaultFile || jobFileName());
const safeZ = ref(widget.safeZ ?? 10);
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));
const loading = ref(false);
const loadError = ref("");
const fileText = ref("");
const parseResult = ref<ParseResult | null>(null);

async function load(): Promise<void> {
	if (!filePath.value) { return; }
	loading.value = true;
	loadError.value = "";
	selectedIndex.value = null;
	try {
		const text = await machineStore.download({ filename: filePath.value, type: "text" }, true, false, false, false) as string;
		fileText.value = text;
		parseResult.value = await parseGcodeAsync(text);
		await nextTick();
		draw();
	} catch (e) {
		loadError.value = i18n.global.t("plugins.flexibleLayouts.toolpath.loadFailed", { error: (e as Error)?.message ?? String(e) });
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.toolpath.title"), loadError.value);
	} finally {
		loading.value = false;
	}
}

// --- Canvas rendering -----------------------------------------------------------------------------------
const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedIndex = ref<number | null>(null);
const selectedVertex = computed<ParsedVertex | null>(() => {
	if (selectedIndex.value === null || !parseResult.value) { return null; }
	return parseResult.value.vertices[selectedIndex.value] ?? null;
});

interface Transform { minX: number; minY: number; scale: number; offsetX: number; offsetY: number; canvasH: number }
let transform: Transform | null = null;

function toPx(x: number, y: number): [number, number] {
	if (!transform) { return [0, 0]; }
	const px = transform.offsetX + (x - transform.minX) * transform.scale;
	const py = transform.canvasH - (transform.offsetY + (y - transform.minY) * transform.scale);
	return [px, py];
}

// Live cut/uncut boundary - job.filePosition can be reported as a bigint by the object model.
const liveFilePosition = computed<number | null>(() => {
	const v = resolveOmPath(machineStore.model, "job.filePosition");
	if (typeof v === "number") { return v; }
	if (typeof v === "bigint") { return Number(v); }
	return null;
});

function draw(): void {
	const canvas = canvasRef.value;
	const result = parseResult.value;
	if (!canvas || !result) { return; }
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	const w = Math.max(1, Math.floor(rect.width * dpr));
	const h = Math.max(1, Math.floor(rect.height * dpr));
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	const ctx = canvas.getContext("2d");
	if (!ctx) { return; }
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, w, h);

	const spanX = Math.max(1e-6, result.max.x - result.min.x);
	const spanY = Math.max(1e-6, result.max.y - result.min.y);
	const pad = 16 * dpr;
	const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
	const drawnW = spanX * scale, drawnH = spanY * scale;
	transform = {
		minX: result.min.x, minY: result.min.y, scale,
		offsetX: pad + (w - pad * 2 - drawnW) / 2,
		offsetY: pad + (h - pad * 2 - drawnH) / 2,
		canvasH: h,
	};

	const filePos = liveFilePosition.value;
	const cutColor = resolveColor(widget.color) || "rgba(33,150,243,0.9)";
	const verts = result.vertices;
	ctx.lineWidth = Math.max(1, dpr);
	for (let i = 1; i < verts.length; i++) {
		const a = verts[i - 1], b = verts[i];
		const [ax, ay] = toPx(a.x, a.y);
		const [bx, by] = toPx(b.x, b.y);
		ctx.beginPath();
		ctx.moveTo(ax, ay);
		ctx.lineTo(bx, by);
		if (b.kind === "rapid") {
			ctx.setLineDash([4 * dpr, 3 * dpr]);
			ctx.strokeStyle = "rgba(128,128,128,0.5)";
		} else {
			ctx.setLineDash([]);
			const alreadyCut = filePos !== null && b.offset <= filePos;
			ctx.strokeStyle = alreadyCut ? "rgba(76,175,80,0.9)" : cutColor;
		}
		ctx.stroke();
	}
	ctx.setLineDash([]);

	if (selectedVertex.value) {
		const [sx, sy] = toPx(selectedVertex.value.x, selectedVertex.value.y);
		ctx.beginPath();
		ctx.arc(sx, sy, 5 * dpr, 0, Math.PI * 2);
		ctx.fillStyle = "orange";
		ctx.fill();
	}
}

function onCanvasClick(e: MouseEvent): void {
	const canvas = canvasRef.value;
	if (!canvas || !parseResult.value || !transform) { return; }
	const rect = canvas.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	const px = (e.clientX - rect.left) * dpr;
	const py = (e.clientY - rect.top) * dpr;
	let best = -1, bestDist = Infinity;
	const verts = parseResult.value.vertices;
	for (let i = 0; i < verts.length; i++) {
		const [vx, vy] = toPx(verts[i].x, verts[i].y);
		const d = (vx - px) ** 2 + (vy - py) ** 2;
		if (d < bestDist) { bestDist = d; best = i; }
	}
	if (best >= 0) {
		selectedIndex.value = best;
		draw();
	}
}

watch(liveFilePosition, () => draw());

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
	if (canvasRef.value) {
		resizeObserver = new ResizeObserver(() => draw());
		resizeObserver.observe(canvasRef.value);
	}
	if (filePath.value) {
		void load();
	}
});
onBeforeUnmount(() => resizeObserver?.disconnect());

// --- Run-from-line ----------------------------------------------------------------------------------------
const resumeConfirmOpen = ref(false);
const resuming = ref(false);

const preambleText = computed(() => {
	if (!selectedVertex.value || !fileText.value) { return ""; }
	const offset = selectedVertex.value.offset;
	const st = modalStateAt(fileText.value, offset);
	const currentToolRaw = resolveOmPath(machineStore.model, "state.currentTool");
	const currentTool = typeof currentToolRaw === "number" ? currentToolRaw : null;
	return buildResumePreamble(st, { offset, safeZ: safeZ.value, currentTool });
});

function openResumeConfirm(): void {
	if (!selectedVertex.value) { return; }
	resumeConfirmOpen.value = true;
}

async function runResume(): Promise<void> {
	if (!preambleText.value) { return; }
	resuming.value = true;
	try {
		await machineStore.sendCode(preambleText.value, false, false);
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.toolpath.title"), (e as Error)?.message ?? String(e));
	} finally {
		resuming.value = false;
		resumeConfirmOpen.value = false;
	}
}
</script>

<style scoped>
.tpw-root { min-height: 0; }
.tpw-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.tpw-error { color: rgb(var(--v-theme-error)); font-size: 0.8em; }
.tpw-canvas-wrap { position: relative; min-height: 0; }
.tpw-canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
.tpw-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.tpw-selected { font-variant-numeric: tabular-nums; opacity: 0.85; }
.tpw-panels { max-height: 35%; overflow-y: auto; }
.tpw-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; }
</style>
