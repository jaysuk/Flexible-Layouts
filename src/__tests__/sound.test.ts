import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	audioSupported, audioUnlocked, defaultSoundSettings, hapticsSupported, hapticTap, installAudioUnlock, normalizeSoundSettings, playCue,
	resetAudioForTests, soundSettings, updateSoundSettings, vibrate,
} from "../util/sound";

function fakeStorage(initial: Record<string, string> = {}) {
	const map = new Map<string, string>(Object.entries(initial));
	return { map, impl: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) } };
}

/** A recording stand-in for AudioContext. */
function installFakeAudio(state: "running" | "suspended" = "running") {
	const created: Array<{ freq: number; type: string; start: number; stop: number; peak: number }> = [];
	const listeners: Record<string, Array<() => void>> = {};
	const instances: Array<{ state: string; resume: ReturnType<typeof vi.fn> }> = [];
	class FakeCtx {
		state = state;
		currentTime = 0;
		destination = {};
		// Like a real browser, resuming takes effect a tick later, not synchronously.
		resume = vi.fn(async () => { await Promise.resolve(); this.state = "running"; (listeners.statechange ?? []).forEach((f) => f()); });
		addEventListener(type: string, cb: () => void) { (listeners[type] ??= []).push(cb); }
		constructor() { instances.push(this); }
		createOscillator() {
			const rec = { freq: 0, type: "", start: 0, stop: 0, peak: 0 };
			created.push(rec);
			return {
				type: "sine",
				frequency: { set value(v: number) { rec.freq = v; } },
				connect: vi.fn(), start: (t: number) => { rec.start = t; }, stop: (t: number) => { rec.stop = t; },
				set _type(v: string) { rec.type = v; },
			};
		}
		createGain() {
			const last = () => created[created.length - 1];
			return {
				gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: (v: number) => { if (last() && v > last().peak) { last().peak = v; } } },
				connect: vi.fn(),
			};
		}
	}
	(window as unknown as Record<string, unknown>).AudioContext = FakeCtx;
	return { created, instances };
}

let storage: ReturnType<typeof fakeStorage>;
beforeEach(() => {
	storage = fakeStorage();
	vi.stubGlobal("localStorage", storage.impl);
	resetAudioForTests();
});
afterEach(() => {
	resetAudioForTests();
	delete (window as unknown as Record<string, unknown>).AudioContext;
	delete (navigator as unknown as Record<string, unknown>).vibrate;
	vi.unstubAllGlobals();
});

describe("settings", () => {
	it("default to everything OFF: no event plays a cue until the user opts in", () => {
		const d = defaultSoundSettings();
		expect(d.muted).toBe(false);
		expect(Object.values(d.events).every((e) => e.on === false && e.haptic === false)).toBe(true);
	});

	it("survive junk in storage by falling back to defaults field by field", () => {
		const raw = { muted: "yes", volume: 9, haptics: 1, events: { jobFinished: { on: true, cue: "nope", haptic: "x" }, bogus: { on: true } } };
		const s = normalizeSoundSettings(raw);
		expect(s.muted).toBe(false);
		expect(s.volume).toBe(1); // clamped
		expect(s.haptics).toBe(true);
		expect(s.events.jobFinished).toEqual({ on: true, cue: "chime", haptic: false });
		expect(normalizeSoundSettings(null)).toEqual(defaultSoundSettings());
		expect(normalizeSoundSettings("junk")).toEqual(defaultSoundSettings());
		expect(normalizeSoundSettings({ volume: NaN }).volume).toBe(defaultSoundSettings().volume);
	});

	it("are remembered per device and read back", () => {
		updateSoundSettings({ muted: true, volume: 0.25, events: { jobFinished: { on: true, cue: "alarm" } } });
		expect(JSON.parse(storage.map.get("flexibleLayouts.sound")!).events.jobFinished).toMatchObject({ on: true, cue: "alarm" });
		resetAudioForTests(); // re-reads storage
		expect(soundSettings.value.muted).toBe(true);
		expect(soundSettings.value.volume).toBe(0.25);
		expect(soundSettings.value.events.jobFinished.cue).toBe("alarm");
	});

	it("update merges: changing one event leaves the others alone", () => {
		updateSoundSettings({ events: { jobFinished: { on: true } } });
		updateSoundSettings({ events: { heaterFault: { on: true } } });
		expect(soundSettings.value.events.jobFinished.on).toBe(true);
		expect(soundSettings.value.events.heaterFault.on).toBe(true);
		expect(soundSettings.value.events.messageBox.on).toBe(false);
	});

	it("never throws when storage is blocked", () => {
		vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
		expect(() => updateSoundSettings({ muted: true })).not.toThrow();
		expect(() => resetAudioForTests()).not.toThrow();
	});
});

describe("playCue", () => {
	it("schedules one oscillator per step, at the cue's pitches", () => {
		const { created } = installFakeAudio();
		expect(playCue("chime")).toBe(true);
		expect(created.map((c) => c.freq)).toEqual([880, 1318]);
		expect(created[1].start).toBeGreaterThan(created[0].start); // in sequence, not stacked
		expect(created.every((c) => c.stop > c.start)).toBe(true);
	});

	it("plays each named cue", () => {
		const { created } = installFakeAudio();
		for (const name of ["chime", "double", "alarm", "error"] as const) {
			created.length = 0;
			expect(playCue(name)).toBe(true);
			expect(created.length).toBeGreaterThan(1);
		}
	});

	it("shares ONE AudioContext across cues", () => {
		const { instances } = installFakeAudio();
		playCue("chime");
		playCue("double");
		expect(instances).toHaveLength(1);
	});

	it("scales with the volume setting", () => {
		const { created } = installFakeAudio();
		updateSoundSettings({ volume: 1 });
		playCue("chime");
		const loud = created[0].peak;
		created.length = 0;
		updateSoundSettings({ volume: 0.25 });
		playCue("chime");
		expect(created[0].peak).toBeCloseTo(loud * 0.25, 5);
	});

	it("is silent at volume 0", () => {
		installFakeAudio();
		updateSoundSettings({ volume: 0 });
		expect(playCue("chime")).toBe(false);
	});

	it("does nothing when muted - but the Test button can force it", () => {
		const { created } = installFakeAudio();
		updateSoundSettings({ muted: true });
		expect(playCue("chime")).toBe(false);
		expect(created).toHaveLength(0);
		expect(playCue("chime", { force: true })).toBe(true);
		expect(created).toHaveLength(2);
	});

	it("reports false when the browser has no audio", () => {
		expect(audioSupported()).toBe(false);
		expect(playCue("chime")).toBe(false);
	});

	it("reports false while the browser is still blocking audio (no gesture yet)", () => {
		const { created, instances } = installFakeAudio("suspended");
		instances.length = 0;
		// resume() resolves asynchronously, so at call time the context is still suspended
		expect(playCue("chime")).toBe(false);
		expect(created).toHaveLength(0);
	});

	it("never throws if the audio graph fails", () => {
		(window as unknown as Record<string, unknown>).AudioContext = class {
			state = "running"; currentTime = 0; destination = {};
			addEventListener() { /* no-op */ }
			createOscillator() { throw new Error("boom"); }
			createGain() { return {}; }
		};
		expect(playCue("chime")).toBe(false);
	});
});

describe("audio unlock", () => {
	it("resumes on the first gesture, once, and then stops listening", async () => {
		const { instances } = installFakeAudio("suspended");
		installAudioUnlock();
		expect(audioUnlocked.value).toBe(false);
		window.dispatchEvent(new Event("pointerdown"));
		await new Promise((r) => setTimeout(r, 0));
		expect(instances).toHaveLength(1);
		expect(instances[0].resume).toHaveBeenCalledTimes(1);
		expect(audioUnlocked.value).toBe(true);
		window.dispatchEvent(new Event("keydown"));
		expect(instances[0].resume).toHaveBeenCalledTimes(1);
	});

	it("is idempotent", () => {
		installFakeAudio("suspended");
		const a = installAudioUnlock();
		const b = installAudioUnlock();
		expect(typeof a).toBe("function");
		expect(typeof b).toBe("function");
	});
});

describe("haptics", () => {
	it("are unsupported without navigator.vibrate", () => {
		expect(hapticsSupported()).toBe(false);
		expect(vibrate(20)).toBe(false);
		expect(hapticTap()).toBe(false);
	});

	it("vibrate with the device's pattern, and honour the per-device master switch", () => {
		const spy = vi.fn(() => true);
		(navigator as unknown as Record<string, unknown>).vibrate = spy;
		expect(hapticsSupported()).toBe(true);
		expect(vibrate([50, 50])).toBe(true);
		expect(spy).toHaveBeenCalledWith([50, 50]);
		expect(hapticTap()).toBe(true);
		expect(spy).toHaveBeenLastCalledWith(15);
		updateSoundSettings({ haptics: false });
		spy.mockClear();
		expect(vibrate(20)).toBe(false);
		expect(spy).not.toHaveBeenCalled();
	});

	it("swallow a throwing vibrate()", () => {
		(navigator as unknown as Record<string, unknown>).vibrate = () => { throw new Error("nope"); };
		expect(vibrate(20)).toBe(false);
	});
});
