import { onBeforeUnmount, watch } from "vue";

import { hapticTap, isCueName, playCue } from "../util/sound";

/** One cue that should currently be sounding (or repeating) for a widget. */
export interface ActiveCue {
	/** Identity of this activation - a new key is a new event, an unchanged one is the same continuing condition. */
	key: string;
	cue: string;
	/** Repeat every N seconds while still active. Unset/0 = play once. */
	repeatSeconds?: number;
	/** Also vibrate. */
	haptic?: boolean;
}

/** A repeat is clamped to this range, and stops after MAX_REPEATS, so a stuck condition can't nag forever. */
export const MIN_REPEAT_SECONDS = 5;
export const MAX_REPEAT_SECONDS = 3600;
export const MAX_REPEATS = 20;

/**
 * Play a widget's cue when its condition BECOMES true (MISSING-FEATURES-PLAN §B1) - a rising edge, never a level.
 *
 * - A condition that is already true when the widget appears (a page load, navigating back to the page, leaving edit
 *   mode) is the baseline, not an event: it makes no sound at once. If it repeats, the first repeat comes after the
 *   interval.
 * - `enabled()` false (edit mode) silences everything and re-baselines, so editing a rule never sounds a cue.
 * - The cue plays through `playCue`, so the device's mute and volume apply; this never sends a command.
 */
export function useCueOnRise(active: () => Array<ActiveCue>, enabled: () => boolean = () => true): void {
	const timers = new Map<string, ReturnType<typeof setInterval>>();
	let known = new Set<string>();
	let baselined = false;

	function play(c: ActiveCue): void {
		if (isCueName(c.cue)) { playCue(c.cue); }
		if (c.haptic) { hapticTap(); }
	}
	function startRepeat(c: ActiveCue): void {
		const secs = c.repeatSeconds ?? 0;
		if (!(secs > 0) || timers.has(c.key)) { return; }
		const ms = Math.min(MAX_REPEAT_SECONDS, Math.max(MIN_REPEAT_SECONDS, secs)) * 1000;
		let count = 0;
		const id = setInterval(() => {
			count += 1;
			play(c);
			if (count >= MAX_REPEATS) { stop(c.key); }
		}, ms);
		timers.set(c.key, id);
	}
	function stop(key: string): void {
		const id = timers.get(key);
		if (id !== undefined) { clearInterval(id); timers.delete(key); }
	}
	function stopAll(): void {
		for (const key of [...timers.keys()]) { stop(key); }
	}

	const stopWatch = watch(
		() => [enabled(), JSON.stringify(active())] as const,
		([on, json]) => {
			if (!on) {
				stopAll();
				known = new Set();
				baselined = false;
				return;
			}
			const list = JSON.parse(json) as Array<ActiveCue>;
			const keys = new Set(list.map((c) => c.key));
			for (const key of [...known]) {
				if (!keys.has(key)) { stop(key); }
			}
			for (const c of list) {
				if (!known.has(c.key)) {
					if (baselined) { play(c); } // a genuine rising edge
					startRepeat(c);
				}
			}
			known = keys;
			baselined = true;
		},
		{ immediate: true },
	);

	onBeforeUnmount(() => {
		stopWatch();
		stopAll();
	});
}
