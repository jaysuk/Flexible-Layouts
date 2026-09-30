/**
 * Audio and haptic cues (MISSING-FEATURES-PLAN §B1): the engine and the per-device settings.
 *
 * Sounds are synthesised from oscillators - no audio files to bundle or fetch - through ONE lazily created, shared
 * `AudioContext` (DWC's own M300 beep makes a new one per beep, and is not part of the plugin API). Browsers keep an
 * `AudioContext` suspended until the page has had a user gesture, so the first press/keystroke resumes it
 * (`installAudioUnlock`); until then `audioUnlocked` is false and the settings page says "click anywhere once".
 *
 * Everything here is PER DEVICE (localStorage, try/catch): a workshop tablet can be silent, or a phone can buzz,
 * without touching the shared layout or anyone else's browser. Nothing here ever sends a command to the machine.
 */
import { ref } from "vue";

import { CUE_NAMES, isCueName, type CueName } from "./cueNames";

export { CUE_NAMES, isCueName };
export type { CueName };

interface CueStep {
	freq: number;
	ms: number;
	type?: OscillatorType;
	/** Silence after this step. */
	gapMs?: number;
}

/** Each cue: a short list of tones. Kept brief and modest - these are notifications, not sirens. */
export const CUES: Readonly<Record<CueName, ReadonlyArray<CueStep>>> = {
	chime: [{ freq: 880, ms: 120, gapMs: 30 }, { freq: 1318, ms: 240 }],
	double: [{ freq: 988, ms: 90, gapMs: 80 }, { freq: 988, ms: 90 }],
	alarm: [{ freq: 880, ms: 160 }, { freq: 660, ms: 160 }, { freq: 880, ms: 160 }, { freq: 660, ms: 160 }],
	error: [{ freq: 220, ms: 280, type: "sawtooth", gapMs: 40 }, { freq: 165, ms: 420, type: "sawtooth" }],
};

// #region settings
export const SOUND_EVENT_NAMES = ["jobFinished", "jobStopped", "pauseRequested", "filamentError", "heaterFault", "messageBox"] as const;
export type SoundEventName = (typeof SOUND_EVENT_NAMES)[number];

export interface EventCueSetting {
	/** Play the cue when this event happens. Off by default: sound from a machine nobody expects to make noise is a bad surprise. */
	on: boolean;
	cue: CueName;
	/** Also vibrate (where the device can). */
	haptic: boolean;
}

export interface SoundSettings {
	/** Master mute for everything audible on this device. */
	muted: boolean;
	/** 0 - 1. */
	volume: number;
	/** Master switch for vibration on this device. */
	haptics: boolean;
	events: Record<SoundEventName, EventCueSetting>;
}

const STORAGE_KEY = "flexibleLayouts.sound";

export function defaultSoundSettings(): SoundSettings {
	return {
		muted: false,
		volume: 0.6,
		haptics: true,
		events: {
			jobFinished: { on: false, cue: "chime", haptic: false },
			jobStopped: { on: false, cue: "error", haptic: false },
			pauseRequested: { on: false, cue: "double", haptic: false },
			filamentError: { on: false, cue: "alarm", haptic: false },
			heaterFault: { on: false, cue: "alarm", haptic: false },
			messageBox: { on: false, cue: "double", haptic: false },
		},
	};
}

/** Merge whatever is stored over the defaults, dropping anything malformed - a stale or hand-edited value must not throw. */
export function normalizeSoundSettings(raw: unknown): SoundSettings {
	const out = defaultSoundSettings();
	if (!raw || typeof raw !== "object") { return out; }
	const r = raw as Partial<SoundSettings>;
	if (typeof r.muted === "boolean") { out.muted = r.muted; }
	if (typeof r.haptics === "boolean") { out.haptics = r.haptics; }
	if (typeof r.volume === "number" && Number.isFinite(r.volume)) { out.volume = Math.min(1, Math.max(0, r.volume)); }
	if (r.events && typeof r.events === "object") {
		for (const name of SOUND_EVENT_NAMES) {
			const e = (r.events as Record<string, Partial<EventCueSetting> | undefined>)[name];
			if (!e || typeof e !== "object") { continue; }
			if (typeof e.on === "boolean") { out.events[name].on = e.on; }
			if (isCueName(e.cue)) { out.events[name].cue = e.cue; }
			if (typeof e.haptic === "boolean") { out.events[name].haptic = e.haptic; }
		}
	}
	return out;
}

function load(): SoundSettings {
	try {
		const text = localStorage.getItem(STORAGE_KEY);
		return normalizeSoundSettings(text ? JSON.parse(text) : null);
	} catch {
		return defaultSoundSettings();
	}
}

export const soundSettings = ref<SoundSettings>(load());

function save(): void {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(soundSettings.value)); } catch { /* storage blocked */ }
}

/** Change settings (and remember them on this device). */
export function updateSoundSettings(patch: Partial<Omit<SoundSettings, "events">> & { events?: Partial<Record<SoundEventName, Partial<EventCueSetting>>> }): void {
	const next = normalizeSoundSettings({
		...soundSettings.value,
		...patch,
		events: Object.fromEntries(SOUND_EVENT_NAMES.map((n) => [n, { ...soundSettings.value.events[n], ...(patch.events?.[n] ?? {}) }])),
	});
	soundSettings.value = next;
	save();
}
// #endregion

// #region audio
type AudioContextCtor = new () => AudioContext;

function contextCtor(): AudioContextCtor | undefined {
	if (typeof window === "undefined") { return undefined; }
	const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
	return w.AudioContext ?? w.webkitAudioContext;
}

export function audioSupported(): boolean {
	return contextCtor() !== undefined;
}

/** True once an `AudioContext` is running - i.e. the browser has let us make sound. */
export const audioUnlocked = ref(false);

let ctx: AudioContext | null = null;
let unlockInstalled = false;

function getContext(): AudioContext | null {
	if (ctx) { return ctx; }
	const Ctor = contextCtor();
	if (!Ctor) { return null; }
	try {
		ctx = new Ctor();
	} catch {
		return null;
	}
	ctx.addEventListener?.("statechange", () => { audioUnlocked.value = ctx?.state === "running"; });
	audioUnlocked.value = ctx.state === "running";
	return ctx;
}

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;

/** Resume audio on the first user gesture (browsers refuse before that). Idempotent; returns the uninstaller. */
export function installAudioUnlock(): () => void {
	if (typeof window === "undefined" || unlockInstalled) { return removeAudioUnlock; }
	unlockInstalled = true;
	for (const type of UNLOCK_EVENTS) { window.addEventListener(type, onGesture, { capture: true }); }
	return removeAudioUnlock;
}
function onGesture(): void {
	const c = getContext();
	if (c && c.state === "suspended") {
		void c.resume().then(() => { audioUnlocked.value = c.state === "running"; }, () => { /* still blocked */ });
	} else if (c) {
		audioUnlocked.value = c.state === "running";
	}
	removeAudioUnlock();
}
function removeAudioUnlock(): void {
	if (typeof window === "undefined") { return; }
	for (const type of UNLOCK_EVENTS) { window.removeEventListener(type, onGesture, { capture: true } as EventListenerOptions); }
	unlockInstalled = false;
}

/**
 * Play a named cue at the device's volume. Returns whether anything was scheduled: false when muted, when the browser
 * has no audio, or when the browser is still blocking audio (no gesture yet). Never throws.
 * `force` plays even when muted - for the settings page's Test button, so a muted device can still be checked.
 */
export function playCue(name: CueName, opts: { force?: boolean; volume?: number } = {}): boolean {
	const s = soundSettings.value;
	if (s.muted && !opts.force) { return false; }
	const c = getContext();
	if (!c) { return false; }
	if (c.state === "suspended") {
		void c.resume().catch(() => { /* needs a gesture */ });
		if (c.state === "suspended") { return false; }
	}
	const level = Math.min(1, Math.max(0, opts.volume ?? s.volume)) * 0.4; // 0.4 = comfortable ceiling for a raw oscillator
	if (level <= 0) { return false; }
	try {
		let t = c.currentTime + 0.01;
		for (const step of CUES[name]) {
			const osc = c.createOscillator();
			const gain = c.createGain();
			osc.type = step.type ?? "sine";
			osc.frequency.value = step.freq;
			// A short attack/release so tones don't click.
			const dur = step.ms / 1000;
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(level, t + 0.01);
			gain.gain.setValueAtTime(level, Math.max(t + 0.01, t + dur - 0.03));
			gain.gain.linearRampToValueAtTime(0, t + dur);
			osc.connect(gain);
			gain.connect(c.destination);
			osc.start(t);
			osc.stop(t + dur + 0.02);
			t += dur + (step.gapMs ?? 0) / 1000;
		}
		return true;
	} catch {
		return false;
	}
}

/** Test seam: drop the shared context and gesture hook. */
export function resetAudioForTests(): void {
	removeAudioUnlock();
	ctx = null;
	audioUnlocked.value = false;
	soundSettings.value = load();
}
// #endregion

// #region haptics
export function hapticsSupported(): boolean {
	return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Vibrate with a pattern (ms), if this device can and haptics are on for it. Returns whether it was asked to. */
export function vibrate(pattern: number | Array<number>): boolean {
	if (!hapticsSupported() || !soundSettings.value.haptics) { return false; }
	try { return navigator.vibrate(pattern); } catch { return false; }
}

/** A brief tick for a button press. */
export function hapticTap(): boolean {
	return vibrate(15);
}

/** Vibration patterns for the global events (on, off, on, ...). */
export const EVENT_HAPTICS: Readonly<Record<SoundEventName, Array<number>>> = {
	jobFinished: [80, 60, 80],
	jobStopped: [250],
	pauseRequested: [60, 40, 60],
	filamentError: [120, 60, 120, 60, 120],
	heaterFault: [300, 100, 300],
	messageBox: [50, 50, 50],
};
// #endregion
