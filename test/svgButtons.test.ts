import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { lastCode, mountInDwc, sentCodes, setConnected } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref, withDirectives } from "vue";

import { ringNavigation, vSvgButton } from "../src/util/svgButton";
import CommandButtonWidget from "../src/widgets/CommandButtonWidget.vue";
import HotspotWidget from "../src/widgets/HotspotWidget.vue";
import JogWidget from "../src/widgets/JogWidget.vue";
import OctopusJogWidget from "../src/widgets/OctopusJogWidget.vue";
import { createDefaultWidget } from "../src/model/document";

enableAutoUnmount(afterEach);
beforeEach(() => setConnected(true));

const key = (k: string) => new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });

describe("v-svg-button directive", () => {
	function host(opts: { label: string; disabled?: boolean; tabindex?: 0 | -1 }, onClick: () => void) {
		return mountInDwc(defineComponent({
			setup: () => () => h("svg", [withDirectives(h("path", { d: "M0 0", onClick }), [[vSvgButton, opts]])]),
		}));
	}

	it("makes the element a named button and a tab stop", () => {
		const w = host({ label: "X+10" }, () => {});
		const p = w.find("path");
		expect(p.attributes("role")).toBe("button");
		expect(p.attributes("aria-label")).toBe("X+10");
		expect(p.attributes("tabindex")).toBe("0");
		expect(p.classes()).toContain("fl-svg-button");
		expect(p.attributes("aria-disabled")).toBeUndefined();
	});

	it("Enter and Space fire the element's own click handler, and stop Space scrolling the page", async () => {
		let clicks = 0;
		const w = host({ label: "go" }, () => { clicks++; });
		const p = w.find("path").element;
		const enter = key("Enter");
		p.dispatchEvent(enter);
		const space = key(" ");
		p.dispatchEvent(space);
		expect(clicks).toBe(2);
		expect(enter.defaultPrevented).toBe(true);
		expect(space.defaultPrevented).toBe(true);
	});

	it("ignores other keys", () => {
		let clicks = 0;
		const w = host({ label: "go" }, () => { clicks++; });
		for (const k of ["a", "ArrowRight", "Tab", "Escape"]) { w.find("path").element.dispatchEvent(key(k)); }
		expect(clicks).toBe(0);
	});

	it("does nothing when disabled, is announced as disabled, and is skipped by Tab", () => {
		let clicks = 0;
		const w = host({ label: "go", disabled: true }, () => { clicks++; });
		const p = w.find("path");
		expect(p.attributes("aria-disabled")).toBe("true");
		expect(p.attributes("tabindex")).toBe("-1");
		p.element.dispatchEvent(key("Enter"));
		expect(clicks).toBe(0);
	});

	it("follows the options as they change", async () => {
		const label = ref("one");
		const disabled = ref(false);
		const w = mountInDwc(defineComponent({
			setup: () => () => h("svg", [withDirectives(h("path"), [[vSvgButton, { label: label.value, disabled: disabled.value }]])]),
		}));
		label.value = "two"; disabled.value = true;
		await nextTick();
		expect(w.find("path").attributes("aria-label")).toBe("two");
		expect(w.find("path").attributes("aria-disabled")).toBe("true");
		disabled.value = false;
		await nextTick();
		expect(w.find("path").attributes("aria-disabled")).toBeUndefined();
	});

	it("a roving group can hold its non-current members out of the tab order", () => {
		const w = host({ label: "x", tabindex: -1 }, () => {});
		expect(w.find("path").attributes("tabindex")).toBe("-1");
	});

	it("accepts a plain string as the label", () => {
		const w = mountInDwc(defineComponent({ setup: () => () => h("svg", [withDirectives(h("path"), [[vSvgButton, "Home"]])]) }));
		expect(w.find("path").attributes("aria-label")).toBe("Home");
	});
});

describe("ringNavigation", () => {
	// four directions clockwise, three rings each (outer -> inner)
	const dirs = [["u0", "u1", "u2"], ["r0", "r1", "r2"], ["d0", "d1", "d2"], ["l0", "l1", "l2"]];

	it("Left/Right go round the pad on the same ring, wrapping", () => {
		expect(ringNavigation(dirs, "u1", "ArrowRight")).toBe("r1");
		expect(ringNavigation(dirs, "l1", "ArrowRight")).toBe("u1");
		expect(ringNavigation(dirs, "u1", "ArrowLeft")).toBe("l1");
		expect(ringNavigation(dirs, "r2", "ArrowLeft")).toBe("u2");
	});

	it("Up goes to the next ring OUT, Down to the next ring IN, stopping at the ends", () => {
		expect(ringNavigation(dirs, "u1", "ArrowUp")).toBe("u0");
		expect(ringNavigation(dirs, "u1", "ArrowDown")).toBe("u2");
		expect(ringNavigation(dirs, "u0", "ArrowUp")).toBeNull();
		expect(ringNavigation(dirs, "u2", "ArrowDown")).toBeNull();
	});

	it("Home and End jump to the outermost and innermost ring", () => {
		expect(ringNavigation(dirs, "r1", "Home")).toBe("r0");
		expect(ringNavigation(dirs, "r1", "End")).toBe("r2");
		expect(ringNavigation(dirs, "r0", "Home")).toBeNull();
	});

	it("ignores other keys and unknown ids", () => {
		expect(ringNavigation(dirs, "u1", "a")).toBeNull();
		expect(ringNavigation(dirs, "u1", "Enter")).toBeNull();
		expect(ringNavigation(dirs, "nope", "ArrowRight")).toBeNull();
	});

	it("copes with a single direction or a single ring", () => {
		expect(ringNavigation([["a"]], "a", "ArrowRight")).toBeNull();
		expect(ringNavigation([["a", "b"]], "a", "ArrowDown")).toBe("b");
	});
});

describe("Jog widget keyboard access", () => {
	const jog = () => createDefaultWidget("jog") as Extract<ReturnType<typeof createDefaultWidget>, { type: "jog" }>;

	it("the ring pad is ONE tab stop, every sector is a named button", async () => {
		const w = mountInDwc(JogWidget, { props: { widget: jog() } });
		await flushPromises();
		const sectors = w.findAll(".jog-sector");
		expect(sectors.length).toBeGreaterThanOrEqual(8);
		expect(sectors.every((s) => s.attributes("role") === "button" && !!s.attributes("aria-label"))).toBe(true);
		expect(sectors.filter((s) => s.attributes("tabindex") === "0")).toHaveLength(1);
	});

	it("Enter on a sector jogs, through the same guarded path as a click", async () => {
		const w = mountInDwc(JogWidget, { props: { widget: jog() } });
		await flushPromises();
		w.findAll(".jog-sector")[0].element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(lastCode()).toMatch(/G91[\s\S]*G1 /);
	});

	it("a disabled jog pad does not move from the keyboard", async () => {
		const w = mountInDwc(JogWidget, { props: { widget: jog(), disabled: true } });
		await flushPromises();
		const first = w.findAll(".jog-sector")[0];
		expect(first.attributes("aria-disabled")).toBe("true");
		first.element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(sentCodes()).toEqual([]);
	});

	it("arrow keys move the pad's single tab stop", async () => {
		const w = mountInDwc(JogWidget, { props: { widget: jog() }, attachTo: document.body });
		await flushPromises();
		const stopBefore = w.findAll(".jog-sector").find((s) => s.attributes("tabindex") === "0")!;
		const idBefore = stopBefore.attributes("data-sector");
		stopBefore.element.dispatchEvent(key("ArrowRight"));
		await flushPromises();
		const stopAfter = w.findAll(".jog-sector").filter((s) => s.attributes("tabindex") === "0");
		expect(stopAfter).toHaveLength(1);
		expect(stopAfter[0].attributes("data-sector")).not.toBe(idBefore);
	});

	it("the home hub is keyboard-operable too", async () => {
		const w = mountInDwc(JogWidget, { props: { widget: jog() } });
		await flushPromises();
		const hub = w.find(".jog-hub");
		expect(hub.attributes("role")).toBe("button");
		hub.element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(lastCode()).toContain("G28");
	});
});

describe("Octopus jog keyboard access", () => {
	const oct = () => createDefaultWidget("octopusJog") as Extract<ReturnType<typeof createDefaultWidget>, { type: "octopusJog" }>;

	it("one tab stop across all eight arms, and Right walks the arms clockwise incl. diagonals", async () => {
		const w = mountInDwc(OctopusJogWidget, { props: { widget: oct() } });
		await flushPromises();
		const sectors = w.findAll(".oct-sector");
		expect(sectors.length).toBeGreaterThan(16);
		expect(sectors.filter((s) => s.attributes("tabindex") === "0")).toHaveLength(1);
		const first = sectors.find((s) => s.attributes("tabindex") === "0")!;
		const seen = [first.attributes("data-sector")!];
		let cur = first;
		for (let i = 0; i < 3; i++) {
			cur.element.dispatchEvent(key("ArrowRight"));
			await flushPromises();
			cur = w.findAll(".oct-sector").find((s) => s.attributes("tabindex") === "0")!;
			seen.push(cur.attributes("data-sector")!);
		}
		// same ring throughout, alternating cardinal (c-) and diagonal (d-) arms
		const ring = (id: string) => id.split("-").pop();
		expect(new Set(seen.map(ring)).size).toBe(1);
		expect(seen.map((s) => s[0])).toEqual(["c", "d", "c", "d"]);
	});

	it("Enter on an arm jogs", async () => {
		const w = mountInDwc(OctopusJogWidget, { props: { widget: oct() } });
		await flushPromises();
		w.findAll(".oct-sector")[0].element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(lastCode()).toMatch(/G1 /);
	});

	it("without diagonals the pad still has exactly one tab stop", async () => {
		const w = mountInDwc(OctopusJogWidget, { props: { widget: { ...oct(), showDiagonals: false } } });
		await flushPromises();
		expect(w.findAll(".oct-sector").filter((s) => s.attributes("tabindex") === "0")).toHaveLength(1);
	});
});

describe("shaped button and shaped hotspot keyboard access", () => {
	it("a shaped command button is a named, focusable button that Enter presses", async () => {
		const w = mountInDwc(CommandButtonWidget, { props: { widget: { type: "codeButton", code: "G28", label: "Home", shape: { kind: "polygon", sides: 6 } } } });
		const outer = w.find(".cmd-shaped-outer");
		expect(outer.attributes("role")).toBe("button");
		expect(outer.attributes("aria-label")).toBe("Home");
		expect(outer.attributes("tabindex")).toBe("0");
		outer.element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(lastCode()).toBe("G28");
	});

	it("a disabled shaped button is not pressable from the keyboard", async () => {
		const w = mountInDwc(CommandButtonWidget, { props: { widget: { type: "codeButton", code: "G28", label: "Home", shape: { kind: "polygon", sides: 6 } }, disabled: true } });
		const outer = w.find(".cmd-shaped-outer");
		expect(outer.attributes("aria-disabled")).toBe("true");
		outer.element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(sentCodes()).toEqual([]);
	});

	it("a shaped hotspot region is keyboard-operable", async () => {
		const widget = { type: "hotspot" as const, url: "http://x/y.png", regions: [{ x: 10, y: 10, w: 20, h: 20, command: "M999", label: "Reset", shape: { kind: "ellipse" as const } }] };
		const w = mountInDwc(HotspotWidget, { props: { widget } });
		await flushPromises();
		const path = w.find(".hs-region-path");
		expect(path.attributes("role")).toBe("button");
		expect(path.attributes("aria-label")).toBe("Reset");
		path.element.dispatchEvent(key(" "));
		await flushPromises();
		expect(lastCode()).toBe("M999");
	});
});
