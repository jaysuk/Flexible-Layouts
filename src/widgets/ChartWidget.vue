<template>
	<div class="fill-height d-flex flex-column pa-2 flex-chart-root">
		<div class="d-flex align-center mb-1">
			<span v-if="widget.title" class="text-truncate" style="font-size: 0.95em; font-weight: 500;">
				{{ widget.title }}
			</span>
			<v-spacer />
			<v-btn icon="mdi-download" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.widgets.chartDownload')" @click="downloadCsv" />
		</div>

		<div v-if="widget.series.length === 0"
			 class="flex-grow-1 d-flex align-center justify-center text-medium-emphasis">
			<div class="text-center"><v-icon>mdi-chart-line</v-icon>
				<div style="font-size: 0.8em">{{ $t("plugins.flexibleLayouts.widgets.chartUnset") }}</div></div>
		</div>

		<template v-else>
			<div class="flex-grow-1 d-flex" style="min-height: 0;">
				<div v-if="widget.yLabel" class="y-axis-title">{{ widget.yLabel }}</div>
				<div class="y-axis-values">
					<span v-for="(t, i) in yTicks" :key="i">{{ t }}</span>
				</div>
				<svg class="flex-grow-1 flex-chart-svg" viewBox="0 0 1000 300" preserveAspectRatio="none">
					<line v-for="(f, i) in gridFracs" :key="i" x1="0" :y1="f * 300" x2="1000" :y2="f * 300" class="grid" />
					<polyline v-for="(line, i) in lines" :key="i" :points="line.points" fill="none"
							  :style="{ stroke: line.stroke }" stroke-width="2" vector-effect="non-scaling-stroke" />
				</svg>
			</div>

			<!-- X-axis time labels (oldest on the left, now on the right). -->
			<div class="x-axis-values">
				<span v-for="(t, i) in xTicks" :key="i">{{ t }}</span>
			</div>
			<div v-if="widget.xLabel" class="x-axis-title">{{ widget.xLabel }}</div>

			<div class="d-flex flex-wrap ga-2 mt-1">
				<div v-for="(s, i) in widget.series" :key="i" class="d-flex align-center" style="font-size: 0.78em">
					<span class="legend-dot me-1" :style="{ background: strokeFor(s.color) }" />
					{{ s.label || s.omPath }}: <span class="font-weight-medium ms-1">{{ latest[i] }}</span>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";
import { type ChartSample, chartVersion, getChartSamples } from "../model/chartSampler";
import { resolveColor } from "../util/color";

const props = defineProps<{ widget: Extract<Widget, { type: "chart" }> }>();

const windowMs = computed(() => Math.max(5000, (props.widget.windowSeconds ?? 120) * 1000));

// Data is collected by the app-lifetime background sampler (model/chartSampler), not here, so a chart
// shows history even on a page that hasn't been opened yet. `version` is the shared sample counter; a
// per-series read pulls that series' buffer sliced to this chart's window.
const version = chartVersion;
function bufferFor(omPath: string): Array<ChartSample> {
	void version.value;
	return getChartSamples(omPath, windowMs.value);
}
// One buffer per series, in series order (recomputed whenever a new sample lands).
const seriesBuffers = computed<Array<Array<ChartSample>>>(() => {
	void version.value;
	return props.widget.series.map((s) => bufferFor(s.omPath));
});

function strokeFor(color?: string): string {
	return resolveColor(color);
}

// Y-bounds: explicit min/max win; otherwise auto-scale from the data with padding.
const bounds = computed(() => {
	void version.value;
	const wMin = props.widget.min;
	const wMax = props.widget.max;
	if (wMin !== undefined && wMax !== undefined) {
		return { min: wMin, max: wMax };
	}
	let min = wMin ?? Infinity;
	let max = wMax ?? -Infinity;
	for (const buf of seriesBuffers.value) {
		for (const s of buf) {
			if (s.v < min) min = s.v;
			if (s.v > max) max = s.v;
		}
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) {
		return { min: 0, max: 1 };
	}
	if (min === max) {
		return { min: min - 1, max: max + 1 };
	}
	const pad = (max - min) * 0.1;
	return { min: wMin ?? min - pad, max: wMax ?? max + pad };
});

// Y-axis: a handful of evenly-spaced value gradations (top = max, bottom = min). The labels are
// stacked with space-between so they line up with the matching gridlines.
const Y_TICKS = 5;
function formatTick(v: number): string {
	if (!Number.isFinite(v)) {
		return "";
	}
	return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
}
const yTicks = computed(() => {
	const { min, max } = bounds.value;
	const out: Array<string> = [];
	for (let i = 0; i < Y_TICKS; i++) {
		const frac = i / (Y_TICKS - 1);
		out.push(formatTick(max - (max - min) * frac));
	}
	return out;
});
const gridFracs = computed(() => yTicks.value.map((_, i) => i / (yTicks.value.length - 1)));

// X-axis: time labels across the visible window (HH:MM:SS), oldest -> now.
const X_TICKS = 4;
function formatTime(t: number): string {
	return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
const xTicks = computed(() => {
	void version.value;
	const now = Date.now();
	const tStart = now - windowMs.value;
	const out: Array<string> = [];
	for (let i = 0; i < X_TICKS; i++) {
		out.push(formatTime(tStart + (i / (X_TICKS - 1)) * windowMs.value));
	}
	return out;
});

const lines = computed(() => {
	void version.value;
	const now = Date.now();
	const tStart = now - windowMs.value;
	const { min, max } = bounds.value;
	const range = max - min || 1;
	return props.widget.series.map((s, i) => {
		const buf = seriesBuffers.value[i] ?? [];
		const points = buf
			.map((p) => {
				const x = ((p.t - tStart) / windowMs.value) * 1000;
				const y = 300 - ((p.v - min) / range) * 300;
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(" ");
		return { points, stroke: strokeFor(s.color) };
	});
});

const latest = computed(() => {
	void version.value;
	return props.widget.series.map((_, i) => {
		const buf = seriesBuffers.value[i] ?? [];
		const last = buf[buf.length - 1];
		return last ? last.v.toFixed(1) : "—";
	});
});

// CSV export of everything currently buffered (BtnCmd-style). Merges all series on a shared,
// sorted timeline; a blank cell means that series had no sample at that timestamp.
function downloadCsv() {
	const series = props.widget.series;
	const maps = seriesBuffers.value.map((buf) => new Map(buf.map((s) => [s.t, s.v])));
	const times = [...new Set(seriesBuffers.value.flat().map((s) => s.t))].sort((a, b) => a - b);

	const header = ["time", ...series.map((s, i) => s.label || s.omPath || `series${i}`)];
	const rows = times.map((t) => {
		const cells = maps.map((m) => (m.has(t) ? String(m.get(t)) : ""));
		return [new Date(t).toISOString(), ...cells].join(",");
	});
	const csv = [header.join(","), ...rows].join("\n");

	const name = (props.widget.title || "chart").replace(/[^a-zA-Z0-9 ._-]/g, "_").trim() || "chart";
	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${name}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}
</script>

<style scoped>
.flex-chart-svg {
	width: 100%;
	min-height: 0;
	background: rgba(var(--v-theme-on-surface), 0.03);
	border-radius: 4px;
}
.grid {
	stroke: rgba(var(--v-theme-on-surface), 0.12);
	stroke-width: 1;
	vector-effect: non-scaling-stroke;
}
.legend-dot {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;
}
.y-axis-title {
	writing-mode: vertical-rl;
	transform: rotate(180deg);
	font-size: 0.72em;
	color: rgba(var(--v-theme-on-surface), 0.7);
	text-align: center;
}
.y-axis-values {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	font-size: 0.68em;
	line-height: 1;
	color: rgba(var(--v-theme-on-surface), 0.7);
	padding-right: 4px;
	min-width: 34px;
	text-align: right;
}
.x-axis-values {
	display: flex;
	justify-content: space-between;
	font-size: 0.65em;
	color: rgba(var(--v-theme-on-surface), 0.7);
	margin-top: 2px;
	/* Align the time labels with the plot area, not the y-axis column. */
	padding-left: 34px;
}
.x-axis-title {
	font-size: 0.72em;
	color: rgba(var(--v-theme-on-surface), 0.7);
	text-align: center;
	margin-top: 2px;
}
</style>
