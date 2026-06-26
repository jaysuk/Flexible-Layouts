<template>
	<div class="jog-root fill-height d-flex flex-column pa-1" :class="{ 'jog-frozen': disabledNow }">
		<div v-if="widget.title" class="jog-title text-center text-truncate flex-shrink-0">{{ widget.title }}</div>

		<!-- Inline, editable feedrates (Pronterface shows XY / Z mm/min). Native inputs, self-styled, so
			 the value scales with the panel font and is never clipped by a fixed-height form control. -->
		<div v-if="widget.showFeedrate !== false" class="d-flex ga-2 mb-1 flex-shrink-0">
			<label class="jog-feed">
				<span class="jog-feed-label">{{ $t("plugins.flexibleLayouts.jog.xyFeed") }}</span>
				<input v-model.number="xyFeed" class="jog-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
			<label v-if="widget.showZ !== false" class="jog-feed">
				<span class="jog-feed-label">{{ $t("plugins.flexibleLayouts.jog.zFeed") }}</span>
				<input v-model.number="zFeed" class="jog-feed-input" type="number" min="1" inputmode="numeric" />
			</label>
		</div>

		<div class="d-flex flex-grow-1 ga-2 jog-body">
			<!-- XY concentric rings. The hub home-button is drawn INSIDE the SVG so it scales and
				 stays aligned with the click sectors at any aspect ratio. -->
			<div class="jog-xy">
				<svg :viewBox="`0 0 ${VB} ${VB}`" preserveAspectRatio="xMidYMid meet" class="jog-svg">
					<g :style="{ color: sectorFill }">
						<path v-for="s in xySectors" :key="s.id" :d="s.d" class="jog-sector"
							  :style="{ fill: 'currentColor', opacity: s.opacity }"
							  @click="jog(s.axis, s.signed, xyFeed)"
							  @contextmenu.prevent="editStep('xy', s.ringIndex)">
							<title>{{ s.axis }}{{ s.signed > 0 ? "+" : "" }}{{ fmt(s.signed) }} mm</title>
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
					<button type="button" class="jog-axis-home jog-home-x" :style="zBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${xAxisLetter}`" @click="homeX">
						<v-icon size="x-small">mdi-home</v-icon><span class="jog-axis-letter">{{ xAxisLetter }}</span>
					</button>
					<button type="button" class="jog-axis-home jog-home-y" :style="zBtnStyle" :disabled="disabledNow"
							:title="`${$t('plugins.flexibleLayouts.jog.home')} ${yAxisLetter}`" @click="homeY">
						<v-icon size="x-small">mdi-home</v-icon><span class="jog-axis-letter">{{ yAxisLetter }}</span>
					</button>
				</template>
			</div>

			<!-- Z bar -->
			<div v-if="widget.showZ !== false" class="jog-z d-flex flex-column ga-1">
				<button v-for="(s, k) in zStepList" :key="'zp' + k" type="button" class="jog-zbtn"
						:style="zBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} +${fmt(s)} mm`"
						@click="jog(zAxisLetter, zSign * s, zFeed)" @contextmenu.prevent="editStep('z', k)">
					<v-icon v-if="k === 0" size="x-small">mdi-chevron-up</v-icon>
					<span class="jog-zval">{{ fmt(s) }}</span>
				</button>
				<button v-if="widget.showHome !== false" type="button" class="jog-zbtn jog-zhome"
						:style="zBtnStyle" :disabled="disabledNow"
						:title="$t('plugins.flexibleLayouts.jog.homeZ')" @click="homeZ">
					<v-icon size="x-small">mdi-home</v-icon>
				</button>
				<button v-for="(z, i) in zStepsDown" :key="'zn' + z.k" type="button" class="jog-zbtn"
						:style="zBtnStyle" :disabled="disabledNow"
						:title="`${zAxisLetter} -${fmt(z.s)} mm`"
						@click="jog(zAxisLetter, -zSign * z.s, zFeed)" @contextmenu.prevent="editStep('z', z.k)">
					<span class="jog-zval">{{ fmt(z.s) }}</span>
					<v-icon v-if="i === zStepsDown.length - 1" size="x-small">mdi-chevron-down</v-icon>
				</button>
			</div>
		</div>

		<div v-if="widget.showMotorsOff" class="flex-shrink-0 mt-1">
			<v-btn size="small" variant="tonal" block prepend-icon="mdi-power" :disabled="disabledNow"
				   @click="motorsOff">{{ $t("plugins.flexibleLayouts.jog.motorsOff") }}</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";

import { getNumericInput } from "@/composables/useInputDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { polar, sectorPath as _sectorPath } from "../util/shapes";

const props = defineProps<{
	widget: Extract<Widget, { type: "jog" }>;
	disabled?: boolean;
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

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

const xyFeed = computed({
	get: () => props.widget.xyFeedrate ?? 3000,
	set: (v: number) => { props.widget.xyFeedrate = Number(v) || 0; },
});
const zFeed = computed({
	get: () => props.widget.zFeedrate ?? 600,
	set: (v: number) => { props.widget.zFeedrate = Number(v) || 0; },
});

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
		if (arr === "xy") {
			(props.widget.xySteps ??= [...xySteps.value])[index] = v;
		} else {
			(props.widget.zSteps ??= [...zStepList.value])[index] = v;
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
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
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
.jog-step-label {
	font-size: 6px;
	fill: rgb(var(--v-theme-on-surface));
	pointer-events: none;
	font-weight: 600;
}
.jog-dir-label {
	font-size: 6.5px;
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
.jog-z {
	flex: 0 0 auto;
	width: clamp(38px, 22%, 64px);
	min-height: 0;
}
.jog-zbtn {
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
</style>
