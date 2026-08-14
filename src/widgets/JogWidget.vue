<template>
	<div class="jog-root fill-height d-flex flex-column pa-1" :class="{ 'jog-frozen': disabledNow }">
		<div v-if="widget.title" class="jog-title text-center text-truncate flex-shrink-0">{{ widget.title }}</div>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<!-- Inline, editable feedrates - X, Y and Z independently (a diagonal move still travels each
			 axis at its own rate). Native inputs, self-styled, so the value scales with the panel font
			 and is never clipped by a fixed-height form control. -->
		<div v-if="widget.showFeedrate !== false" class="d-flex ga-2 mb-1 flex-shrink-0">
			<label class="jog-feed">
				<span class="jog-feed-label">{{ $t("plugins.flexibleLayouts.jog.axisFeed", { axis: xAxisLetter }) }}</span>
				<input v-model.number="xFeed" class="jog-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
			<label class="jog-feed">
				<span class="jog-feed-label">{{ $t("plugins.flexibleLayouts.jog.axisFeed", { axis: yAxisLetter }) }}</span>
				<input v-model.number="yFeed" class="jog-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
			<label v-if="widget.showZ !== false" class="jog-feed">
				<span class="jog-feed-label">{{ $t("plugins.flexibleLayouts.jog.axisFeed", { axis: zAxisLetter }) }}</span>
				<input v-model.number="zFeed" class="jog-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
		</div>

		<div class="d-flex flex-grow-1 ga-2 jog-body">
			<!-- XY concentric rings. The hub home-button is drawn INSIDE the SVG so it scales and
				 stays aligned with the click sectors at any aspect ratio. -->
			<div class="jog-xy">
				<svg :viewBox="`0 0 ${VB} ${VB}`" preserveAspectRatio="xMidYMid meet" class="jog-svg">
					<g :style="{ color: sectorFill }">
						<path v-for="s in xySectors" :key="s.id" :d="s.d"
							  class="jog-sector" :class="{ 'jog-sector-blocked': blockedAxes.has(s.axis.toUpperCase()) }"
							  :style="{ fill: 'currentColor', opacity: s.opacity }"
							  @click="jog(s.axis, s.signed, feedFor(s.axis))"
							  @contextmenu.prevent="editStep('xy', s.ringIndex)">
							<title>{{ s.axis }}{{ s.signed > 0 ? "+" : "" }}{{ fmt(s.signed) }} mm{{ blockedAxes.has(s.axis.toUpperCase()) ? ` — ${$t('plugins.flexibleLayouts.jog.blockedUnhomed')}` : "" }}</title>
						</path>
					</g>
					<!-- ring step values, laid along the upper-right gap like Pronterface -->
					<text v-for="l in stepLabels" :key="l.id" :x="l.x" :y="l.y" class="jog-step-label"
						  text-anchor="middle" dominant-baseline="central">{{ l.text }}</text>
					<!-- direction labels at the tips -->
					<text v-for="d in dirLabels" :key="d.id" :x="d.x" :y="d.y" class="jog-dir-label"
						  text-anchor="middle" dominant-baseline="central">{{ d.text }}</text>
					<!-- centre hub: home-all -->
					<g v-if="widget.showHome !== false" class="jog-hub" :style="{ color: sectorFill }"
					   @click="homeAll">
						<title>{{ $t("plugins.flexibleLayouts.jog.homeAll") }}</title>
						<circle :cx="C" :cy="C" :r="RHUB" class="jog-hub-bg" />
						<path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z" class="jog-hub-icon"
							  :transform="hubIconTransform" />
					</g>
				</svg>

				<!-- per-axis home buttons, tucked into the corners so they don't overlap the rings -->
				<template v-if="widget.showHome !== false">
					<button type="button" class="jog-axis-home jog-home-x" :class="{ 'jog-home-unhomed': isUnhomed(xAxisLetter) }"
							:style="zBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${xAxisLetter}`" @click="homeX">
						<v-icon size="x-small">mdi-home</v-icon><span class="jog-axis-letter">{{ xAxisLetter }}</span>
					</button>
					<button type="button" class="jog-axis-home jog-home-y" :class="{ 'jog-home-unhomed': isUnhomed(yAxisLetter) }"
							:style="zBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${yAxisLetter}`" @click="homeY">
						<v-icon size="x-small">mdi-home</v-icon><span class="jog-axis-letter">{{ yAxisLetter }}</span>
					</button>
				</template>
			</div>

			<!-- Z bar -->
			<div v-if="widget.showZ !== false" class="jog-z d-flex flex-column ga-1">
				<button v-for="(s, k) in zStepList" :key="'zp' + k" type="button" class="jog-zbtn"
						:class="{ 'jog-zbtn-blocked': zBlocked }"
						:style="zBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} +${fmt(s)} mm`"
						@click="jog(zAxisLetter, zSign * s, zFeed)" @contextmenu.prevent="editStep('z', k)">
					<v-icon v-if="k === 0" size="x-small">mdi-chevron-up</v-icon>
					<span class="jog-zval">{{ fmt(s) }}</span>
				</button>
				<button v-if="widget.showHome !== false" type="button" class="jog-zbtn jog-zhome"
						:class="{ 'jog-home-unhomed': isUnhomed(zAxisLetter) }"
						:style="zBtnStyle" :disabled="disabledNow"
						:title="$t('plugins.flexibleLayouts.jog.homeZ')" @click="homeZ">
						<v-icon size="x-small">mdi-home</v-icon><span class="jog-axis-letter">{{ zAxisLetter }}</span>
				</button>
				<button v-for="(z, i) in zStepsDown" :key="'zn' + z.k" type="button" class="jog-zbtn"
						:class="{ 'jog-zbtn-blocked': zBlocked }"
						:style="zBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} -${fmt(z.s)} mm`"
						@click="jog(zAxisLetter, -zSign * z.s, zFeed)" @contextmenu.prevent="editStep('z', z.k)">
					<span class="jog-zval">{{ fmt(z.s) }}</span>
					<v-icon v-if="i === zStepsDown.length - 1" size="x-small">mdi-chevron-down</v-icon>
				</button>
			</div>
		</div>

		<div v-if="widget.showMotorsOff" class="flex-shrink-0 mt-1">
			<v-btn size="small" variant="tonal" block prepend-icon="mdi-power" :color="sectorFill" :disabled="disabledNow"
				   @click="motorsOff">{{ $t("plugins.flexibleLayouts.jog.motorsOff") }}</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";

import { getNumericInput } from "@/composables/useInputDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { polar, sectorPath as _sectorPath } from "../util/shapes";
import { unhomedAxes } from "../util/homedCheck";
import { resolveOmPath } from "../util/omPath";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{
	widget: Extract<Widget, { type: "jog" }>;
	disabled?: boolean;
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// Advisory only, same as DWC's own MovementPanel: an unhomed axis is a normal, common state to jog
// FROM (it's often how you reach a safe position before homing), so this never blocks a press on
// its own - it only warns. The one case it DOES block is when the firmware itself refuses the move
// (move.noMovesBeforeHoming, set via M564 H1) - DWC's own jog buttons already respect that flag,
// and these should too rather than sending a move RRF is just going to reject anyway.
const unhomedNow = computed(() => unhomedAxes(machineStore.model, [xAxisLetter.value, yAxisLetter.value, zAxisLetter.value]));
const noMovesBeforeHoming = computed(() => resolveOmPath(machineStore.model, "move.noMovesBeforeHoming") === true);
const blockedAxes = computed(() => {
	if (!noMovesBeforeHoming.value) {
		return new Set<string>();
	}
	return new Set(unhomedNow.value);
});
const zBlocked = computed(() => blockedAxes.value.has(zAxisLetter.value.toUpperCase()));

/** Whether `letter` is currently unhomed - independent of blockedAxes/noMovesBeforeHoming, since the
 *  home buttons should visibly flag an unhomed axis (like DWC's own Movement panel does) regardless
 *  of whether the firmware would also refuse a jog on it. Case-insensitive: unhomedAxes() preserves
 *  whatever case the configured axis letter uses, and RRF axis letters are legitimately lower-case
 *  sometimes (see quote() below). */
function isUnhomed(letter: string): boolean {
	return unhomedNow.value.some((a) => a.toUpperCase() === letter.toUpperCase());
}

// --- configuration with fallbacks -------------------------------------------------
const xySteps = computed(() => (props.widget.xySteps?.length ? props.widget.xySteps : [100, 10, 1, 0.1]));
const zStepList = computed(() => (props.widget.zSteps?.length ? props.widget.zSteps : [10, 1, 0.1]));
// Down (−Z) buttons render in reverse so the SMALLEST step sits nearest the home hub (mirrors the +Z
// column above). Carry the original index so right-click step editing still targets the right entry.
const zStepsDown = computed(() => zStepList.value.map((s, k) => ({ s, k })).reverse());
const xAxisLetter = computed(() => props.widget.xAxis || "X");
const yAxisLetter = computed(() => props.widget.yAxis || "Y");
const zAxisLetter = computed(() => props.widget.zAxis || "Z");
const zSign = computed(() => (props.widget.invertZ ? -1 : 1));
const sectorFill = computed(() => resolveColor(props.widget.color));
const zBtnStyle = computed(() => ({ color: sectorFill.value }));

const xFeed = computed({
	get: () => props.widget.xFeedrate ?? 3000,
	set: (v: number) => { props.widget.xFeedrate = Number(v) || 0; },
});
const yFeed = computed({
	get: () => props.widget.yFeedrate ?? 3000,
	set: (v: number) => { props.widget.yFeedrate = Number(v) || 0; },
});
const zFeed = computed({
	get: () => props.widget.zFeedrate ?? 600,
	set: (v: number) => { props.widget.zFeedrate = Number(v) || 0; },
});
/** Which feedrate applies to a cardinal sector's axis - X and Y are independently settable. */
function feedFor(axis: string): number {
	return axis.toUpperCase() === xAxisLetter.value.toUpperCase() ? xFeed.value : yFeed.value;
}

// Backfill arrays on older saved widgets so right-click edits have something to mutate.
onMounted(() => {
	if (!props.widget.xySteps) { props.widget.xySteps = [100, 10, 1, 0.1]; }
	if (!props.widget.zSteps) { props.widget.zSteps = [10, 1, 0.1]; }
});

// --- SVG geometry ------------------------------------------------------------------
const VB = 130;     // viewBox size (square); generous margin so tip labels don't clip
const C = 65;       // viewBox centre
const RMAX = 52;    // outer ring radius
const RHUB = 16;    // inner hole / home-hub radius
const HW = 33;      // half-width (deg) of each cardinal wedge -> ~24deg diagonal gaps

// Centre the 24x24 mdi-home glyph inside the hub circle.
const hubIconTransform = computed(() => {
	const s = (RHUB * 1.1) / 24;
	return `translate(${(C - 12 * s).toFixed(2)} ${(C - 12 * s).toFixed(2)}) scale(${s.toFixed(3)})`;
});

// Re-export wrappers so the rest of this component keeps the same polar(r,deg) / sectorPath(a0,a1,rIn,rOut) call shapes.
function polarLocal(r: number, deg: number): [number, number] {
	return polar(C, C, r, deg);
}
function f(n: number): string {
	return n.toFixed(2);
}
function sectorPath(a0: number, a1: number, rIn: number, rOut: number): string {
	return _sectorPath(C, C, a0, a1, rIn, rOut);
}
function fmt(v: number): string {
	return Number(Math.abs(v).toFixed(4)).toString();
}

interface Cardinal {
	key: string;
	angle: number;
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

const xySectors = computed(() => {
	const steps = xySteps.value;
	const n = steps.length;
	const bw = (RMAX - RHUB) / n;
	const out: Array<{ id: string; d: string; axis: string; signed: number; step: number; ringIndex: number; opacity: number }> = [];
	for (const card of cardinals.value) {
		const baseSign = (card.positive ? 1 : -1) * (card.invert() ? -1 : 1);
		for (let k = 0; k < n; k++) {
			const rOut = RMAX - k * bw;
			const rIn = RMAX - (k + 1) * bw;
			out.push({
				id: `${card.key}-${k}`,
				d: sectorPath(card.angle - HW, card.angle + HW, rIn, rOut),
				axis: card.axis(),
				signed: baseSign * steps[k],
				step: steps[k],
				ringIndex: k,
				// Gentler in light theme; inner rings a touch stronger. Hover lifts to full.
				opacity: 0.16 + 0.4 * (n > 1 ? k / (n - 1) : 0.5),
			});
		}
	}
	return out;
});

const stepLabels = computed(() => {
	const steps = xySteps.value;
	const n = steps.length;
	const bw = (RMAX - RHUB) / n;
	return steps.map((s, k) => {
		const [x, y] = polarLocal(RMAX - (k + 0.5) * bw, 45);
		return { id: `sl-${k}`, x: f(x), y: f(y), text: fmt(s) };
	});
});

const dirLabels = computed(() =>
	cardinals.value.map((card) => {
		const [x, y] = polarLocal(RMAX + 5, card.angle);
		const sign = (card.positive ? 1 : -1) * (card.invert() ? -1 : 1);
		return { id: `dl-${card.key}`, x: f(x), y: f(y), text: `${sign > 0 ? "+" : "-"}${card.axis()}` };
	}),
);

// --- actions -----------------------------------------------------------------------
function quote(letter: string): string {
	return /[a-z]/.test(letter) ? `'${letter}` : letter;
}
function jog(letter: string, signed: number, feed: number): void {
	if (disabledNow.value || !letter) {
		return;
	}
	if (blockedAxes.value.has(letter.toUpperCase())) {
		uiStore.makeNotification(LogLevel.warning, i18n.global.t("plugins.flexibleLayouts.jog.blockedUnhomed"),
			i18n.global.t("plugins.flexibleLayouts.jog.blockedUnhomedDetail", { axis: letter.toUpperCase() }));
		return;
	}
	const amount = Number(signed.toFixed(4));
	void machineStore.sendCode(`M120\nG91\nG1 ${quote(letter)}${amount} F${feed}\nM121`);
}
function homeAll(): void {
	if (!disabledNow.value) {
		void machineStore.sendCode("G28");
	}
}
function homeZ(): void {
	if (!disabledNow.value) {
		void machineStore.sendCode(`G28 ${quote(zAxisLetter.value)}`);
	}
}
function homeX(): void {
	if (!disabledNow.value) {
		void machineStore.sendCode(`G28 ${quote(xAxisLetter.value)}`);
	}
}
function homeY(): void {
	if (!disabledNow.value) {
		void machineStore.sendCode(`G28 ${quote(yAxisLetter.value)}`);
	}
}
function motorsOff(): void {
	if (!disabledNow.value) {
		void machineStore.sendCode("M18");
	}
}

// --- right-click step editing ------------------------------------------------------
// Uses DWC's shared numeric-input dialog (externalised since 3.7.0-alpha.5) instead of a bespoke
// in-widget dialog, so it matches the look/behaviour of the rest of the UI.
async function editStep(arr: "xy" | "z", index: number): Promise<void> {
	const current = arr === "xy" ? xySteps.value[index] : zStepList.value[index];
	const v = await getNumericInput(
		i18n.global.t("plugins.flexibleLayouts.jog.editStepTitle"),
		i18n.global.t("plugins.flexibleLayouts.jog.stepAmount"),
		current,
		0,
	);
	if (v !== null && !Number.isNaN(v) && v > 0) {
		// Reassign the whole array rather than mutating one index in place: this is what a saved
		// layout's persistence watcher reliably picks up (a plain `arr[index] = v` mutation of an
		// array already sitting on the reactive widget can be missed depending on how deep that
		// watcher tracks changes) - see the regression test pinning this. A right-click edit that
		// silently doesn't survive a reload is worse than the extra array copy.
		if (arr === "xy") {
			props.widget.xySteps = xySteps.value.map((s, i) => (i === index ? v : s));
		} else {
			props.widget.zSteps = zStepList.value.map((s, i) => (i === index ? v : s));
		}
	}
}
</script>

<style scoped>
.jog-root {
	min-height: 0;
}
.jog-title {
	font-size: 0.8em;
	font-weight: 600;
	line-height: 1.4;
	opacity: 0.85;
}
.jog-feed {
	display: flex;
	flex-direction: column;
	flex: 1 1 0;
	min-width: 0;
	gap: 1px;
}
.jog-feed-label {
	font-size: 0.55em;
	line-height: 1.2;
	opacity: 0.7;
	/* Was nowrap+ellipsis: fine at the small default size, but FlexGridItem's per-panel "label size"
	   setting (class ending in -label, see its own stylesheet) can raise this well past what the
	   column below was ever measured for, and the ellipsis silently hid however much no longer fit -
	   indistinguishable from the setting "not working" at a glance. Wrapping instead just grows the
	   row, which .jog-feed's flex-column parent already accommodates. */
	white-space: normal;
	word-break: break-word;
}
.jog-feed-input {
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
.jog-feed-input:focus {
	outline: none;
	border-color: rgb(var(--v-theme-primary));
}
.jog-frozen {
	opacity: 0.5;
	pointer-events: none;
}
.jog-body {
	min-height: 0;
}
.jog-xy {
	position: relative;
	flex: 1 1 auto;
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}
.jog-svg {
	width: 100%;
	height: 100%;
	max-height: 100%;
	display: block;
}
.jog-sector {
	cursor: pointer;
	stroke: rgb(var(--v-theme-surface));
	stroke-width: 0.8;
	transition: opacity 0.1s;
}
.jog-sector:hover {
	opacity: 1 !important;
}
.jog-sector-blocked {
	cursor: not-allowed;
	fill: rgb(var(--v-theme-warning)) !important;
}
.jog-step-label {
	/* em, not a fixed px: this text lives inside the SVG's own 130-unit viewBox, so its rendered size
	   is always relative to BOTH the inherited font-size AND however big the widget itself currently
	   is on screen - there's no way to pin it to an exact HTML CSS pixel size that matches the labels
	   outside the SVG. A fixed px value ignored the panel's font-size setting entirely (the actual
	   reported bug); em at least tracks it in the right direction. */
	font-size: 0.45em;
	fill: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	font-weight: 600;
}
.jog-dir-label {
	font-size: 0.48em;
	fill: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	opacity: 0.7;
}
.jog-hub {
	cursor: pointer;
}
.jog-hub-bg {
	fill: rgb(var(--v-theme-surface));
	stroke: currentColor;
	stroke-width: 1;
}
.jog-hub:hover .jog-hub-bg {
	fill: rgba(var(--v-theme-on-surface), 0.08);
}
.jog-hub-icon {
	fill: currentColor;
}
.jog-axis-home {
	position: absolute;
	top: 2px;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 2px;
	padding: 4px 7px;
	/* A larger hit target than the label alone needs - was 1px/4px padding at 0.6em, reported too
	   small to hit reliably. min-width/min-height set an actual floor rather than only relying on
	   padding, which shrinks along with the panel's font-size setting. */
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
.jog-axis-home:hover {
	background: currentColor;
}
.jog-axis-home:hover :deep(.v-icon),
.jog-axis-home:hover .jog-axis-letter {
	color: rgb(var(--v-theme-surface));
}
.jog-home-x { left: 2px; }
.jog-home-y { right: 2px; }
.jog-axis-letter {
	font-weight: 600;
}
/* Matches DWC's own Movement panel convention: an unhomed axis's home button turns the warning
   colour rather than staying in the widget's configured accent, so "this axis needs homing" reads at
   a glance instead of needing to check a separate banner. */
.jog-home-unhomed {
	color: rgb(var(--v-theme-warning)) !important;
	border-color: rgb(var(--v-theme-warning)) !important;
}
.jog-z {
	flex: 0 0 auto;
	width: clamp(38px, 22%, 64px);
	min-height: 0;
}
.jog-zbtn {
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
.jog-zval {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.jog-zbtn:hover {
	background: currentColor;
}
.jog-zbtn:hover span,
.jog-zbtn:hover :deep(.v-icon) {
	color: rgb(var(--v-theme-surface));
}
.jog-zhome {
	flex: 0 0 auto;
	padding: 4px 0;
}
.jog-zbtn-blocked {
	cursor: not-allowed;
	border-color: rgb(var(--v-theme-warning)) !important;
	color: rgb(var(--v-theme-warning)) !important;
}
</style>
