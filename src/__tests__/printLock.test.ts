import { describe, expect, it } from "vitest";

import type { Widget } from "../model/document";
import { defaultLockForWidget, effectiveLockForItem, isPrintingStatus } from "../util/printLock";

describe("isPrintingStatus", () => {
	it("treats an active print session (incl. paused) as printing", () => {
		for (const s of ["processing", "paused", "pausing", "resuming", "cancelling", "simulating"]) {
			expect(isPrintingStatus(s)).toBe(true);
		}
	});
	it("is false when idle/off/undefined", () => {
		expect(isPrintingStatus("idle")).toBe(false);
		expect(isPrintingStatus("off")).toBe(false);
		expect(isPrintingStatus(undefined)).toBe(false);
	});
});

describe("defaultLockForWidget", () => {
	it("locks motion / tool / extrusion widgets by default", () => {
		expect(defaultLockForWidget({ type: "jog" } as Widget)).toBe(true);
		expect(defaultLockForWidget({ type: "extruder" } as Widget)).toBe(true);
		expect(defaultLockForWidget({ type: "wcs" } as Widget)).toBe(true);
		expect(defaultLockForWidget({ type: "toolSelect" } as Widget)).toBe(true);
		expect(defaultLockForWidget({ type: "spindle" } as Widget)).toBe(true);
		expect(defaultLockForWidget({ type: "toolAlign" } as Widget)).toBe(true);
	});

	it("locks the built-in Movement panel but not other panels", () => {
		expect(defaultLockForWidget({ type: "builtinPanel", component: "MovementPanel" } as Widget)).toBe(true);
		expect(defaultLockForWidget({ type: "builtinPanel", component: "ToolsPanel" } as Widget)).toBe(false);
	});

	it("infers command-button danger from its g-code", () => {
		const btn = (code: string, action?: string): Widget => ({ type: "codeButton", code, label: "x", action } as Widget);
		expect(defaultLockForWidget(btn("G28"))).toBe(true); // home
		expect(defaultLockForWidget(btn("G1 X10 Y10 F3000"))).toBe(true); // move
		expect(defaultLockForWidget(btn("G29"))).toBe(true); // mesh probe
		expect(defaultLockForWidget(btn("T1"))).toBe(true); // tool change
		expect(defaultLockForWidget(btn("M25"))).toBe(false); // pause — safe
		expect(defaultLockForWidget(btn("M24"))).toBe(false); // resume — safe
		expect(defaultLockForWidget(btn("M117 hello"))).toBe(false); // message — safe
		// G10 (set offsets/temps) shouldn't trip the G1 matcher
		expect(defaultLockForWidget(btn("G10 P0 S200"))).toBe(false);
		// non-gcode actions never move the machine
		expect(defaultLockForWidget(btn("G28", "url"))).toBe(false);
	});

	it("leaves read-outs and safe controls unlocked", () => {
		expect(defaultLockForWidget({ type: "value" } as Widget)).toBe(false);
		expect(defaultLockForWidget({ type: "jobControl" } as Widget)).toBe(false);
		expect(defaultLockForWidget({ type: "heater" } as Widget)).toBe(false);
		expect(defaultLockForWidget({ type: "messageBox" } as Widget)).toBe(false);
	});
});

describe("effectiveLockForItem", () => {
	it("uses the explicit choice when set, else the type default", () => {
		expect(effectiveLockForItem({ type: "jog" } as Widget, false)).toBe(false); // override off
		expect(effectiveLockForItem({ type: "value" } as Widget, true)).toBe(true); // override on
		expect(effectiveLockForItem({ type: "jog" } as Widget, undefined)).toBe(true); // default
		expect(effectiveLockForItem({ type: "value" } as Widget, undefined)).toBe(false);
	});
});
