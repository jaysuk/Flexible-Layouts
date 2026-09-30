import { flushPromises } from "@vue/test-utils";
import { dwc, loadObjectModel, setConnected, setModel } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectCueEvents, installSoundCues, snapshotFromModel, uninstallSoundCues, type CueSnapshot } from "../src/model/soundCues";
import { resetAudioForTests, updateSoundSettings } from "../src/util/sound";

const snap = (over: Partial<CueSnapshot> = {}): CueSnapshot => ({ status: "idle", filamentFaults: 0, heaterFaults: 0, messageBox: false, ...over });

describe("detectCueEvents - rising edges only", () => {
	it("a job that runs straight to idle FINISHED", () => {
		expect(detectCueEvents(snap({ status: "processing" }), snap({ status: "idle" }))).toEqual(["jobFinished"]);
		expect(detectCueEvents(snap({ status: "simulating" }), snap({ status: "idle" }))).toEqual(["jobFinished"]);
		expect(detectCueEvents(snap({ status: "resuming" }), snap({ status: "idle" }))).toEqual(["jobFinished"]);
	});

	it("a run the OM says was cancelled STOPPED - it did not finish", () => {
		expect(detectCueEvents(snap({ status: "processing" }), snap({ status: "idle", lastFileCancelled: true }))).toEqual(["jobStopped"]);
	});

	it("cancelling -> idle stopped; paused -> idle stopped", () => {
		expect(detectCueEvents(snap({ status: "cancelling" }), snap({ status: "idle" }))).toEqual(["jobStopped"]);
		expect(detectCueEvents(snap({ status: "paused" }), snap({ status: "idle" }))).toEqual(["jobStopped"]);
		expect(detectCueEvents(snap({ status: "pausing" }), snap({ status: "idle" }))).toEqual(["jobStopped"]);
	});

	it("halting is a stop, from any state but halted", () => {
		expect(detectCueEvents(snap({ status: "processing" }), snap({ status: "halted" }))).toEqual(["jobStopped"]);
		expect(detectCueEvents(snap({ status: "idle" }), snap({ status: "halted" }))).toEqual(["jobStopped"]);
		expect(detectCueEvents(snap({ status: "halted" }), snap({ status: "halted" }))).toEqual([]);
	});

	it("a pause is announced once, on the edge into pausing/paused", () => {
		expect(detectCueEvents(snap({ status: "processing" }), snap({ status: "pausing" }))).toEqual(["pauseRequested"]);
		expect(detectCueEvents(snap({ status: "processing" }), snap({ status: "paused" }))).toEqual(["pauseRequested"]);
		expect(detectCueEvents(snap({ status: "pausing" }), snap({ status: "paused" }))).toEqual([]); // still the same pause
		expect(detectCueEvents(snap({ status: "paused" }), snap({ status: "resuming" }))).toEqual([]);
	});

	it("a fault sounds when it appears, not while it stays", () => {
		expect(detectCueEvents(snap(), snap({ filamentFaults: 1 }))).toEqual(["filamentError"]);
		expect(detectCueEvents(snap({ filamentFaults: 1 }), snap({ filamentFaults: 1 }))).toEqual([]);
		expect(detectCueEvents(snap({ filamentFaults: 1 }), snap({ filamentFaults: 0 }))).toEqual([]);
		expect(detectCueEvents(snap({ filamentFaults: 1 }), snap({ filamentFaults: 2 }))).toEqual(["filamentError"]); // a second monitor
		expect(detectCueEvents(snap(), snap({ heaterFaults: 1 }))).toEqual(["heaterFault"]);
		expect(detectCueEvents(snap({ heaterFaults: 1 }), snap({ heaterFaults: 1 }))).toEqual([]);
	});

	it("a message box sounds when it opens, not while it is open", () => {
		expect(detectCueEvents(snap(), snap({ messageBox: true }))).toEqual(["messageBox"]);
		expect(detectCueEvents(snap({ messageBox: true }), snap({ messageBox: true }))).toEqual([]);
		expect(detectCueEvents(snap({ messageBox: true }), snap())).toEqual([]);
	});

	it("steady state of every kind is silent", () => {
		for (const status of ["idle", "processing", "paused", "halted", "cancelling", "off"]) {
			expect(detectCueEvents(snap({ status }), snap({ status }))).toEqual([]);
		}
	});

	it("nothing fires out of an unknown status (the first snapshot / an unloaded model)", () => {
		expect(detectCueEvents(snap({ status: undefined }), snap({ status: "processing" }))).toEqual([]);
		expect(detectCueEvents(snap({ status: undefined }), snap({ status: "idle" }))).toEqual([]);
		expect(detectCueEvents(snap({ status: undefined }), snap({ status: "halted" }))).toEqual([]);
	});

	it("reports several simultaneous events", () => {
		expect(detectCueEvents(snap({ status: "processing" }), snap({ status: "paused", filamentFaults: 1 })).sort()).toEqual(["filamentError", "pauseRequested"]);
	});
});

describe("snapshotFromModel", () => {
	it("counts only real faults", () => {
		const s = snapshotFromModel({
			state: { status: "processing", messageBox: { mode: 1 } },
			job: { lastFileCancelled: true },
			sensors: { filamentMonitors: [{ status: "ok" }, { status: "noMonitor" }, { status: "noDataReceived" }, { status: "noFilament" }, { status: "sensorError" }, null] },
			heat: { heaters: [{ state: "active" }, { state: "fault" }, null, { state: "fault" }] },
		});
		expect(s).toEqual({ status: "processing", lastFileCancelled: true, filamentFaults: 2, heaterFaults: 2, messageBox: true });
	});

	it("copes with an empty or missing model", () => {
		expect(snapshotFromModel(undefined)).toEqual({ status: undefined, lastFileCancelled: undefined, filamentFaults: 0, heaterFaults: 0, messageBox: false });
		expect(snapshotFromModel({})).toMatchObject({ filamentFaults: 0, heaterFaults: 0, messageBox: false });
	});
});

// The installed watcher, against the mocked machine store and a recording AudioContext.
describe("installSoundCues", () => {
	let played: number;
	const setStatus = (status: string, extra: Record<string, unknown> = {}) => {
		const base = loadObjectModel() as Record<string, unknown>;
		setModel({ ...base, state: { ...(base.state as object), status }, ...extra });
	};

	beforeEach(() => {
		const map = new Map<string, string>();
		vi.stubGlobal("localStorage", { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) });
		resetAudioForTests();
		played = 0;
		(window as unknown as Record<string, unknown>).AudioContext = class {
			state = "running"; currentTime = 0; destination = {};
			addEventListener() { /* no-op */ }
			createOscillator() { played++; return { type: "sine", frequency: {}, connect() {}, start() {}, stop() {} }; }
			createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
		};
		setConnected(false);
		setStatus("processing");
	});
	afterEach(() => {
		uninstallSoundCues();
		resetAudioForTests();
		delete (window as unknown as Record<string, unknown>).AudioContext;
		vi.unstubAllGlobals();
	});

	async function connect() {
		installSoundCues();
		setConnected(true);
		await flushPromises();
	}

	it("makes no sound for a machine that was already mid-print when the page loaded", async () => {
		updateSoundSettings({ events: { jobFinished: { on: true } } });
		await connect();
		expect(played).toBe(0);
	});

	it("sounds when a job finishes, if the user turned that event on", async () => {
		updateSoundSettings({ events: { jobFinished: { on: true, cue: "chime" } } });
		await connect();
		setStatus("idle");
		await flushPromises();
		expect(played).toBeGreaterThan(0);
	});

	it("is silent by default - every event is opt-in", async () => {
		await connect();
		setStatus("idle");
		await flushPromises();
		expect(played).toBe(0);
	});

	it("respects the master mute", async () => {
		updateSoundSettings({ muted: true, events: { jobFinished: { on: true } } });
		await connect();
		setStatus("idle");
		await flushPromises();
		expect(played).toBe(0);
	});

	it("does not repeat while the condition simply persists", async () => {
		updateSoundSettings({ events: { heaterFault: { on: true } } });
		await connect();
		setStatus("processing", { heat: { heaters: [{ state: "fault" }] } });
		await flushPromises();
		const first = played;
		expect(first).toBeGreaterThan(0);
		setStatus("processing", { heat: { heaters: [{ state: "fault" }] }, move: { extra: 1 } });
		await flushPromises();
		expect(played).toBe(first);
	});

	it("re-baselines after a reconnect: coming back into a state is not an event", async () => {
		updateSoundSettings({ events: { jobFinished: { on: true }, jobStopped: { on: true }, messageBox: { on: true } } });
		await connect();
		setConnected(false);
		await flushPromises();
		setStatus("idle");
		setConnected(true);
		await flushPromises();
		expect(played).toBe(0);
	});

	it("stops watching when uninstalled", async () => {
		updateSoundSettings({ events: { jobFinished: { on: true } } });
		await connect();
		uninstallSoundCues();
		setStatus("idle");
		await flushPromises();
		expect(played).toBe(0);
		expect(dwc).toBeDefined();
	});
});
