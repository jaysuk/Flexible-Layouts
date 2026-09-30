import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { contrastRatio, lowContrast, MIN_TEXT_CONTRAST, parseRgb, relativeLuminance } from "../src/util/color";
import { installFocusReturn } from "../src/util/focusReturn";
import AlertWidget from "../src/widgets/AlertWidget.vue";
import IndicatorsWidget from "../src/widgets/IndicatorsWidget.vue";
import MessageBoxWidget from "../src/widgets/MessageBoxWidget.vue";

enableAutoUnmount(afterEach);

describe("contrast maths (WCAG)", () => {
	it("parses hex (3, 4, 6, 8 digit) and rgb()", () => {
		expect(parseRgb("#fff")).toEqual([255, 255, 255]);
		expect(parseRgb("#ff8800")).toEqual([255, 136, 0]);
		expect(parseRgb("#0008")).toEqual([0, 0, 0]);
		expect(parseRgb("#11223344")).toEqual([17, 34, 51]);
		expect(parseRgb("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
		expect(parseRgb("rgba(10 20 30 / 0.5)")).toEqual([10, 20, 30]);
	});

	it("does not pretend to parse a theme token, junk or an out-of-range channel", () => {
		for (const v of ["primary", "warning", "", "  ", "#12", "#gggggg", "rgb(300, 0, 0)", "hsl(200, 50%, 50%)", undefined, null]) {
			expect(parseRgb(v as string | undefined)).toBeNull();
		}
	});

	it("gives the reference ratios: 21 for black on white, 1 for identical, and the well-known #767676 on white just passing AA", () => {
		expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
		expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5); // symmetric
		expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
		expect(contrastRatio("#767676", "#fff")).toBeGreaterThan(4.5);
		expect(contrastRatio("#777777", "#fff")).toBeLessThan(4.5);
		expect(relativeLuminance([0, 0, 0])).toBe(0);
		expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
	});

	it("is null when either colour is not a literal", () => {
		expect(contrastRatio("primary", "#fff")).toBeNull();
		expect(contrastRatio("#fff", undefined)).toBeNull();
	});

	it("flags text under AA, and never flags what it cannot measure", () => {
		expect(MIN_TEXT_CONTRAST).toBe(4.5);
		expect(lowContrast("#777777", "#ffffff")).toBe(true);
		expect(lowContrast("#000000", "#ffffff")).toBe(false);
		expect(lowContrast("#ffff00", "#ffffff")).toBe(true); // yellow on white
		expect(lowContrast("primary", "#ffffff")).toBe(false);
		expect(lowContrast(undefined, "#ffffff")).toBe(false);
	});
});

describe("alerts are announced by severity", () => {
	const alertWith = (severity?: string) => mountInDwc(AlertWidget, { props: { widget: { type: "alert", omPath: "state.flag", operator: "truthy", message: "x", severity } as never } });
	const flag = () => setModel({ ...(loadObjectModel() as Record<string, unknown>), state: { ...((loadObjectModel() as { state: object }).state), flag: true } });

	it.each([
		[undefined, "alert"], ["warning", "alert"], ["error", "alert"], ["info", "status"], ["success", "status"],
	])("severity %s -> role=%s", async (severity, role) => {
		flag();
		const w = alertWith(severity);
		await flushPromises();
		expect(w.find(".v-alert").attributes("role")).toBe(role);
	});
});

describe("message box announcement", () => {
	it("an open box is role=alert, the idle state role=status", async () => {
		const idle = mountInDwc(MessageBoxWidget, { props: { widget: { type: "messageBox" } } });
		expect(idle.find("[role=status]").exists()).toBe(true);
		expect(idle.find("[role=alert]").exists()).toBe(false);
		const base = loadObjectModel() as { state: object };
		setModel({ ...base, state: { ...base.state, messageBox: { mode: 1, title: "Note", message: "Check the bed" } } });
		const open = mountInDwc(MessageBoxWidget, { props: { widget: { type: "messageBox" } } });
		await flushPromises();
		expect(open.find("[role=alert]").text()).toContain("Check the bed");
	});
});

describe("indicators carry state as text and shape, not colour alone", () => {
	const widget = { type: "indicators" as const, columns: 1, items: [
		{ label: "Probe", omPath: "state.flag", trueColor: "success", falseColor: "grey" },
	] };
	const setFlag = (v: boolean) => setModel({ ...(loadObjectModel() as Record<string, unknown>), state: { ...((loadObjectModel() as { state: object }).state), flag: v } });

	it("says on/off in words for a screen reader", async () => {
		setFlag(true);
		const w = mountInDwc(IndicatorsWidget, { props: { widget } });
		await flushPromises();
		expect(w.find(".in-state").text()).toContain("indicators.on");
		setFlag(false);
		await flushPromises();
		expect(w.find(".in-state").text()).toContain("indicators.off");
		expect(w.find(".in-item").attributes("data-on")).toBe("false");
	});

	it("uses a filled dot for on and a hollow one for off by default - a difference of shape", async () => {
		setFlag(true);
		const w = mountInDwc(IndicatorsWidget, { props: { widget } });
		await flushPromises();
		expect(w.find(".in-item .v-icon").classes().join(" ")).toContain("mdi-circle");
		expect(w.find(".in-item .v-icon").classes().join(" ")).not.toContain("outline");
		setFlag(false);
		await flushPromises();
		expect(w.find(".in-item .v-icon").classes().join(" ")).toContain("mdi-circle-outline");
	});

	it("honours the configured true/false icons (they used to be ignored)", async () => {
		setFlag(true);
		const custom = { ...widget, items: [{ ...widget.items[0], trueIcon: "mdi-check", falseIcon: "mdi-close" }] };
		const w = mountInDwc(IndicatorsWidget, { props: { widget: custom } });
		await flushPromises();
		expect(w.find(".in-item .v-icon").classes().join(" ")).toContain("mdi-check");
		setFlag(false);
		await flushPromises();
		expect(w.find(".in-item .v-icon").classes().join(" ")).toContain("mdi-close");
	});
});

describe("focus returns to the opener when a dialog closes", () => {
	function openDialog(): HTMLElement {
		const dlg = document.createElement("div");
		dlg.className = "v-overlay v-dialog v-overlay--active";
		document.body.appendChild(dlg);
		return dlg;
	}
	async function settle() {
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 5));
	}
	const cleanups: Array<() => void> = [];
	afterEach(() => { cleanups.splice(0).forEach((c) => c()); document.body.innerHTML = ""; });

	function setup() {
		const opener = document.createElement("button");
		document.body.appendChild(opener);
		opener.focus();
		cleanups.push(installFocusReturn());
		return opener;
	}

	it("puts focus back on the button that opened it", async () => {
		const opener = setup();
		expect(document.activeElement).toBe(opener);
		const dlg = openDialog();
		await settle();
		(document.activeElement as HTMLElement).blur(); // focus lost as the dialog closes
		dlg.classList.remove("v-overlay--active");
		await settle();
		expect(document.activeElement).toBe(opener);
	});

	it("does not steal focus the user has since put somewhere else", async () => {
		const opener = setup();
		const other = document.createElement("input");
		document.body.appendChild(other);
		const dlg = openDialog();
		await settle();
		dlg.classList.remove("v-overlay--active");
		other.focus();
		await settle();
		expect(document.activeElement).toBe(other);
		expect(document.activeElement).not.toBe(opener);
	});

	it("waits for the LAST of several nested dialogs", async () => {
		const opener = setup();
		const first = openDialog();
		await settle();
		(document.activeElement as HTMLElement).blur(); // the dialog took focus off the opener
		const second = openDialog();
		await settle();
		second.classList.remove("v-overlay--active");
		await settle();
		expect(document.activeElement).toBe(document.body); // one dialog still open: nothing restored yet
		first.classList.remove("v-overlay--active");
		await settle();
		expect(document.activeElement).toBe(opener);
	});

	it("does nothing if the opener has gone from the page", async () => {
		const opener = setup();
		const dlg = openDialog();
		await settle();
		opener.remove();
		dlg.classList.remove("v-overlay--active");
		await settle();
		expect(document.activeElement).toBe(document.body);
	});

	it("stops observing when uninstalled", async () => {
		const opener = document.createElement("button");
		document.body.appendChild(opener);
		opener.focus();
		const off = installFocusReturn();
		off();
		const dlg = openDialog();
		await settle();
		dlg.classList.remove("v-overlay--active");
		await settle();
		expect(document.activeElement).toBe(opener); // untouched: nothing moved it, and nothing put it back
	});
});

describe("reduced motion", () => {
	it("switches off the shell's own small transitions under prefers-reduced-motion", () => {
		const src = readFileSync(join(process.cwd(), "src/shell/FlexShell.vue"), "utf8");
		const block = /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.flex-grid \.vgl-item[^}]*\}/.exec(src);
		expect(block, "FlexShell.vue lost its reduced-motion rule for the grid").not.toBeNull();
		expect(block![0]).toContain("transition: none !important");
	});
});
