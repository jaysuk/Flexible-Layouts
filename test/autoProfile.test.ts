import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { loadObjectModel, mountInDwc, setConnected, setModel } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import ProfilesDialog from "../src/editor/ProfilesDialog.vue";
import {
	AutoProfileController, autoProfileEnabled, installAutoProfile, lastAutoSwitch, pickProfile, ruleHolds, setAutoProfileEnabled,
	signature, uninstallAutoProfile, type AutoContext, type AutoHost, type AutoProfile,
} from "../src/model/autoProfile";
import type { AutoSwitchRule } from "../src/model/document";
import { CUSTOM_PAGE_PREFIX } from "../src/model/pageSlug";
import { followSharedProfile, showProfileOnThisDevice, switchProfile } from "../src/model/profiles";
import {
	createProfile, deviceProfileOverride, ensureProfiles, getActiveProfileId, getSharedActiveProfileId, setDeviceProfileOverride,
	setProfileAutoSwitch, snapshotAllProfiles, useLayoutStore,
} from "../src/model/store";

// applyTheme talks to DWC's theme registry, which the kit does not stub; switching is what is under test here.
vi.mock("../src/model/theme", () => ({ applyTheme: vi.fn() }));

enableAutoUnmount(afterEach);

let storage: Map<string, string>;
beforeEach(() => {
	storage = new Map();
	vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
	setDeviceProfileOverride(null);
	setAutoProfileEnabled(false);
	lastAutoSwitch.value = null;
});
afterEach(() => {
	uninstallAutoProfile();
	setDeviceProfileOverride(null);
	setAutoProfileEnabled(false);
	vi.unstubAllGlobals();
});

const ctx = (over: Partial<AutoContext> = {}): AutoContext => ({ machineMode: "FFF", printing: false, model: {}, ...over });
const cnc: AutoSwitchRule = { on: "machineMode", value: "CNC" };
const printing: AutoSwitchRule = { on: "printing" };

describe("rule matching", () => {
	it("machine mode compares case-insensitively", () => {
		expect(ruleHolds(cnc, ctx({ machineMode: "CNC" }))).toBe(true);
		expect(ruleHolds(cnc, ctx({ machineMode: "cnc" }))).toBe(true);
		expect(ruleHolds(cnc, ctx({ machineMode: "FFF" }))).toBe(false);
		expect(ruleHolds(cnc, ctx({ machineMode: undefined }))).toBe(false);
		expect(ruleHolds({ on: "machineMode", value: "Laser" }, ctx({ machineMode: "laser" }))).toBe(true);
	});

	it("printing follows the print state", () => {
		expect(ruleHolds(printing, ctx({ printing: true }))).toBe(true);
		expect(ruleHolds(printing, ctx({ printing: false }))).toBe(false);
	});

	it("a condition holds when its rule does - and an empty condition never does", () => {
		const rule: AutoSwitchRule = { on: "condition", rule: { omPath: "state.flag", operator: "truthy" } };
		expect(ruleHolds(rule, ctx({ model: { state: { flag: true } } }))).toBe(true);
		expect(ruleHolds(rule, ctx({ model: { state: { flag: false } } }))).toBe(false);
		expect(ruleHolds({ on: "condition", rule: { omPath: "", operator: "truthy" } }, ctx())).toBe(false);
	});

	it("no rule never holds", () => {
		expect(ruleHolds(undefined, ctx())).toBe(false);
	});

	it("the first matching profile, in order, wins", () => {
		const profiles: Array<AutoProfile> = [
			{ id: "a", name: "A" },
			{ id: "b", name: "B", rule: printing },
			{ id: "c", name: "C", rule: printing },
		];
		expect(pickProfile(profiles, ctx({ printing: true }))?.id).toBe("b");
		expect(pickProfile(profiles, ctx({ printing: false }))).toBeUndefined();
	});

	it("the signature changes exactly when an edge could have happened", () => {
		const profiles: Array<AutoProfile> = [{ id: "a", name: "A", rule: cnc }, { id: "b", name: "B" }];
		const a = signature(profiles, ctx());
		expect(signature(profiles, ctx({ model: { unrelated: 1 } }))).toBe(a); // irrelevant change: same
		expect(signature(profiles, ctx({ machineMode: "CNC" }))).not.toBe(a);
		expect(signature(profiles, ctx({ printing: true }))).not.toBe(a);
	});
});

// A controllable host.
function fakeHost(init: { profiles: Array<AutoProfile>; showing: string; ctx?: AutoContext | null; enabled?: boolean }) {
	const state = { profiles: init.profiles, showing: init.showing, ctx: init.ctx === undefined ? ctx() : init.ctx, enabled: init.enabled ?? true, shown: [] as string[] };
	const host: AutoHost = {
		enabled: () => state.enabled,
		profiles: () => state.profiles,
		context: () => state.ctx,
		showing: () => state.showing,
		show: (id) => { state.shown.push(id); state.showing = id; return true; },
	};
	return { state, host, ctl: new AutoProfileController(host) };
}
const P = (id: string, rule?: AutoSwitchRule): AutoProfile => ({ id, name: id.toUpperCase(), rule });

describe("AutoProfileController - edge-triggered", () => {
	it("looks at a freshly loaded machine once, so a kiosk comes up in the right profile", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cnc)], showing: "main", ctx: ctx({ machineMode: "CNC" }) });
		expect(ctl.evaluate()).toEqual({ profileId: "cnc", reason: { kind: "machineMode", value: "CNC" } });
		expect(state.shown).toEqual(["cnc"]);
	});

	it("does nothing until the model has loaded", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cnc)], showing: "main", ctx: null });
		expect(ctl.evaluate()).toBeNull();
		state.ctx = ctx({ machineMode: "CNC" });
		expect(ctl.evaluate()?.profileId).toBe("cnc"); // first look after loading
	});

	it("does nothing while switched off, and looks fresh when turned on", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cnc)], showing: "main", ctx: ctx({ machineMode: "CNC" }), enabled: false });
		expect(ctl.evaluate()).toBeNull();
		expect(state.shown).toEqual([]);
		state.enabled = true;
		expect(ctl.evaluate()?.profileId).toBe("cnc");
	});

	it("a manual switch afterwards STICKS until the next edge", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cnc)], showing: "main", ctx: ctx({ machineMode: "CNC" }) });
		ctl.evaluate(); // -> cnc
		state.showing = "main"; // the user switches back by hand
		expect(ctl.evaluate()).toBeNull(); // same state: no edge: leave it
		expect(ctl.evaluate()).toBeNull();
		expect(state.showing).toBe("main");
		state.ctx = ctx({ machineMode: "FFF" });
		expect(ctl.evaluate()).toBeNull(); // an edge, but nothing matches
		state.ctx = ctx({ machineMode: "CNC" });
		expect(ctl.evaluate()?.profileId).toBe("cnc"); // the next matching edge does switch
	});

	it("does not flip-flop: repeated evaluation with no change never switches again", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cnc)], showing: "main", ctx: ctx({ machineMode: "CNC" }) });
		for (let i = 0; i < 10; i++) { ctl.evaluate(); }
		expect(state.shown).toEqual(["cnc"]);
	});

	it("does nothing when the matching profile is already showing", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cnc)], showing: "cnc", ctx: ctx({ machineMode: "CNC" }) });
		expect(ctl.evaluate()).toBeNull();
		expect(state.shown).toEqual([]);
	});

	it("when several match, the first in profile order wins", () => {
		const { ctl } = fakeHost({ profiles: [P("main"), P("first", printing), P("second", printing)], showing: "main", ctx: ctx({ printing: true }) });
		expect(ctl.evaluate()?.profileId).toBe("first");
	});

	it("reacts to a print starting", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("mon", printing)], showing: "main" });
		expect(ctl.evaluate()).toBeNull();
		state.ctx = ctx({ printing: true });
		expect(ctl.evaluate()).toEqual({ profileId: "mon", reason: { kind: "printing" } });
	});

	it("a profile with no rule is never switched to", () => {
		const { ctl, state } = fakeHost({ profiles: [P("a"), P("b")], showing: "a" });
		state.ctx = ctx({ printing: true, machineMode: "CNC" });
		expect(ctl.evaluate()).toBeNull();
	});
});

describe("AutoProfileController - return when it ends", () => {
	const back: AutoSwitchRule = { on: "printing", returnWhenEnds: true };

	it("hands the screen back to the profile it took over from", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("mon", back)], showing: "main" });
		ctl.evaluate();
		state.ctx = ctx({ printing: true });
		expect(ctl.evaluate()?.profileId).toBe("mon");
		state.ctx = ctx({ printing: false });
		expect(ctl.evaluate()).toEqual({ profileId: "main", reason: { kind: "ended" } });
		expect(state.showing).toBe("main");
	});

	it("does not hand back if nobody asked it to", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("mon", printing)], showing: "main" });
		ctl.evaluate();
		state.ctx = ctx({ printing: true });
		ctl.evaluate();
		state.ctx = ctx({ printing: false });
		expect(ctl.evaluate()).toBeNull();
		expect(state.showing).toBe("mon");
	});

	it("does not override a manual switch made mid-print", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("other"), P("mon", back)], showing: "main" });
		ctl.evaluate();
		state.ctx = ctx({ printing: true });
		ctl.evaluate(); // -> mon
		state.showing = "other"; // the user moves elsewhere
		state.ctx = ctx({ printing: false });
		expect(ctl.evaluate()).toBeNull();
		expect(state.showing).toBe("other");
	});

	it("hopping between automatic profiles still returns to the ORIGINAL one", () => {
		const cncBack: AutoSwitchRule = { on: "machineMode", value: "CNC", returnWhenEnds: true };
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("cnc", cncBack), P("mon", { on: "printing", returnWhenEnds: true })], showing: "main" });
		ctl.evaluate();
		state.ctx = ctx({ machineMode: "CNC" });
		expect(ctl.evaluate()?.profileId).toBe("cnc");
		state.ctx = ctx({ machineMode: "CNC", printing: true });
		expect(ctl.evaluate()).toBeNull(); // cnc is still first in order, and already showing
		state.ctx = ctx({ machineMode: "FFF", printing: true });
		expect(ctl.evaluate()?.profileId).toBe("mon");
		state.ctx = ctx({ machineMode: "FFF", printing: false });
		expect(ctl.evaluate()?.profileId).toBe("main");
	});

	it("does not return to a profile that has since been deleted", () => {
		const { ctl, state } = fakeHost({ profiles: [P("main"), P("mon", back)], showing: "main" });
		ctl.evaluate();
		state.ctx = ctx({ printing: true });
		ctl.evaluate();
		state.profiles = [P("mon", back)];
		state.ctx = ctx({ printing: false });
		expect(ctl.evaluate()).toBeNull();
	});
});

describe("a per-device 'showing profile' (no shared-document write)", () => {
	function twoProfiles() {
		const first = getSharedActiveProfileId();
		const second = createProfile("Second");
		return { first, second };
	}
	const sharedPart = () => JSON.stringify((useLayoutStore() && ensureProfiles()));

	it("showing a profile on this device leaves the shared default and every profile untouched", () => {
		const { first, second } = twoProfiles();
		const before = JSON.stringify(ensureProfiles().profiles) + getSharedActiveProfileId();
		expect(showProfileOnThisDevice(second)).toBe(true);
		expect(getActiveProfileId()).toBe(second); // what THIS device shows
		expect(getSharedActiveProfileId()).toBe(first); // what everyone else shows
		expect(JSON.stringify(ensureProfiles().profiles) + getSharedActiveProfileId()).toBe(before);
		expect(storage.get("flexibleLayouts.showingProfile")).toBe(second);
		void sharedPart;
	});

	it("the layout store follows the override", () => {
		const { second } = twoProfiles();
		const store = useLayoutStore();
		const secondDoc = ensureProfiles().profiles[second];
		showProfileOnThisDevice(second);
		expect(store.document.value).toBe(secondDoc);
	});

	it("a manual switch writes the shared pointer AND clears the override", () => {
		const { first, second } = twoProfiles();
		showProfileOnThisDevice(second);
		switchProfile(first);
		expect(getSharedActiveProfileId()).toBe(first);
		expect(deviceProfileOverride.value).toBeNull();
		expect(getActiveProfileId()).toBe(first);
		switchProfile(second);
		expect(getSharedActiveProfileId()).toBe(second); // manual switching is unchanged: it IS shared
	});

	it("an override pointing at a profile that no longer exists is ignored", () => {
		const { first } = twoProfiles();
		setDeviceProfileOverride("ghost");
		expect(getActiveProfileId()).toBe(first);
	});

	it("a backup records the shared default, not this device's override", () => {
		const { first, second } = twoProfiles();
		showProfileOnThisDevice(second);
		expect(snapshotAllProfiles().active).toBe(first);
	});

	it("followSharedProfile drops the override", () => {
		const { first, second } = twoProfiles();
		showProfileOnThisDevice(second);
		followSharedProfile();
		expect(deviceProfileOverride.value).toBeNull();
		expect(getActiveProfileId()).toBe(first);
	});

	it("refuses an unknown profile or one already showing", () => {
		const { first } = twoProfiles();
		expect(showProfileOnThisDevice("nope")).toBe(false);
		expect(showProfileOnThisDevice(first)).toBe(false);
	});
});

describe("installed against the live machine", () => {
	const status = (s: string, extra: Record<string, unknown> = {}) => {
		const base = loadObjectModel() as { state: Record<string, unknown> };
		setModel({ ...base, ...extra, state: { ...base.state, status: s, ...((extra.state as object) ?? {}) } });
	};

	function setup(rule: AutoSwitchRule = { on: "printing" }) {
		const main = getSharedActiveProfileId();
		const monitor = createProfile("Monitor");
		setProfileAutoSwitch(monitor, rule);
		const navigate = vi.fn();
		let path = "/";
		const onSwitched = vi.fn();
		setConnected(true);
		status("idle");
		setAutoProfileEnabled(true);
		installAutoProfile({ navigate, currentPath: () => path, onSwitched });
		return { main, monitor, navigate, onSwitched, setPath: (p: string) => { path = p; } };
	}

	it("switches this device when a print starts, and never writes the shared pointer", async () => {
		const { main, monitor, onSwitched } = setup();
		await flushPromises();
		expect(getActiveProfileId()).toBe(main);
		status("processing");
		await flushPromises();
		expect(getActiveProfileId()).toBe(monitor);
		expect(getSharedActiveProfileId()).toBe(main);
		expect(onSwitched).toHaveBeenCalledTimes(1);
		expect(lastAutoSwitch.value).toMatchObject({ profileId: monitor, profileName: "Monitor", reason: { kind: "printing" } });
	});

	it("does nothing when this device has not opted in", async () => {
		const { main } = setup();
		setAutoProfileEnabled(false);
		status("processing");
		await flushPromises();
		expect(getActiveProfileId()).toBe(main);
	});

	it("turning it on later takes effect straight away for a machine that is already printing", async () => {
		const main = getSharedActiveProfileId();
		const monitor = createProfile("Monitor");
		setProfileAutoSwitch(monitor, { on: "printing" });
		setConnected(true);
		status("processing");
		installAutoProfile({ navigate: vi.fn(), currentPath: () => "/" });
		await flushPromises();
		expect(getActiveProfileId()).toBe(main);
		setAutoProfileEnabled(true);
		await flushPromises();
		expect(getActiveProfileId()).toBe(monitor);
	});

	it("a manual switch made afterwards sticks through further model updates", async () => {
		const { main, monitor } = setup();
		status("processing");
		await flushPromises();
		expect(getActiveProfileId()).toBe(monitor);
		switchProfile(main);
		status("processing", { move: { extra: 2 } });
		await flushPromises();
		status("processing", { move: { extra: 3 } });
		await flushPromises();
		expect(getActiveProfileId()).toBe(main);
	});

	it("moves off a custom page that does not exist in the new profile", async () => {
		const { navigate, setPath } = setup();
		setPath(`${CUSTOM_PAGE_PREFIX}only-in-the-old-profile`);
		status("processing");
		await flushPromises();
		expect(navigate).toHaveBeenCalledWith("/");
	});

	it("goes to the new profile's startup page when it has one", async () => {
		const { monitor, navigate, setPath } = setup();
		ensureProfiles().profiles[monitor].startupPath = "/Job/Status";
		setPath(`${CUSTOM_PAGE_PREFIX}gone`);
		status("processing");
		await flushPromises();
		expect(navigate).toHaveBeenCalledWith("/Job/Status");
	});

	it("leaves the router alone on a page that exists in both", async () => {
		const { navigate, setPath } = setup();
		setPath("/Console");
		status("processing");
		await flushPromises();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("returns to the previous profile when the print ends, if asked to", async () => {
		const { main, monitor } = setup({ on: "printing", returnWhenEnds: true });
		status("processing");
		await flushPromises();
		expect(getActiveProfileId()).toBe(monitor);
		status("idle");
		await flushPromises();
		expect(getActiveProfileId()).toBe(main);
		expect(lastAutoSwitch.value?.reason.kind).toBe("ended");
	});

	it("stops reacting once uninstalled", async () => {
		const { main } = setup();
		uninstallAutoProfile();
		status("processing");
		await flushPromises();
		expect(getActiveProfileId()).toBe(main);
	});
});

describe("ProfilesDialog rule editor", () => {
	async function open() {
		const w = mountInDwc(ProfilesDialog, { props: { modelValue: false, attach: true } });
		await w.setProps({ modelValue: true });
		await flushPromises();
		return w;
	}

	it("the per-device switch is off by default and remembered", async () => {
		const w = await open();
		const sw = w.find(".auto-profile-switch input");
		expect((sw.element as HTMLInputElement).checked).toBe(false);
		await sw.setValue(true);
		expect(autoProfileEnabled.value).toBe(true);
		expect(storage.get("flexibleLayouts.autoProfile")).toBe("1");
	});

	it("saves a machine-mode rule onto the profile", async () => {
		const id = getSharedActiveProfileId();
		const w = await open();
		const vm = w.vm as unknown as { startRule(p: { id: string; name: string }): void; ruleDraft: { kind: string; mode: string; returnWhenEnds: boolean }; saveRule(): void };
		vm.startRule({ id, name: "Default" });
		vm.ruleDraft.kind = "machineMode";
		vm.ruleDraft.mode = "Laser";
		vm.ruleDraft.returnWhenEnds = true;
		vm.saveRule();
		expect(ensureProfiles().profiles[id].meta.autoSwitch).toEqual({ on: "machineMode", value: "Laser", returnWhenEnds: true });
	});

	it("saves a condition rule, and drops an empty one", async () => {
		const id = getSharedActiveProfileId();
		const w = await open();
		const vm = w.vm as unknown as { startRule(p: { id: string; name: string }): void; ruleDraft: { kind: string; omPath: string; operator: string; value: string }; saveRule(): void };
		vm.startRule({ id, name: "Default" });
		vm.ruleDraft.kind = "condition";
		vm.ruleDraft.omPath = "state.status";
		vm.ruleDraft.operator = "eq";
		vm.ruleDraft.value = "processing";
		vm.saveRule();
		expect(ensureProfiles().profiles[id].meta.autoSwitch).toEqual({ on: "condition", rule: { omPath: "state.status", operator: "eq", value: "processing" } });

		vm.startRule({ id, name: "Default" });
		vm.ruleDraft.omPath = "   ";
		vm.saveRule();
		expect(ensureProfiles().profiles[id].meta.autoSwitch).toBeUndefined();
	});

	it("'Never' clears the rule, and a saved rule is shown in the list", async () => {
		const id = getSharedActiveProfileId();
		setProfileAutoSwitch(id, { on: "printing" });
		const w = await open();
		expect(w.find(`[data-profile="${id}"]`).text()).toContain("summary.printing");
		const vm = w.vm as unknown as { startRule(p: { id: string; name: string }): void; ruleDraft: { kind: string }; saveRule(): void };
		vm.startRule({ id, name: "Default" });
		expect(vm.ruleDraft.kind).toBe("printing");
		vm.ruleDraft.kind = "none";
		vm.saveRule();
		expect(ensureProfiles().profiles[id].meta.autoSwitch).toBeUndefined();
	});

	it("says when this device is showing something other than the shared default, and can go back", async () => {
		const first = getSharedActiveProfileId();
		const second = createProfile("Second");
		showProfileOnThisDevice(second);
		const w = await open();
		expect(w.find(".auto-profile-differs").exists()).toBe(true);
		await w.find(".auto-profile-follow").trigger("click");
		await nextTick();
		expect(getActiveProfileId()).toBe(first);
	});
});
