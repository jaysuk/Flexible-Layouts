<template>
	<div class="oct-root fill-height d-flex flex-column pa-1" :class="{ 'oct-frozen': disabledNow }">
		<div v-if="widget.title" class="oct-title text-center text-truncate flex-shrink-0">{{ widget.title }}</div>

		<!-- Optional DRO header -->
		<div v-if="widget.showDro" class="oct-dro d-flex ga-2 mb-1 flex-shrink-0 justify-center">
			<span class="oct-dro-axis" v-for="ax in droAxes" :key="ax.letter">
				<span class="oct-dro-lbl">{{ ax.letter }}</span>
				<span class="oct-dro-val">{{ ax.val }}</span>
			</span>
		</div>

		<!-- Inline feedrate row -->
		<div v-if="widget.showFeedrate !== false" class="d-flex ga-2 mb-1 flex-shrink-0">
			<label class="oct-feed">
				<span class="oct-feed-label">{{ $t("plugins.flexibleLayouts.jog.xyFeed") }}</span>
				<input v-model.number="xyFeed" class="oct-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
			<label v-if="widget.showZ !== false" class="oct-feed">
				<span class="oct-feed-label">{{ $t("plugins.flexibleLayouts.jog.zFeed") }}</span>
				<input v-model.number="zFeed" class="oct-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
		</div>

		<div class="d-flex flex-grow-1 ga-2 oct-body">
			<!-- 8-arm SVG -->
			<div class="oct-xy">
				<svg :viewBox="`0 0 ${VB} ${VB}`" preserveAspectRatio="xMidYMid meet" class="oct-svg">
					<g :style="{ color: sectorFill }">
						<!-- Cardinal sectors -->
						<path v-for="s in cardinalSectors" :key="s.id" :d="s.d" class="oct-sector"
							  :style="{ fill: ringColor(s.ringIndex), opacity: s.opacity }"
							  :class="{ 'oct-ring-highlight': hoveredRing === s.ringIndex }"
							  @click="jogSingle(s.axis, s.signed)"
							  @contextmenu.prevent="editStep('xy', s.ringIndex)">
							<title>{{ s.axis }}{{ s.signed > 0 ? '+' : '' }}{{ fmt(s.signed) }} mm</title>
						</path>

						<!-- Diagonal sectors (optional) -->
						<template v-if="widget.showDiagonals !== false">
							<path v-for="s in diagonalSectors" :key="s.id" :d="s.d" class="oct-sector oct-sector-diag"
								  :style="{ fill: ringColor(s.ringIndex), opacity: s.opacity }"
								  :class="{ 'oct-ring-highlight': hoveredRing === s.ringIndex }"
								  @click="jogXY(s.xSign, s.ySign, s.step)"
								  @contextmenu.prevent="editStep('xy', s.ringIndex)">
								<title>{{ xAxisLetter }}{{ s.xSign > 0 ? '+' : '' }}{{ fmt(s.step) }} {{ yAxisLetter }}{{ s.ySign > 0 ? '+' : '' }}{{ fmt(s.step) }} mm</title>
							</path>
						</template>

						<!-- Ring step labels (upper-right gap) -->
						<text v-for="l in stepLabels" :key="l.id" :x="l.x" :y="l.y" class="oct-step-label"
							  text-anchor="middle" dominant-baseline="central">{{ l.text }}</text>

						<!-- Direction labels -->
						<text v-for="d in dirLabels" :key="d.id" :x="d.x" :y="d.y" class="oct-dir-label"
							  text-anchor="middle" dominant-baseline="central">{{ d.text }}</text>

						<!-- Centre hub: home all -->
						<g v-if="widget.showHome !== false" class="oct-hub" :style="{ color: sectorFill }"
						   @click="homeAll">
							<title>{{ $t("plugins.flexibleLayouts.jog.homeAll") }}</title>
							<circle :cx="C" :cy="C" :r="RHUB" class="oct-hub-bg" />
							<path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z" class="oct-hub-icon"
								  :transform="hubIconTransform" />
						</g>
					</g>
				</svg>

				<!-- Per-axis home buttons -->
				<template v-if="widget.showHome !== false">
					<button type="button" class="oct-axis-home oct-home-x" :style="axisBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${xAxisLetter}`" @click="homeX">
						<v-icon size="x-small">mdi-home</v-icon><span class="oct-axis-letter">{{ xAxisLetter }}</span>
					</button>
					<button type="button" class="oct-axis-home oct-home-y" :style="axisBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${yAxisLetter}`" @click="homeY">
						<v-icon size="x-small">mdi-home</v-icon><span class="oct-axis-letter">{{ yAxisLetter }}</span>
					</button>
				</template>
			</div>

			<!-- Z bar -->
			<div v-if="widget.showZ !== false" class="oct-z d-flex flex-column ga-1">
				<button v-for="(s, k) in zStepList" :key="'zp' + k" type="button" class="oct-zbtn"
						:style="axisBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} +${fmt(s)} mm`"
						@click="jog(zAxisLetter, zSign * s, zFeed)" @contextmenu.prevent="editStep('z', k)">
					<v-icon v-if="k === 0" size="x-small">mdi-chevron-up</v-icon>
					<span class="oct-zval">{{ fmt(s) }}</span>
				</button>
				<button v-if="widget.showHome !== false" type="button" class="oct-zbtn oct-zhome"
						:style="axisBtnStyle" :disabled="disabledNow"
						:title="$t('plugins.flexibleLayouts.jog.homeZ')" @click="homeZ">
					<v-icon size="x-small">mdi-home</v-icon>
				</button>
				<button v-for="(z, i) in zStepsDown" :key="'zn' + z.k" type="button" class="oct-zbtn"
						:style="axisBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} -${fmt(z.s)} mm`"
						@click="jog(zAxisLetter, -zSign * z.s, zFeed)" @contextmenu.prevent="editStep('z', z.k)">
					<span class="oct-zval">{{ fmt(z.s) }}</span>
					<v-icon v-if="i === zStepsDown.length - 1" size="x-small">mdi-chevron-down</v-icon>
				</button>
			</div>
		</div>

		<!-- Distance bullets (colour-keyed ring legend) -->
		<div v-if="widget.showDistanceBullets !== false" class="oct-bullets d-flex ga-1 flex-shrink-0 mt-1 justify-center flex-wrap">
			<span v-for="(s, k) in xySteps" :key="k" class="oct-bullet"
				  :style="{ color: ringColor(k) }"
				  @mouseenter="hoveredRing = k"
				  @mouseleave="hoveredRing = null"
				  @contextmenu.prevent="editStep('xy', k)">
				&#9679;{{ fmt(s) }}
			</span>
		</div>

		<div v-if="widget.showMotorsOff" class="flex-shrink-0 mt-1">
			<v-btn size="small" variant="tonal" block prepend-icon="mdi-power" :disabled="disabledNow"
				   @click="motorsOff">{{ $t("plugins.flexibleLayouts.jog.motorsOff") }}</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { getNumericInput } from "@/composables/useInputDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { polar, sectorPath } from "../util/shapes";

const props = defineProps<{
	widget: Extract<Widget, { type: "octopusJog" }>;
	disabled?: boolean;
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// --- configuration with fallbacks -----------------------------------------------
const xySteps    = computed(() => props.widget.xySteps?.length ? props.widget.xySteps : [100, 10, 1, 0.1]);
const zStepList  = computed(() => props.widget.zSteps?.length  ? props.widget.zSteps  : [10, 1, 0.1]);
const zStepsDown = computed(() => zStepList.value.map((s, k) => ({ s, k })).reverse());

const xAxisLetter = computed(() => props.widget.xAxis ?? "X");
const yAxisLetter = computed(() => props.widget.yAxis ?? "Y");
const zAxisLetter = computed(() => props.widget.zAxis ?? "Z");
const zSign       = computed(() => props.widget.invertZ ? -1 : 1);
const sectorFill  = computed(() => resolveColor(props.widget.color));
const axisBtnStyle = computed(() => ({ color: sectorFill.value }));

const xyFeed = computed({
	get: () => props.widget.xyFeedrate ?? 3000,
	set: (v: number) => { props.widget.xyFeedrate = Number(v) || 0; },
});
const zFeed = computed({
	get: () => props.widget.zFeedrate ?? 600,
	set: (v: number) => { props.widget.zFeedrate = Number(v) || 0; },
});

onMounted(() => {
	if (!props.widget.xySteps) { props.widget.xySteps = [100, 10, 1, 0.1]; }
	if (!props.widget.zSteps)  { props.widget.zSteps  = [10, 1, 0.1]; }
});

// --- SVG geometry ---------------------------------------------------------------
const VB   = 140;  // viewBox size
const C    = 70;   // centre
const RMAX = 55;   // outer ring radius
const RHUB = 14;   // hub radius
const HW   = 20;   // half-width of each cardinal wedge (degrees); ~20° gap to diagonal

const hubIconTransform = computed(() => {
	const s = (RHUB * 1.1) / 24;
	return `translate(${(C - 12 * s).toFixed(2)} ${(C - 12 * s).toFixed(2)}) scale(${s.toFixed(3)})`;
});

function f(n: number): string { return n.toFixed(2); }
function fmt(v: number): string { return Number(Math.abs(v).toFixed(4)).toString(); }

// Ring colours: use the theme colour at varying opacities so each ring looks keyed
// independently. The bullet legend mirrors the same palette.
const RING_OPACITIES = [0.55, 0.40, 0.28, 0.18];
function ringColor(_k: number): string {
	// Return the sector fill colour — opacity is applied via SVG opacity attr
	return sectorFill.value;
}
function ringOpacity(k: number): number {
	return RING_OPACITIES[k] ?? Math.max(0.1, 0.55 - k * 0.08);
}

// --- Cardinals ---------------------------------------------------------------
interface Cardinal {
	key: string;
	angle: number;   // degrees CW from up
	axis: () => string;
	positive: boolean;
	invert: () => boolean | undefined;
}

const cardinals = computed<Array<Cardinal>>(() => [
	{ key: "up",    angle: 0,   axis: () => yAxisLetter.value, positive: true,  invert: () => props.widget.invertY },
	{ key: "right", angle: 90,  axis: () => xAxisLetter.value, positive: true,  invert: () => props.widget.invertX },
	{ key: "down",  angle: 180, axis: () => yAxisLetter.value, positive: false, invert: () => props.widget.invertY },
	{ key: "left",  angle: 270, axis: () => xAxisLetter.value, positive: false, invert: () => props.widget.invertX },
]);

// --- Diagonals ---------------------------------------------------------------
interface DiagonalDef {
	key: string;
	angle: number;  // centre angle (deg)
	xSign: 1 | -1;
	ySign: 1 | -1;
}

const diagonalDefs = computed<Array<DiagonalDef>>(() => [
	{ key: "ur", angle: 45,  xSign:  1, ySign:  1 },
	{ key: "dr", angle: 135, xSign:  1, ySign: -1 },
	{ key: "dl", angle: 225, xSign: -1, ySign: -1 },
	{ key: "ul", angle: 315, xSign: -1, ySign:  1 },
]);

const DIAG_HW = 22;  // half-width of diagonal wedge

// Cardinal sectors
const cardinalSectors = computed(() => {
	const steps = xySteps.value;
	const n = steps.length;
	const bw = (RMAX - RHUB) / n;
	const out: Array<{ id: string; d: string; axis: string; signed: number; step: number; ringIndex: number; opacity: number }> = [];
	for (const card of cardinals.value) {
		const baseSign = (card.positive ? 1 : -1) * (card.invert() ? -1 : 1);
		for (let k = 0; k < n; k++) {
			const rOut = RMAX - k * bw;
			const rIn  = RMAX - (k + 1) * bw;
			out.push({
				id: `c-${card.key}-${k}`,
				d: sectorPath(C, C, card.angle - HW, card.angle + HW, rIn, rOut),
				axis: card.axis(),
				signed: baseSign * steps[k],
				step: steps[k],
				ringIndex: k,
				opacity: ringOpacity(k),
			});
		}
	}
	return out;
});

// Diagonal sectors
const diagonalSectors = computed(() => {
	const steps = xySteps.value;
	const n = steps.length;
	const bw = (RMAX - RHUB) / n;
	const out: Array<{ id: string; d: string; xSign: 1 | -1; ySign: 1 | -1; step: number; ringIndex: number; opacity: number }> = [];
	for (const diag of diagonalDefs.value) {
		// Apply axis inversions — result is always ±1
		const xs = (diag.xSign * (props.widget.invertX ? -1 : 1)) as (1 | -1);
		const ys = (diag.ySign * (props.widget.invertY ? -1 : 1)) as (1 | -1);
		for (let k = 0; k < n; k++) {
			const rOut = RMAX - k * bw;
			const rIn  = RMAX - (k + 1) * bw;
			out.push({
				id: `d-${diag.key}-${k}`,
				d: sectorPath(C, C, diag.angle - DIAG_HW, diag.angle + DIAG_HW, rIn, rOut),
				xSign: xs,
				ySign: ys,
				step: steps[k],
				ringIndex: k,
				opacity: ringOpacity(k) * 0.75,
			});
		}
	}
	return out;
});

const stepLabels = computed(() => {
	const steps = xySteps.value;
	const n = steps.length;
	const bw = (RMAX - RHUB) / n;
	// Place labels in the diagonal gap at 45°
	return steps.map((s, k) => {
		const r = RMAX - (k + 0.5) * bw;
		const [x, y] = polar(C, C, r, 45);
		return { id: `sl-${k}`, x: f(x), y: f(y), text: fmt(s) };
	});
});

const dirLabels = computed(() =>
	cardinals.value.map((card) => {
		const [x, y] = polar(C, C, RMAX + 6, card.angle);
		const sign = (card.positive ? 1 : -1) * (card.invert() ? -1 : 1);
		return { id: `dl-${card.key}`, x: f(x), y: f(y), text: `${sign > 0 ? "+" : "-"}${card.axis()}` };
	}),
);

// --- Bullet hover state -------------------------------------------------------
const hoveredRing = ref<number | null>(null);

// --- DRO data ----------------------------------------------------------------
interface RawAxis { letter?: string; machinePosition?: number | null }

const droAxes = computed(() => {
	const raw = machineStore.model as { move?: { axes?: Array<RawAxis> } } | null | undefined;
	const axes: Array<RawAxis> = raw?.move?.axes ?? [];
	return [xAxisLetter.value, yAxisLetter.value, zAxisLetter.value].map(letter => {
		const ax = axes.find(a => a.letter === letter);
		return {
			letter,
			val: ax?.machinePosition != null ? Number(ax.machinePosition).toFixed(2) : "—",
		};
	});
});

// --- Actions -----------------------------------------------------------------
function quote(letter: string): string {
	return /[a-z]/.test(letter) ? `'${letter}` : letter;
}

function jog(letter: string, signed: number, feed: number): void {
	if (disabledNow.value || !letter) { return; }
	const amount = Number(signed.toFixed(4));
	void machineStore.sendCode(`M120\nG91\nG1 ${quote(letter)}${amount} F${feed}\nM121`);
}

function jogSingle(axis: string, signed: number): void {
	jog(axis, signed, xyFeed.value);
}

function jogXY(xSign: number, ySign: number, step: number): void {
	if (disabledNow.value) { return; }
	const xAmt = Number((xSign * step).toFixed(4));
	const yAmt = Number((ySign * step).toFixed(4));
	const x = quote(xAxisLetter.value);
	const y = quote(yAxisLetter.value);
	void machineStore.sendCode(`M120\nG91\nG1 ${x}${xAmt} ${y}${yAmt} F${xyFeed.value}\nM121`);
}

function homeAll(): void { if (!disabledNow.value) { void machineStore.sendCode("G28"); } }
function homeX(): void   { if (!disabledNow.value) { void machineStore.sendCode(`G28 ${quote(xAxisLetter.value)}`); } }
function homeY(): void   { if (!disabledNow.value) { void machineStore.sendCode(`G28 ${quote(yAxisLetter.value)}`); } }
function homeZ(): void   { if (!disabledNow.value) { void machineStore.sendCode(`G28 ${quote(zAxisLetter.value)}`); } }
function motorsOff(): void { if (!disabledNow.value) { void machineStore.sendCode("M18"); } }

// --- Right-click step editing ------------------------------------------------
async function editStep(arr: "xy" | "z", index: number): Promise<void> {
	const current = arr === "xy" ? xySteps.value[index] : zStepList.value[index];
	const v = await getNumericInput(
		i18n.global.t("plugins.flexibleLayouts.jog.editStepTitle"),
		i18n.global.t("plugins.flexibleLayouts.jog.stepAmount"),
		current,
		0,
	);
	if (v !== null && !Number.isNaN(v) && v > 0) {
		if (arr === "xy") {
			(props.widget.xySteps ??= [...xySteps.value])[index] = v;
		} else {
			(props.widget.zSteps ??= [...zStepList.value])[index] = v;
		}
	}
}
</script>

<style scoped>
.oct-root { min-height: 0; }
.oct-title {
	font-size: 0.8em;
	font-weight: 600;
	line-height: 1.4;
	opacity: 0.85;
}
.oct-dro {
	font-size: 0.75em;
	line-height: 1.3;
}
.oct-dro-axis { display: flex; gap: 2px; align-items: baseline; }
.oct-dro-lbl  { font-weight: 600; opacity: 0.7; font-size: 0.85em; }
.oct-dro-val  { font-variant-numeric: tabular-nums; }
.oct-feed {
	display: flex;
	flex-direction: column;
	flex: 1 1 0;
	min-width: 0;
	gap: 1px;
}
.oct-feed-label {
	font-size: 0.55em;
	line-height: 1.2;
	opacity: 0.7;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.oct-feed-input {
	width: 100%;
	box-sizing: border-box;
	min-width: 0;
	font: inherit;
	font-size: 0.85em;
	line-height: 1.4;
	padding: 2px 6px;
	color: inherit;
	background: rgba(var(--v-theme-on-surface), 0.04);
	border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
	border-radius: 4px;
}
.oct-feed-input:focus {
	outline: none;
	border-color: rgb(var(--v-theme-primary));
}
.oct-frozen { opacity: 0.5; pointer-events: none; }
.oct-body   { min-height: 0; }
.oct-xy {
	position: relative;
	flex: 1 1 auto;
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}
.oct-svg {
	width: 100%;
	height: 100%;
	max-height: 100%;
	display: block;
}
.oct-sector {
	cursor: pointer;
	stroke: rgb(var(--v-theme-surface));
	stroke-width: 0.6;
	transition: opacity 0.1s;
}
.oct-sector:hover    { opacity: 1 !important; }
.oct-sector-diag     { stroke-dasharray: 2 1; }
.oct-ring-highlight  { opacity: 1 !important; }
.oct-step-label {
	font-size: 5.5px;
	fill: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	font-weight: 600;
}
.oct-dir-label {
	font-size: 6px;
	fill: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	opacity: 0.7;
}
.oct-hub { cursor: pointer; }
.oct-hub-bg {
	fill: rgb(var(--v-theme-surface));
	stroke: currentColor;
	stroke-width: 1;
}
.oct-hub:hover .oct-hub-bg { fill: rgba(var(--v-theme-on-surface), 0.08); }
.oct-hub-icon { fill: currentColor; }
.oct-axis-home {
	position: absolute;
	top: 2px;
	display: flex;
	align-items: center;
	gap: 1px;
	padding: 1px 4px;
	font-size: 0.6em;
	line-height: 1;
	border-radius: 4px;
	color: currentColor;
	background: rgba(var(--v-theme-on-surface), 0.04);
	border: 1px solid currentColor;
	cursor: pointer;
}
.oct-axis-home:hover { background: currentColor; }
.oct-axis-home:hover :deep(.v-icon),
.oct-axis-home:hover .oct-axis-letter { color: rgb(var(--v-theme-surface)); }
.oct-home-x { left: 2px; }
.oct-home-y { right: 2px; }
.oct-axis-letter { font-weight: 600; }
.oct-z {
	flex: 0 0 auto;
	width: clamp(38px, 22%, 64px);
	min-height: 0;
}
.oct-zbtn {
	flex: 1 1 0;
	min-height: 0;
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 1px;
	font-size: 0.65em;
	line-height: 1;
	border-radius: 4px;
	color: currentColor;
	background: rgba(var(--v-theme-on-surface), 0.04);
	border: 1px solid currentColor;
	cursor: pointer;
	overflow: hidden;
}
.oct-zval {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.oct-zbtn:hover { background: currentColor; }
.oct-zbtn:hover span,
.oct-zbtn:hover :deep(.v-icon) { color: rgb(var(--v-theme-surface)); }
.oct-zhome { flex: 0 0 auto; padding: 4px 0; }
.oct-bullets {
	font-size: 0.65em;
	line-height: 1.2;
}
.oct-bullet {
	cursor: pointer;
	border-radius: 3px;
	padding: 0 3px;
	transition: background 0.1s;
}
.oct-bullet:hover { background: rgba(var(--v-theme-on-surface), 0.08); }
</style>
