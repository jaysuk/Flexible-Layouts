import { describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

import Display12864Emulator from "../src/widgets/Display12864Emulator.vue";
import ExplorerPanel from "../src/widgets/ExplorerPanel.vue";
import { createEmulatorHost, sdPath } from "../src/model/display12864/host";
import { evaluateMenuCondition, evaluateMenuValue, legacyValue, objectModelValue, visibilityCode } from "../src/model/display12864/liveValues";
import { loadMenuSource, menuSourceFromTexts } from "../src/model/display12864/menuSource";

describe("loadMenuSource", () => {
	it("reads menu files as text and image files as bytes, keyed case-insensitively", async () => {
		const io = {
			getFileList: async () => [
				{ name: "Main", isDirectory: false },
				{ name: "logo.bin", isDirectory: false },
				{ name: "notes.txt", isDirectory: false },
				{ name: "sub", isDirectory: true },
			],
			downloadText: async (p: string) => `text of ${p}`,
			downloadBlob: async () => new Blob([Uint8Array.of(8, 1, 255)]),
		};
		const s = await loadMenuSource(io);
		expect(s.files.has("logo.bin")).toBe(false); // an image is not a menu
		expect(s.files.get("main")).toBe("text of 0:/menu/Main");
		expect([...s.images.get("logo.bin")!]).toEqual([8, 1, 255]);
	});

	it("one unreadable file doesn't hide the others", async () => {
		const io = {
			getFileList: async () => [{ name: "main", isDirectory: false }, { name: "bad", isDirectory: false }],
			downloadText: async (p: string) => { if (p.endsWith("bad")) throw new Error("io"); return "ok"; },
			downloadBlob: async () => new Blob(),
		};
		const s = await loadMenuSource(io);
		expect([...s.files.keys()]).toEqual(["main"]);
	});
});

describe("host", () => {
	it("looks menu files up case-insensitively and records - never sends - commands", () => {
		const sent: Array<string> = [];
		const host = createEmulatorHost({ source: menuSourceFromTexts({ Main: "text T\"x\"" }), model: () => ({}), onCommand: (c) => sent.push(c) });
		expect(host.readMenuFile("MAIN")).toBe("text T\"x\"");
		expect(host.readMenuFile("other")).toBeUndefined();
		host.execute!("G28");
		expect(sent).toEqual(["G28"]);
	});

	it("puts RRF's bare paths on volume 0", () => {
		expect(sdPath("/gcodes")).toBe("0:/gcodes");
		expect(sdPath("1:/x")).toBe("1:/x");
		expect(sdPath("gcodes/a")).toBe("0:/gcodes/a");
	});

	it("lists a directory asynchronously: undefined while fetching, then the entries", async () => {
		const getFileList = vi.fn(async () => [{ name: "a.g", isDirectory: false }]);
		const host = createEmulatorHost({ source: menuSourceFromTexts({}), model: () => ({}), io: { getFileList } });
		expect(host.listDirectory!("/gcodes/")).toBeUndefined();
		await Promise.resolve(); await Promise.resolve();
		expect(host.listDirectory!("/gcodes/")).toEqual([{ name: "a.g", isDirectory: false }]);
		expect(getFileList).toHaveBeenCalledTimes(1);
		expect(getFileList).toHaveBeenCalledWith("0:/gcodes");
	});

	it("an unreadable directory shows as empty rather than hanging", async () => {
		const host = createEmulatorHost({ source: menuSourceFromTexts({}), model: () => ({}), io: { getFileList: async () => { throw new Error("no"); } } });
		host.listDirectory!("/x");
		await Promise.resolve(); await Promise.resolve();
		expect(host.listDirectory!("/x")).toEqual([]);
	});
});

const MODEL = {
	state: { status: "idle", currentTool: 0, displayMessage: "Hello" },
	tools: [{ heaters: [1], active: [210], standby: [150], fans: [0] }],
	heat: { bedHeaters: [0], chamberHeaters: [], heaters: [{ current: 60.5, active: 65, standby: 0, state: "active" }, { current: 205.2, active: 210, standby: 150, state: "active" }] },
	fans: [{ actualValue: 0.5 }],
	move: { speedFactor: 1.2, extruders: [{ factor: 0.95 }], axes: [{ userPosition: 10 }, { userPosition: 20 }, { userPosition: 0.3, babystep: 0.05 }] },
	network: { interfaces: [{ actualIP: "192.168.1.50" }] },
	job: { file: { size: 1000 }, filePosition: 250, timesLeft: { file: 3725, filament: 60 } },
	volumes: [{ mounted: true }],
};

describe("legacy values from the object model", () => {
	it("temperatures: tool, bed, and the selected tool", () => {
		expect(legacyValue(MODEL, 0)).toBe(205.2); // tool 0 current
		expect(legacyValue(MODEL, 80)).toBe(60.5); // bed current
		expect(legacyValue(MODEL, 100)).toBe(210); // tool 0 active
		expect(legacyValue(MODEL, 179)).toBe(210); // selected tool active
		expect(legacyValue(MODEL, 180)).toBe(65); // bed active
		expect(legacyValue(MODEL, 200)).toBe(150); // tool 0 standby
	});

	it("fan, extruder and speed factors are percentages", () => {
		expect(legacyValue(MODEL, 300)).toBe(50);
		expect(legacyValue(MODEL, 400)).toBeCloseTo(95);
		expect(legacyValue(MODEL, 500)).toBeCloseTo(120);
	});

	it("misc: message, axes, tool, baby-step, IP", () => {
		expect(legacyValue(MODEL, 501)).toBe("Hello");
		expect(legacyValue(MODEL, 511)).toBe(20);
		expect(legacyValue(MODEL, 520)).toBe(0);
		expect(legacyValue(MODEL, 521)).toBe(0.05);
		expect(legacyValue(MODEL, 531)).toBe(168);
		expect(legacyValue(MODEL, 534)).toBe("192.168.1.50");
	});

	it("print progress and time left only while printing", () => {
		expect(legacyValue(MODEL, 535)).toBe(0);
		const printing = { ...MODEL, state: { ...MODEL.state, status: "processing" } };
		expect(legacyValue(printing, 535)).toBe(25);
		expect(legacyValue(printing, 536)).toBe(3725);
	});

	it("an unknown code has no value", () => {
		expect(legacyValue(MODEL, 545)).toBeUndefined();
	});
});

describe("visibility codes", () => {
	it("follow the printer's state", () => {
		const idle = MODEL;
		const printing = { ...MODEL, state: { ...MODEL.state, status: "processing" } };
		const paused = { ...MODEL, state: { ...MODEL.state, status: "paused" } };
		expect([2, 3, 4, 5, 6, 7].map((c) => visibilityCode(idle, c))).toEqual([false, true, false, true, false, false]);
		expect([2, 3, 4, 5, 6, 7].map((c) => visibilityCode(printing, c))).toEqual([true, false, true, false, false, true]);
		expect([2, 4, 6].map((c) => visibilityCode(paused, c))).toEqual([false, true, true]);
	});

	it("SD mounted, heater faults, and unknown codes", () => {
		expect(visibilityCode(MODEL, 10)).toBe(true);
		expect(visibilityCode({ ...MODEL, volumes: [{ mounted: false }] }, 11)).toBe(true);
		expect(visibilityCode(MODEL, 28)).toBe(false);
		const fault = { ...MODEL, heat: { ...MODEL.heat, heaters: [{ ...MODEL.heat.heaters[0], state: "fault" }, MODEL.heat.heaters[1]] } };
		expect(visibilityCode(fault, 28)).toBe(true);
		expect(visibilityCode(MODEL, 99)).toBe(true);
	});
});

describe("expressions", () => {
	it("reads object-model paths, with array indices", () => {
		expect(objectModelValue(MODEL, "heat.heaters[1].current")).toBe(205.2);
		expect(objectModelValue(MODEL, "no.such.path")).toBeNull();
	});

	it("evaluates a value expression and formats by type", () => {
		expect(evaluateMenuValue(MODEL, "heat.heaters[0].current")).toEqual({ type: "float", value: 60.5 });
		expect(evaluateMenuValue(MODEL, "state.currentTool")).toEqual({ type: "int", value: 0 });
		expect(evaluateMenuValue(MODEL, "state.status")).toEqual({ type: "text", value: "idle" });
		expect(evaluateMenuValue(MODEL, "1 +")).toBeUndefined();
	});

	it("evaluates conditions; an error is false, like RRF", () => {
		expect(evaluateMenuCondition(MODEL, 'state.status == "idle"')).toBe(true);
		expect(evaluateMenuCondition(MODEL, "heat.heaters[1].current > 300")).toBe(false);
		expect(evaluateMenuCondition(MODEL, "1 +")).toBe(false);
	});
});

describe("Display12864Emulator", () => {
	const source = menuSourceFromTexts({
		main: 'button R0 C0 T"Go" A"menu" L"sub"\nbutton R20 C0 T"Home" A"G28"',
		sub: 'text T"sub menu"\nbutton R20 C0 T"Back" A"return"',
		broken: 'button T"x" Z1',
	});

	async function mount(props: Record<string, unknown> = {}) {
		Object.assign(dwc.model, MODEL);
		const w = mountInDwc(Display12864Emulator, { props: { source, ...props } });
		await nextTick();
		await nextTick();
		return w;
	}

	it("starts at main and navigates with the knob", async () => {
		const w = await mount();
		expect(w.text()).toContain("main");
		(w.vm as any).turn(1);
		(w.vm as any).turn(0);
		await nextTick();
		expect(w.text()).toContain("main › sub");
		(w.vm as any).turn(1);
		(w.vm as any).turn(0);
		await nextTick();
		expect(w.text()).not.toContain("main › sub");
	});

	it("lists what a button would send instead of sending it", async () => {
		const w = await mount();
		(w.vm as any).turn(1);
		(w.vm as any).turn(1);
		(w.vm as any).turn(0);
		await nextTick();
		expect(w.text()).toContain("G28");
	});

	it("opens a given menu, with main beneath it, and shows every problem in it", async () => {
		const w = await mount({ menu: "broken" });
		expect(w.text()).toContain("main › broken");
		expect(w.find(".d12864-problems").exists()).toBe(true);
		expect(w.find(".d12864-problems").text()).toContain("Bad arg letter");
	});

	it("has no problems for a clean menu", async () => {
		expect((await mount()).find(".d12864-problems").exists()).toBe(false);
	});
});

describe("ExplorerPanel: menu files", () => {
	it("offers the display preview for a menu file, not for other files", async () => {
		const menu = mountInDwc(ExplorerPanel, { props: { target: { kind: "editor", path: "0:/menu/main" } } });
		await nextTick();
		expect(menu.text()).toContain("display12864.toggle");
		const other = mountInDwc(ExplorerPanel, { props: { target: { kind: "editor", path: "0:/sys/config.g" } } });
		await nextTick();
		expect(other.text()).not.toContain("display12864.toggle");
	});
});
