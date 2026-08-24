<template>
	<!-- Shaped button: render as inline SVG for non-rect shapes so clicks outside the shape
		 pass through to widgets beneath (for nestling / overlapping layouts). -->
	<div v-if="isShapedMode" class="fill-height cmd-shaped-outer" :style="outerStyle" @click="onShapeClick">
		<svg class="cmd-shape-svg" :viewBox="`0 0 ${SVG_W} ${SVG_H}`" :preserveAspectRatio="preserveAspect"
			 :style="svgPointerStyle">
			<!-- Shape fill + stroke -->
			<path :d="shapedPathD" :fill="shapeColor" :fill-opacity="widget.fillOpacity ?? 1"
				  :stroke="widget.stroke?.color ?? 'none'"
				  :stroke-width="widget.stroke?.width ?? 0"
				  :stroke-dasharray="widget.stroke?.dash ?? undefined"
				  class="cmd-shape-path" />
		</svg>
		<!-- Label/icon rendered as a plain HTML sibling, deliberately OUTSIDE the <svg> - a shape using
			 preserveAspectRatio="none" (rect/pill/squircle/ellipse/chevron/arrow/diamond/trapezoid) needs
			 its PATH stretched non-uniformly to fill a non-square cell, but a <foreignObject> here used to
			 sit inside that same transform, so the label/icon HTML was stretched right along with it -
			 visibly distorted text on exactly those 7 shapes. Positioned by the same `contentStyle`
			 percentages (anchored at the shape's centroid, not just the box centre, so a wedge's label
			 lands inside the wedge), but CSS percentages here resolve against the outer container's real
			 box, not the SVG's internal coordinate space, so nothing stretches. Deliberately NOT clipped to
			 the shape: clipping mis-placed text was exactly what garbled wedge labels before. -->
		<div class="cmd-shape-content d-flex align-center justify-center ga-1" :class="iconLayoutClass"
			 :style="contentStyle">
			<v-icon v-if="widget.icon" :size="iconSize" :color="labelColor">{{ widget.icon }}</v-icon>
			<span v-if="widget.label" class="text-truncate" :style="{ color: labelColor }">{{ widget.label }}</span>
		</div>

		<v-dialog v-model="confirmOpen" max-width="400">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.widgets.confirmTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">{{ $t("plugins.flexibleLayouts.widgets.confirmText") }}</div>
					<pre class="text-body-2 bg-surface-variant rounded pa-2">{{ widget.code }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn :color="widget.color || 'primary'" @click="confirmSend">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>

	<!-- Standard rect button (existing behaviour, unchanged) -->
	<div v-else class="fill-height pa-1">
		<v-btn :color="overrideColor || widget.color || 'primary'" variant="flat" block
			   class="fill-height text-none flex-cmd-btn"
			   :disabled="uiStore.uiFrozen || disabled" :loading="busy" @click="onClick">
			<div class="d-flex align-center justify-center ga-1" :class="iconLayoutClass">
				<v-icon v-if="widget.icon" :size="iconSize">{{ widget.icon }}</v-icon>
				<span v-if="widget.label" class="text-truncate flex-cmd-label">{{ widget.label }}</span>
			</div>
		</v-btn>

		<v-dialog v-model="confirmOpen" max-width="400">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.widgets.confirmTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">{{ $t("plugins.flexibleLayouts.widgets.confirmText") }}</div>
					<pre class="text-body-2 bg-surface-variant rounded pa-2">{{ widget.code }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn :color="widget.color || 'primary'" @click="confirmSend">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { buttonShapeToParams, shapePath, shapePreservesAspect } from "../util/shapes";

const props = defineProps<{
	widget: Extract<Widget, { type: "codeButton" }>;
	overrideColor?: string;
	disabled?: boolean;
}>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

// ---- Icon helpers (shared between shaped and rect paths) ---------------------

const iconSize = computed(() => (props.widget.iconSize && props.widget.iconSize > 0
	? `${props.widget.iconSize}px`
	: "1.5em"));

const iconLayoutClass = computed(() => {
	switch (props.widget.iconPosition) {
		case "left":   return "flex-row";
		case "right":  return "flex-row-reverse";
		case "bottom": return "flex-column-reverse";
		default:       return "flex-column";
	}
});

// ---- Shape mode detection ---------------------------------------------------

const isShapedMode = computed(() => {
	const s = props.widget.shape;
	return !!s && s.kind !== "rect";
});

// ---- SVG viewBox (fixed logical size; scales with CSS) ----------------------
const SVG_W = 100;
const SVG_H = 100;

// Proportional shapes (round/regular) must keep their aspect ratio or they distort into ellipses /
// skewed polygons; box-filling shapes (rect, pill, ellipse, directional) are meant to fill the cell.
const preserveAspect = computed(() => {
	const k = props.widget.shape?.kind;
	return k && shapePreservesAspect(k) ? "xMidYMid meet" : "none";
});

// Where to place the label/icon, in viewBox percent. Most shapes are centred on the box; a wedge's
// box centre is empty, so anchor on its centroid (mid-radius along the bisector). Polar convention
// matches shapes.ts: x = cx + r·sin(θ), y = cy − r·cos(θ), θ clockwise from up.
const anchor = computed<{ x: number; y: number }>(() => {
	const s = props.widget.shape;
	if (s?.kind === "wedge") {
		const midA = ((s.startAngle ?? 0) + (s.sweepAngle ?? 90) / 2) * Math.PI / 180;
		const midR = (((s.innerRadius ?? 0.3) + (s.outerRadius ?? 1.0)) / 2) * 50; // radii are fractions of the half-box (50)
		return { x: 50 + midR * Math.sin(midA), y: 50 - midR * Math.cos(midA) };
	}
	return { x: 50, y: 50 };
});
const contentStyle = computed<Record<string, string>>(() => ({
	position: "absolute",
	left: `${anchor.value.x}%`,
	top: `${anchor.value.y}%`,
	transform: "translate(-50%, -50%)",
	maxWidth: "100%",
}));

const shapedPathD = computed(() => {
	const s = props.widget.shape;
	if (!s) { return ""; }
	return shapePath(buttonShapeToParams(s), { w: SVG_W, h: SVG_H });
});

/** Resolve the fill colour for the shape. */
const shapeColor = computed(() => resolveColor(props.overrideColor || props.widget.color || "primary"));

/** Label/icon colour: pick black or white for legibility against the fill. Vuetify theme tokens
 *  resolve to `rgb(var(--v-theme-…))` which we can't read at build time → default white (matches the
 *  flat-button convention); explicit hex/rgb fills get a luminance-based choice so light custom
 *  colours don't end up with invisible white text. */
function readableText(css: string): string {
	const hex = /^#?([0-9a-fA-F]{6})$/.exec(css.trim());
	const rgb = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(css);
	let r: number, g: number, b: number;
	if (hex) {
		r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16);
	} else if (rgb) {
		r = +rgb[1]; g = +rgb[2]; b = +rgb[3];
	} else {
		return "white"; // unparseable (e.g. a Vuetify theme token) → default
	}
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "black" : "white";
}
const labelColor = computed(() => readableText(shapeColor.value));

const outerStyle = computed(() => {
	const style: Record<string, string> = {};
	if (props.widget.rotation) {
		style.transform = `rotate(${props.widget.rotation}deg)`;
	}
	if (props.widget.z != null) {
		style.zIndex = String(props.widget.z);
	}
	return style;
});

/** SVG gets pointer-events:none on most of its area; the path itself has pointer-events:fill. */
const svgPointerStyle = computed(() => ({
	cursor: (uiStore.uiFrozen || props.disabled) ? "not-allowed" : "pointer",
	opacity: (uiStore.uiFrozen || props.disabled) ? "0.5" : "1",
}));

// ---- Confirm dialog ---------------------------------------------------------
const busy = ref(false);
const confirmOpen = ref(false);

let lastFire = 0;
function debounced(): boolean {
	const ms = props.widget.debounceMs ?? 0;
	if (ms <= 0) { return false; }
	const now = Date.now();
	if (now - lastFire < ms) { return true; }
	lastFire = now;
	return false;
}

async function send() {
	const action = props.widget.action ?? "gcode";
	busy.value = true;
	try {
		if (action === "url") {
			if (props.widget.url) {
				window.open(props.widget.url, "_blank", "noopener");
			}
		} else if (action === "http") {
			if (props.widget.url) {
				const res = await fetch(props.widget.url, { method: "GET", mode: "cors" });
				if (res.ok) {
					uiStore.log(LogLevel.success, i18n.global.t("plugins.flexibleLayouts.widgets.httpOk", { status: res.status }));
				} else {
					uiStore.log(LogLevel.warning, i18n.global.t("plugins.flexibleLayouts.widgets.httpFail", { status: res.status }));
				}
			}
		} else {
			await machineStore.sendCode(props.widget.code, false, false);
		}
	} catch (e) {
		uiStore.log(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.widgets.actionError", { error: (e as Error).message }));
	} finally {
		busy.value = false;
	}
}

function onClick() {
	if (debounced()) { return; }
	if (props.widget.confirm) {
		confirmOpen.value = true;
	} else {
		void send();
	}
}

function confirmSend() {
	confirmOpen.value = false;
	void send();
}

/** Click handler for shaped SVG mode — guard disabled + debounce. */
function onShapeClick() {
	if (uiStore.uiFrozen || props.disabled) { return; }
	onClick();
}
</script>

<style scoped>
.flex-cmd-btn {
	min-height: 100%;
	white-space: normal;
	/* Inherit the panel's typography font-size (Vuetify buttons otherwise pin their own), so both the
	   label and the em-sized icon scale with the per-panel typography setting. */
	font-size: inherit;
}
/* Allow the label to ellipsis inside a flex row (icon-left/right layouts). */
.flex-cmd-label {
	min-width: 0;
}

/* Shaped button outer wrapper: fills the cell, clips nothing (shape does the clipping). */
.cmd-shaped-outer {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
}
.cmd-shape-svg {
	width: 100%;
	height: 100%;
	display: block;
	/* Pointer events only on the filled shape path, not the bounding-box background. */
	pointer-events: none;
}
/* The shape path itself captures clicks */
.cmd-shape-path {
	pointer-events: fill;
	cursor: pointer;
	transition: filter 0.12s;
}
.cmd-shape-path:hover {
	filter: brightness(1.12);
}
/* Clicks on the label/icon itself must still fall through to the shape path beneath (which alone
   re-enables pointer-events via .cmd-shape-path) - otherwise a click that lands on the text inside
   a wedge, where the box's empty corners are meant to pass clicks through to a widget underneath,
   would fire the button even in the empty-corner case for shapes where the label sits near an edge. */
.cmd-shape-content {
	pointer-events: none;
}
</style>
