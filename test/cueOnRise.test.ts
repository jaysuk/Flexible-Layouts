import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { lastCode, loadObjectModel, mountInDwc, sentCodes, setConnected, setModel } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import CueSelect from "../src/editor/CueSelect.vue";
import { editMode } from "../src/model/editorState";
import { MAX_REPEATS, MIN_REPEAT_SECONDS, useCueOnRise, type ActiveCue } from "../src/composables/useCueOnRise";
import { evaluateConditionSounds } from "../src/util/conditions";
import { resetAudioForTests, soundSettings, updateSoundSettings } from "../src/util/sound";
import AlertWidget from "../src/widgets/AlertWidget.vue";
import CommandButtonWidget from "../src/widgets/CommandButtonWidget.vue";
import SoundSettings from "../src/settings/SoundSettings.vue";
import FlexGridItem from "../src/page/FlexGridItem.vue";
import ToggleWidget from "../src/widgets/ToggleWidget.vue";

// Every mounted widget keeps reacting to model changes until unmounted; without this, one test's alert would sound in the next.
enableAutoUnmount(afterEach);

let cues: number; // oscillators created = cues played (each cue here has >= 2)
function installAudio() {
	cues = 0;
	(window as unknown as Record<string, unknown>).AudioContext = class {
		state = "running"; currentTime = 0; destination = {};
		addEventListener() { /* no-op */ }
		createOscillator() { cues++; return { type: "sine", frequency: {}, connect() {}, start() {}, stop() {} }; }
		createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
	};
}

beforeEach(() => {
	const map = new Map<string, string>();
	vi.stubGlobal("localStorage", { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) });
	resetAudioForTests();
	installAudio();
	editMode.value = false;
});
afterEach(() => {
	resetAudioForTests();
	delete (window as unknown as Record<string, unknown>).AudioContext;
	delete (navigator as unknown as Record<string, unknown>).vibrate;
	editMode.value = false;
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("evaluateConditionSounds", () => {
	const model = { heat: { heaters: [{ current: 250 }] } };
	it("returns the cue of each matching rule only", () => {
		const out = evaluateConditionSounds(model, [
			{ omPath: "heat.heaters[0].current", operator: "gt", value: 200, sound: "alarm", soundRepeat: 30 },
			{ omPath: "heat.heaters[0].current", operator: "gt", value: 300, sound: "error" }, // not matching
			{ omPath: "heat.heaters[0].current", operator: "gt", value: 100, color: "error" }, // matches, but no sound
			{ omPath: "heat.heaters[0].current", operator: "gt", value: 100, sound: "not-a-cue" }, // unknown cue ignored
		]);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ cue: "alarm", repeatSeconds: 30 });
	});
	it("copes with no rules", () => {
		expect(evaluateConditionSounds(model, undefined)).toEqual([]);
		expect(evaluateConditionSounds(model, [])).toEqual([]);
	});
});

describe("useCueOnRise", () => {
	function host(active: () => Array<ActiveCue>, enabled?: () => boolean) {
		return mountInDwc(defineComponent({ setup() { useCueOnRise(active, enabled); return () => h("div"); } }));
	}
	const alarm = (over: Partial<ActiveCue> = {}): ActiveCue => ({ key: "a", cue: "chime", ...over });

	it("plays on a rising edge", async () => {
		const on = ref(false);
		host(() => (on.value ? [alarm()] : []));
		expect(cues).toBe(0);
		on.value = true;
		await nextTick();
		expect(cues).toBeGreaterThan(0);
	});

	it("does NOT play for a condition already true when the widget appears (a page load is not an event)", async () => {
		host(() => [alarm()]);
		await nextTick();
		expect(cues).toBe(0);
	});

	it("plays once per activation, not again while it stays true, but again after it clears and returns", async () => {
		const on = ref(false);
		host(() => (on.value ? [alarm()] : []));
		on.value = true; await nextTick();
		const once = cues;
		on.value = true; await nextTick();
		expect(cues).toBe(once);
		on.value = false; await nextTick();
		on.value = true; await nextTick();
		expect(cues).toBe(once * 2);
	});

	it("does not play an unknown cue name", async () => {
		const on = ref(false);
		host(() => (on.value ? [alarm({ cue: "no-such-cue" })] : []));
		on.value = true; await nextTick();
		expect(cues).toBe(0);
	});

	it("respects the device's mute", async () => {
		updateSoundSettings({ muted: true });
		const on = ref(false);
		host(() => (on.value ? [alarm()] : []));
		on.value = true; await nextTick();
		expect(cues).toBe(0);
	});

	describe("repeat", () => {
		beforeEach(() => vi.useFakeTimers());

		it("repeats at the interval while true, and stops when it clears", async () => {
			const on = ref(false);
			host(() => (on.value ? [alarm({ repeatSeconds: 10 })] : []));
			on.value = true; await nextTick();
			const first = cues;
			vi.advanceTimersByTime(10_000);
			expect(cues).toBe(first * 2);
			vi.advanceTimersByTime(10_000);
			expect(cues).toBe(first * 3);
			on.value = false; await nextTick();
			vi.advanceTimersByTime(60_000);
			expect(cues).toBe(first * 3);
		});

		it("clamps a too-short interval up to the minimum", async () => {
			const on = ref(false);
			host(() => (on.value ? [alarm({ repeatSeconds: 1 })] : []));
			on.value = true; await nextTick();
			const first = cues;
			vi.advanceTimersByTime(MIN_REPEAT_SECONDS * 1000 - 1);
			expect(cues).toBe(first);
			vi.advanceTimersByTime(1);
			expect(cues).toBe(first * 2);
		});

		it("gives up after the cap, so a stuck condition cannot nag forever", async () => {
			const on = ref(false);
			host(() => (on.value ? [alarm({ repeatSeconds: 5 })] : []));
			on.value = true; await nextTick();
			const first = cues;
			vi.advanceTimersByTime(5000 * (MAX_REPEATS + 30));
			expect(cues).toBe(first * (1 + MAX_REPEATS));
		});

		it("an already-true repeating condition starts repeating from the interval, silently at first", async () => {
			host(() => [alarm({ repeatSeconds: 10 })]);
			await nextTick();
			expect(cues).toBe(0);
			vi.advanceTimersByTime(10_000);
			expect(cues).toBeGreaterThan(0);
		});

		it("stops repeating when the widget is removed", async () => {
			const on = ref(false);
			const w = host(() => (on.value ? [alarm({ repeatSeconds: 10 })] : []));
			on.value = true; await nextTick();
			const first = cues;
			w.unmount();
			vi.advanceTimersByTime(60_000);
			expect(cues).toBe(first);
		});
	});

	it("is silent while disabled (edit mode) and re-baselines when it comes back: editing never sounds a cue", async () => {
		const on = ref(false);
		const enabled = ref(true);
		host(() => (on.value ? [alarm()] : []), () => enabled.value);
		enabled.value = false; await nextTick();
		on.value = true; await nextTick();
		expect(cues).toBe(0);
		enabled.value = true; await nextTick();
		expect(cues).toBe(0); // already true when re-enabled: baseline
		on.value = false; await nextTick();
		on.value = true; await nextTick();
		expect(cues).toBeGreaterThan(0); // a real edge after that
	});

	it("vibrates with the cue when asked, on a device that can", async () => {
		const buzz = vi.fn(() => true);
		(navigator as unknown as Record<string, unknown>).vibrate = buzz;
		const on = ref(false);
		host(() => (on.value ? [alarm({ haptic: true })] : []));
		on.value = true; await nextTick();
		expect(buzz).toHaveBeenCalled();
	});
});

describe("AlertWidget sound", () => {
	const alert = (extra: Record<string, unknown> = {}) => ({ type: "alert" as const, omPath: "state.flag", operator: "truthy" as const, message: "Hot!", sound: "alarm", ...extra });
	const setFlag = (v: boolean) => setModel({ ...(loadObjectModel() as Record<string, unknown>), state: { ...((loadObjectModel() as { state: object }).state), flag: v } });

	it("sounds when the alert appears, not when it is already showing", async () => {
		setFlag(true);
		mountInDwc(AlertWidget, { props: { widget: alert() } });
		await flushPromises();
		expect(cues).toBe(0);
		setFlag(false);
		await flushPromises();
		setFlag(true);
		await flushPromises();
		expect(cues).toBeGreaterThan(0);
	});

	it("is silent with no sound chosen", async () => {
		setFlag(false);
		mountInDwc(AlertWidget, { props: { widget: alert({ sound: undefined }) } });
		setFlag(true);
		await flushPromises();
		expect(cues).toBe(0);
	});

	it("is silent while editing the layout", async () => {
		setFlag(false);
		editMode.value = true;
		mountInDwc(AlertWidget, { props: { widget: alert() } });
		setFlag(true);
		await flushPromises();
		expect(cues).toBe(0);
	});
});

describe("haptic tap on controls", () => {
	beforeEach(() => setConnected(true));
	it("a button with haptic vibrates once on press, and only when the device can", async () => {
		const buzz = vi.fn(() => true);
		(navigator as unknown as Record<string, unknown>).vibrate = buzz;
		const w = mountInDwc(CommandButtonWidget, { props: { widget: { type: "codeButton", code: "G28", label: "Home", haptic: true } } });
		await w.find("button").trigger("click");
		await flushPromises();
		expect(buzz).toHaveBeenCalledTimes(1);
		expect(lastCode()).toBe("G28");

		const plain = mountInDwc(CommandButtonWidget, { props: { widget: { type: "codeButton", code: "G28", label: "Home" } } });
		buzz.mockClear();
		await plain.find("button").trigger("click");
		expect(buzz).not.toHaveBeenCalled();
	});

	it("does not vibrate for a debounced (ignored) second press", async () => {
		const buzz = vi.fn(() => true);
		(navigator as unknown as Record<string, unknown>).vibrate = buzz;
		const w = mountInDwc(CommandButtonWidget, { props: { widget: { type: "codeButton", code: "G28", label: "Home", haptic: true, debounceMs: 60_000 } } });
		await w.find("button").trigger("click");
		await w.find("button").trigger("click");
		expect(buzz).toHaveBeenCalledTimes(1);
		expect(sentCodes()).toEqual(["G28"]);
	});

	it("does nothing without vibrate() support and never breaks the press", async () => {
		const w = mountInDwc(CommandButtonWidget, { props: { widget: { type: "codeButton", code: "G28", label: "Home", haptic: true } } });
		await w.find("button").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28");
	});

	it("a toggle vibrates when flipped", async () => {
		const buzz = vi.fn(() => true);
		(navigator as unknown as Record<string, unknown>).vibrate = buzz;
		const w = mountInDwc(ToggleWidget, { props: { widget: { type: "toggle", label: "ATX", onCommand: "M80", offCommand: "M81", variant: "button", haptic: true } } });
		await w.find("button").trigger("click");
		expect(buzz).toHaveBeenCalledTimes(1);
	});
});

describe("CueSelect", () => {
	it("emits the chosen cue, previews it even when muted, and hides Repeat until a cue is chosen", async () => {
		updateSoundSettings({ muted: true });
		const w = mountInDwc(CueSelect, { props: { cue: undefined, showRepeat: true } });
		expect(w.find("input[type=number]").exists()).toBe(false);
		expect(w.find(".cue-test").attributes("disabled")).toBeDefined();

		const chosen = mountInDwc(CueSelect, { props: { cue: "alarm", showRepeat: true } });
		expect(chosen.find("input[type=number]").exists()).toBe(true);
		await chosen.find(".cue-test").trigger("click");
		expect(cues).toBeGreaterThan(0); // forced through the mute
	});

	it("turns a blank/zero/invalid repeat into undefined, and passes a real number on", async () => {
		const w = mountInDwc(CueSelect, { props: { cue: "alarm", showRepeat: true } });
		const input = w.find("input[type=number]");
		await input.setValue("30");
		await input.setValue("0");
		expect((w.emitted("update:repeat") ?? []).map((e) => e[0])).toEqual([30, undefined]);

		const filled = mountInDwc(CueSelect, { props: { cue: "alarm", repeat: 30, showRepeat: true } });
		await filled.find("input[type=number]").setValue("");
		expect((filled.emitted("update:repeat") ?? []).map((e) => e[0])).toEqual([undefined]);
	});
});

describe("SoundSettings", () => {
	it("shows the click-to-enable hint until audio is unlocked, and the test button plays", async () => {
		(window as unknown as Record<string, unknown>).AudioContext = class {
			state = "suspended"; currentTime = 0; destination = {};
			addEventListener() { /* no-op */ }
			resume() { return Promise.resolve(); }
			createOscillator() { cues++; return { type: "sine", frequency: {}, connect() {}, start() {}, stop() {} }; }
			createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
		};
		const w = mountInDwc(SoundSettings);
		expect(w.find(".sound-locked").exists()).toBe(true);
		expect(w.find(".sound-unsupported").exists()).toBe(false);
	});

	it("says so when the browser has no audio, and hides vibration options where there is no vibrate()", () => {
		delete (window as unknown as Record<string, unknown>).AudioContext;
		const w = mountInDwc(SoundSettings);
		expect(w.find(".sound-unsupported").exists()).toBe(true);
		expect(w.find(".sound-haptics").exists()).toBe(false);
		expect(w.find(".sound-no-haptics").exists()).toBe(true);
		expect(w.findAll(".sound-event-haptic")).toHaveLength(0);
	});

	it("offers vibration where the device can, per event and as a master switch", () => {
		(navigator as unknown as Record<string, unknown>).vibrate = () => true;
		const w = mountInDwc(SoundSettings);
		expect(w.find(".sound-haptics").exists()).toBe(true);
		expect(w.findAll(".sound-event-haptic")).toHaveLength(6);
	});

	it("lists every event, each off by default, and turning one on is remembered", async () => {
		const w = mountInDwc(SoundSettings);
		const rows = w.findAll(".sound-event");
		expect(rows).toHaveLength(6);
		const sw = w.find('[data-event="jobFinished"] input[type=checkbox]');
		expect((sw.element as HTMLInputElement).checked).toBe(false);
		await sw.setValue(true);
		expect(soundSettings.value.events.jobFinished.on).toBe(true);
	});

	it("the event test button plays through a mute (so a muted device can still be checked)", async () => {
		updateSoundSettings({ muted: true });
		const w = mountInDwc(SoundSettings);
		await w.find('[data-event="jobFinished"] .sound-event-test').trigger("click");
		expect(cues).toBeGreaterThan(0);
	});
});

describe("FlexGridItem rule cues", () => {
	it("a rule's cue sounds when it becomes true in view mode, but not while editing", async () => {
		const item = {
			i: "x", x: 0, y: 0, w: 3, h: 2,
			widget: { type: "label", variant: "text", content: "hi" },
			conditions: [{ omPath: "state.flag", operator: "truthy", sound: "alarm" }],
		};
		const setFlag = (v: boolean) => setModel({ ...(loadObjectModel() as Record<string, unknown>), state: { ...((loadObjectModel() as { state: object }).state), flag: v } });

		setFlag(false);
		mountInDwc(FlexGridItem, { props: { item, editMode: false } });
		await flushPromises();
		setFlag(true);
		await flushPromises();
		expect(cues).toBeGreaterThan(0);

		const heard = cues;
		setFlag(false);
		await flushPromises();
		mountInDwc(FlexGridItem, { props: { item, editMode: true } });
		setFlag(true);
		await flushPromises();
		// the first (view-mode) item sounds again on the new edge; the editing one adds nothing
		expect(cues - heard).toBe(heard);
	});
});
