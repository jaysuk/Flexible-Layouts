/**
 * Background chart data collection.
 *
 * BtnCmd's charts only recorded data while their page was on screen, so a chart you hadn't visited
 * showed nothing. Here a single app-lifetime sampler walks the active layout for every chart's series
 * and samples them on a timer regardless of which page is currently shown — so when you open a chart
 * page the history is already there. Started/stopped by the shell (see FlexShell).
 *
 * Buffers are keyed by object-model path and trimmed to the largest window any chart needs for that
 * path; each ChartWidget slices the shared buffer down to its own window for display.
 */
import { ref } from "vue";

import { useMachineStore } from "@/stores/machine";

import { forEachWidget } from "./document";
import { useLayoutStore } from "./store";
import { resolveOmPath } from "../util/omPath";

export interface ChartSample { t: number; v: number }

const buffers = new Map<string, Array<ChartSample>>();
/** Bumped on every sample so widget computeds re-run. */
export const chartVersion = ref(0);

let timer: ReturnType<typeof setInterval> | null = null;
let currentInterval = 0;

/** Samples for one path, sliced to the requested display window (oldest first). */
export function getChartSamples(omPath: string, windowMs: number): Array<ChartSample> {
	const buf = buffers.get(omPath);
	if (!buf || !buf.length) {
		return [];
	}
	const cutoff = Date.now() - windowMs;
	let i = 0;
	while (i < buf.length && buf[i].t < cutoff) {
		i++;
	}
	return i ? buf.slice(i) : buf.slice();
}

/** Walk the active layout: which OM paths to sample (→ largest window) and the fastest interval. */
function collect(): { paths: Map<string, number>; interval: number } {
	const paths = new Map<string, number>();
	let interval = 1000;
	forEachWidget(useLayoutStore().document.value, (w) => {
		if (w.type !== "chart") {
			return;
		}
		const winMs = Math.max(5000, (w.windowSeconds ?? 120) * 1000);
		for (const s of w.series ?? []) {
			if (s.omPath) {
				paths.set(s.omPath, Math.max(paths.get(s.omPath) ?? 0, winMs));
			}
		}
		interval = Math.min(interval, w.intervalMs ?? 1000);
	});
	return { paths, interval: Math.max(250, Math.min(5000, interval)) };
}

function tick(): void {
	const { paths, interval } = collect();
	const machineStore = useMachineStore();

	if (machineStore.isConnected) {
		const now = Date.now();
		// Forget paths no chart references any more.
		for (const key of [...buffers.keys()]) {
			if (!paths.has(key)) {
				buffers.delete(key);
			}
		}
		for (const [path, winMs] of paths) {
			let buf = buffers.get(path);
			if (!buf) {
				buf = [];
				buffers.set(path, buf);
			}
			const raw = resolveOmPath(machineStore.model, path);
			const num = typeof raw === "number" ? raw : Number(raw);
			if (Number.isFinite(num)) {
				buf.push({ t: now, v: num });
			}
			const cutoff = now - winMs;
			while (buf.length && buf[0].t < cutoff) {
				buf.shift();
			}
		}
		chartVersion.value++;
	}

	// Re-tune the cadence to the fastest chart currently configured.
	if (interval !== currentInterval && timer) {
		clearInterval(timer);
		currentInterval = interval;
		timer = setInterval(tick, interval);
	}
}

/** Start sampling (idempotent). Called by the shell when the custom layout is active. */
export function startChartSampler(): void {
	if (timer) {
		return;
	}
	currentInterval = collect().interval;
	tick();
	timer = setInterval(tick, currentInterval);
}

/** Stop sampling and drop buffered history. */
export function stopChartSampler(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	currentInterval = 0;
	buffers.clear();
}
