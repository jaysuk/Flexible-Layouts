<template>
	<div class="oct-root fill-height d-flex flex-column pa-1" :class="{ 'oct-frozen': disabledNow }">
		<div v-if="widget.title" class="oct-title text-center text-truncate flex-shrink-0">{{ widget.title }}</div>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<!-- Optional DRO header -->
		<div v-if="widget.showDro" class="oct-dro d-flex ga-2 mb-1 flex-shrink-0 justify-center">
			<span class="oct-dro-axis" v-for="ax in droAxes" :key="ax.letter">
				<span class="oct-dro-lbl">{{ ax.letter }}</span>
				<span class="oct-dro-val">{{ ax.val }}</span>
			</span>
		</div>

		<!-- Inline feedrate row - X, Y and Z independently (a diagonal move still travels each axis at
			 its own rate). -->
		<div v-if="widget.showFeedrate !== false" class="d-flex ga-2 mb-1 flex-shrink-0">
			<label class="oct-feed">
				<span class="oct-feed-label">{{ $t("plugins.flexibleLayouts.jog.axisFeed", { axis: xAxisLetter }) }}</span>
				<input v-model.number="xFeed" class="oct-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
			<label class="oct-feed">
				<span class="oct-feed-label">{{ $t("plugins.flexibleLayouts.jog.axisFeed", { axis: yAxisLetter }) }}</span>
				<input v-model.number="yFeed" class="oct-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
			<label v-if="widget.showZ !== false" class="oct-feed">
				<span class="oct-feed-label">{{ $t("plugins.flexibleLayouts.jog.axisFeed", { axis: zAxisLetter }) }}</span>
				<input v-model.number="zFeed" class="oct-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
		</div>

		<div class="d-flex flex-grow-1 ga-2 oct-body">
			<!-- 8-arm SVG -->
			<div class="oct-xy">
				<svg :viewBox="`0 0 ${VB} ${VB}`" preserveAspectRatio="xMidYMid meet" class="oct-svg">
					<g :style="{ color: sectorFill }">
						<!-- Cardinal sectors -->
						<path v-for="s in cardinalSectors" :key="s.id" :d="s.d"
							  class="oct-sector" :class="{ 'oct-ring-highlight': hoveredRing === s.ringIndex, 'oct-sector-blocked': blockedAxes.has(s.axis.toUpperCase()) }"
							  :style="{ fill: ringColor(s.ringIndex), opacity: s.opacity }"
							  @click="jogSingle(s.axis, s.signed)"
							  @contextmenu.prevent="editStep('xy', s.ringIndex)">
							<title>{{ s.axis }}{{ s.signed > 0 ? '+' : '' }}{{ fmt(s.signed) }} mm{{ blockedAxes.has(s.axis.toUpperCase()) ? ` — ${$t('plugins.flexibleLayouts.jog.blockedUnhomed')}` : "" }}</title>
						</path>

						<!-- Diagonal sectors (optional) -->
						<template v-if="widget.showDiagonals !== false">
							<path v-for="s in diagonalSectors" :key="s.id" :d="s.d"
								  class="oct-sector oct-sector-diag" :class="{ 'oct-ring-highlight': hoveredRing === s.ringIndex, 'oct-sector-blocked': diagonalBlocked }"
								  :style="{ fill: ringColor(s.ringIndex), opacity: s.opacity }"
								  @click="jogXY(s.xSign, s.ySign, s.step)"
								  @contextmenu.prevent="editStep('xy', s.ringIndex)">
								<title>{{ xAxisLetter }}{{ s.xSign > 0 ? '+' : '' }}{{ fmt(s.step) }} {{ yAxisLetter }}{{ s.ySign > 0 ? '+' : '' }}{{ fmt(s.step) }} mm{{ diagonalBlocked ? ` — ${$t('plugins.flexibleLayouts.jog.blockedUnhomed')}` : "" }}</title>
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
					<button type="button" class="oct-axis-home oct-home-x" :class="{ 'oct-home-unhomed': isUnhomed(xAxisLetter) }"
							:style="axisBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${xAxisLetter}`" @click="homeX">
						<v-icon size="x-small">mdi-home</v-icon><span class="oct-axis-letter">{{ xAxisLetter }}</span>
					</button>
					<button type="button" class="oct-axis-home oct-home-y" :class="{ 'oct-home-unhomed': isUnhomed(yAxisLetter) }"
							:style="axisBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${yAxisLetter}`" @click="homeY">
						<v-icon size="x-small">mdi-home</v-icon><span class="oct-axis-letter">{{ yAxisLetter }}</span>
					</button>
				</template>
			</div>

			<!-- Z bar -->
			<div v-if="widget.showZ !== false" class="oct-z d-flex flex-column ga-1">
				<button v-for="(s, k) in zStepList" :key="'zp' + k" type="button" class="oct-zbtn"
						:class="{ 'oct-zbtn-blocked': zBlocked }"
						:style="axisBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} +${fmt(s)} mm`"
						@click="jog(zAxisLetter, zSign * s, zFeed)" @contextmenu.prevent="editStep('z', k)">
					<v-icon v-if="k === 0" size="x-small">mdi-chevron-up</v-icon>
					<span class="oct-zval">{{ fmt(s) }}</span>
				</button>
				<button v-if="widget.showHome !== false" type="button" class="oct-zbtn oct-zhome"
						:class="{ 'oct-home-unhomed': isUnhomed(zAxisLetter) }"
						:style="axisBtnStyle" :disabled="disabledNow"
						:title="$t('plugins.flexibleLayouts.jog.homeZ')" @click="homeZ">
						<v-icon size="x-small">mdi-home</v-icon><span class="oct-axis-letter">{{ zAxisLetter }}</span>
				</button>
				<button v-for="(z, i) in zStepsDown" :key="'zn' + z.k" type="button" class="oct-zbtn"
						:class="{ 'oct-zbtn-blocked': zBlocked }"
						:style="axisBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} -${fmt(z.s)} mm`"
						@click="jog(zAxisLetter, -zSign * z.s, zFeed)" @contextmenu.prevent="editStep('z', z.k)">
					<span class="oct-zval">{{ fmt(z.s) }}</span>
					<v-icon v-if="i === zStepsDown.length - 1" size="x-small">mdi-chevron-down</v-icon>
				</button>
			</div>
		</div>

		<!-- Distance bullets (colour-keyed ring legend) -->
		<div v-if="widget.showDistanceBullets !== false" class="oct-bullets d-flex ga-2 flex-shrink-0 mt-1 justify-center flex-wrap">
			<span v-for="(s, k) in xySteps" :key="k" class="oct-bullet"
				  :style="{ color: ringColor(k) }"
				  @mouseenter="hoveredRing = k"
				  @mouseleave="hoveredRing = null"
				  @contextmenu.prevent="editStep('xy', k)">
				<span class="oct-bullet-dot" :style="{ opacity: ringOpacity(k) }">&#9679;</span>{{ fmt(s) }}
			</span>
		</div>

		<div v-if="widget.showMotorsOff" class="flex-shrink-0 mt-1">
			<v-btn size="small" variant="tonal" block prepend-icon="mdi-power" :color="sectorFill" :disabled="disabledNow"
				   @click="motorsOff">{{ $t("plugins.flexibleLayouts.jog.motorsOff") }}</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { getNumericInput } from "@/composables/useInputDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { polar, sectorPath } from "../util/shapes";
import { unhomedAxes } from "../util/homedCheck";
import { resolveOmPath } from "../util/omPath";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{
	widget: Extract<Widget, { type: "octopusJog" }>;
	disabled?: boolean;
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// Advisory only (same reasoning as JogWidget.vue) - only actually blocks a move when the firmware
// itself refuses it (move.noMovesBeforeHoming, M564 H1), mirroring DWC's own jog-button behaviour.
const unhomedNow = computed(() => unhomedAxes(machineStore.model, [xAxisLetter.value, yAxisLetter.value, zAxisLetter.value]));
const noMovesBeforeHoming = computed(() => resolveOmPath(machineStore.model, "move.noMovesBeforeHoming") === true);
const blockedAxes = computed(() => {
	if (!noMovesBeforeHoming.value) {
		return new Set<string>();
	}
	return new Set(unhomedNow.value);
});
const zBlocked = computed(() => blockedAxes.value.has(zAxisLetter.value.toUpperCase()));
const diagonalBlocked = computed(() => blockedAxes.value.has(xAxisLetter.value.toUpperCase()) || blockedAxes.value.has(yAxisLetter.value.toUpperCase()));

/** Whether `letter` is currently unhomed - see JogWidget.vue's identical helper for why this is
 *  independent of blockedAxes and case-insensitive. */
function isUnhomed(letter: string): boolean {
	return unhomedNow.value.some((a) => a.toUpperCase() === letter.toUpperCase());
}

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

const xFeed = computed({
	get: () => props.widget.xFeedrate ?? 3000,
	set: (v: number) => { props.widget.xFeedrate = Number(v) || 0; },
});
const yFeed = computed({
	get: () => props.widget.yFeedrate ?? 3000,
	set: (v: number) => { props.widget.yFeedrate = Number(v) || 0; },
});
/** Which feedrate applies to a cardinal sector's axis - X and Y are independently settable. */
function feedFor(axis: string): number {
	return axis.toUpperCase() === xAxisLetter.value.toUpperCase() ? xFeed.value : yFeed.value;
}
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

function warnBlocked(axis: string): void {
	uiStore.makeNotification(LogLevel.warning, i18n.global.t("plugins.flexibleLayouts.jog.blockedUnhomed"),
		i18n.global.t("plugins.flexibleLayouts.jog.blockedUnhomedDetail", { axis: axis.toUpperCase() }));
}

function jog(letter: string, signed: number, feed: number): void {
	if (disabledNow.value || !letter) { return; }
	if (blockedAxes.value.has(letter.toUpperCase())) { warnBlocked(letter); return; }
	const amount = Number(signed.toFixed(4));
	void machineStore.sendCode(`M120\nG91\nG1 ${quote(letter)}${amount} F${feed}\nM121`);
}

function jogSingle(axis: string, signed: number): void {
	jog(axis, signed, feedFor(axis));
}

function jogXY(xSign: number, ySign: number, step: number): void {
	if (disabledNow.value) { return; }
	if (diagonalBlocked.value) {
		warnBlocked(blockedAxes.value.has(xAxisLetter.value.toUpperCase()) ? xAxisLetter.value : yAxisLetter.value);
		return;
	}
	const xAmt = Number((xSign * step).toFixed(4));
	const yAmt = Number((ySign * step).toFixed(4));
	const x = quote(xAxisLetter.value);
	const y = quote(yAxisLetter.value);
	// A single G1 line only has one F - it sets the feed rate of the combined vector move, not a
	// separate rate per axis, so a genuinely diagonal move can't honour X's and Y's rates
	// independently the way a single-axis jog can. Uses X's configured rate as the diagonal speed
	// (a documented, predictable choice) rather than inventing a blended value nobody asked for.
	void machineStore.sendCode(`M120\nG91\nG1 ${x}${xAmt} ${y}${yAmt} F${xFeed.value}\nM121`);
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
		// Reassign the whole array rather than mutating one index in place - see JogWidget.vue's
		// identical fix/comment; this is what a saved layout's persistence watcher reliably picks up.
		if (arr === "xy") {
			props.widget.xySteps = xySteps.value.map((s, i) => (i === index ? v : s));
		} else {
			props.widget.zSteps = zStepList.value.map((s, i) => (i === index ? v : s));
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
	/* See JogWidget.vue's identical rule/comment: a per-panel label-size setting can raise this well
	   past what nowrap+ellipsis was measured for, silently hiding text instead of growing the row. */
	white-space: normal;
	word-break: break-word;
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
.oct-sector-blocked  { cursor: not-allowed; fill: rgb(var(--v-theme-warning)) !important; }
.oct-step-label {
	/* em, not a fixed px - see JogWidget.vue's identical rule/comment for why this can only ever
	   track the panel's font-size setting approximately, not pixel-match the HTML labels outside
	   the SVG, but that's still strictly better than ignoring the setting completely. */
	font-size: 0.4em;
	fill: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	font-weight: 600;
}
.oct-dir-label {
	font-size: 0.43em;
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
	justify-content: center;
	gap: 2px;
	padding: 4px 7px;
	/* A real hit-target floor - see JogWidget.vue's identical rule/comment. */
	min-width: 24px;
	min-height: 24px;
	font-size: 0.7em;
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
/* Matches DWC's own Movement panel convention - see JogWidget.vue's identical rule/comment. */
.oct-home-unhomed {
	color: rgb(var(--v-theme-warning)) !important;
	border-color: rgb(var(--v-theme-warning)) !important;
}
.oct-z {
	flex: 0 0 auto;
	width: clamp(38px, 22%, 64px);
	min-height: 0;
}
.oct-zbtn {
	flex: 1 1 0;
	min-height: 20px;
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
.oct-zbtn-blocked { cursor: not-allowed; border-color: rgb(var(--v-theme-warning)) !important; color: rgb(var(--v-theme-warning)) !important; }
.oct-bullets {
	font-size: 0.7em;
	line-height: 1.2;
}
.oct-bullet {
	cursor: pointer;
	border-radius: 3px;
	padding: 2px 4px;
	transition: background 0.1s;
}
.oct-bullet:hover { background: rgba(var(--v-theme-on-surface), 0.08); }
/* The dot is the whole point of the legend - it was the same size as the number text next to it,
   at a font-size small enough that all four rings' dots looked like the same colour/weight and the
   "legend" conveyed nothing. Bigger and bolder than the number, so the actual distinguishing signal
   (each ring's own opacity, applied here via ringOpacity()) is visible at a glance. */
.oct-bullet-dot {
	font-size: 1.6em;
	line-height: 0;
	vertical-align: -0.12em;
	margin-right: 1px;
}
</style>
