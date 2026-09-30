import { flushPromises } from "@vue/test-utils";
import { lastCode, mountInDwc, sentCodes, setConnected, setUiFrozen } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import HotkeyField from "../src/editor/HotkeyField.vue";
import { dispatchHotkey, installHotkeys, registeredHotkeys, resetHotkeysForTests } from "../src/model/hotkeys";
import CommandButtonWidget from "../src/widgets/CommandButtonWidget.vue";
import ToggleWidget from "../src/widgets/ToggleWidget.vue";

const press = (code: string, init: Partial<KeyboardEventInit> = {}) => {
	const e = new KeyboardEvent("keydown", { code, key: code.replace(/^Key/, "").toLowerCase(), bubbles: true, cancelable: true, ...init });
	return { e, fired: dispatchHotkey(e) };
};

beforeEach(() => {
	const map = new Map<string, string>();
	vi.stubGlobal("localStorage", { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) });
	resetHotkeysForTests();
	setConnected(true);
});
afterEach(() => {
	resetHotkeysForTests();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

const button = (extra: Record<string, unknown> = {}) => ({ type: "codeButton" as const, code: "G28", label: "Home", hotkey: "Mod+Shift+H", ...extra });

describe("command button hotkey", () => {
	it("sends the button's code through the same path as a click", async () => {
		mountInDwc(CommandButtonWidget, { props: { widget: button() } });
		expect(press("KeyH", { ctrlKey: true, shiftKey: true }).fired).toBe(true);
		await flushPromises();
		expect(lastCode()).toBe("G28");
	});

	it("only listens while mounted", async () => {
		const w = mountInDwc(CommandButtonWidget, { props: { widget: button() } });
		expect(registeredHotkeys()).toEqual(["Mod+Shift+H"]);
		w.unmount();
		expect(registeredHotkeys()).toEqual([]);
		expect(press("KeyH", { ctrlKey: true, shiftKey: true }).fired).toBe(false);
		await flushPromises();
		expect(sentCodes()).toEqual([]);
	});

	it("re-binds when the shortcut is edited, and drops it when cleared", async () => {
		const w = mountInDwc(CommandButtonWidget, { props: { widget: button() } });
		await w.setProps({ widget: button({ hotkey: "F7" }) });
		expect(registeredHotkeys()).toEqual(["F7"]);
		expect(press("KeyH", { ctrlKey: true, shiftKey: true }).fired).toBe(false);
		expect(press("F7").fired).toBe(true);
		await w.setProps({ widget: button({ hotkey: undefined }) });
		expect(registeredHotkeys()).toEqual([]);
	});

	it("does nothing (and says 'locked') when the widget is disabled - print lock, access lock, a condition", async () => {
		const onLocked = vi.fn();
		installHotkeys({ isEditing: () => false, onLocked });
		mountInDwc(CommandButtonWidget, { props: { widget: button(), disabled: true } });
		expect(press("KeyH", { ctrlKey: true, shiftKey: true }).fired).toBe(true); // it was the widget's key...
		await flushPromises();
		expect(sentCodes()).toEqual([]); // ...but nothing was sent
		expect(onLocked).toHaveBeenCalledWith("Mod+Shift+H");
	});

	it("does nothing while DWC's UI is frozen", async () => {
		mountInDwc(CommandButtonWidget, { props: { widget: button() } });
		setUiFrozen(true);
		press("KeyH", { ctrlKey: true, shiftKey: true });
		await flushPromises();
		expect(sentCodes()).toEqual([]);
		setUiFrozen(false);
	});

	it("still asks for confirmation when the button is set to confirm", async () => {
		const w = mountInDwc(CommandButtonWidget, { props: { widget: button({ confirm: true }), attach: true } as never });
		press("KeyH", { ctrlKey: true, shiftKey: true });
		await flushPromises();
		expect(sentCodes()).toEqual([]); // waiting on the dialog, not sent
		expect((w.vm as unknown as { confirmOpen: boolean }).confirmOpen).toBe(true);
	});

	it("keeps the debounce: a second press inside the window is ignored", async () => {
		mountInDwc(CommandButtonWidget, { props: { widget: button({ debounceMs: 60_000 }) } });
		press("KeyH", { ctrlKey: true, shiftKey: true });
		await flushPromises();
		press("KeyH", { ctrlKey: true, shiftKey: true });
		await flushPromises();
		expect(sentCodes()).toEqual(["G28"]);
	});

	it("is not triggered by a widget without a hotkey", () => {
		mountInDwc(CommandButtonWidget, { props: { widget: button({ hotkey: undefined }) } });
		expect(registeredHotkeys()).toEqual([]);
	});

	it("does not run while a dialog is open", async () => {
		mountInDwc(CommandButtonWidget, { props: { widget: button() } });
		document.body.innerHTML = '<div class="v-overlay--active"></div>';
		expect(press("KeyH", { ctrlKey: true, shiftKey: true }).fired).toBe(false);
		await flushPromises();
		expect(sentCodes()).toEqual([]);
	});

	it("shows a key badge only when asked to", () => {
		const off = mountInDwc(CommandButtonWidget, { props: { widget: button() } });
		expect(off.find(".fl-hotkey-badge").exists()).toBe(false);
		const on = mountInDwc(CommandButtonWidget, { props: { widget: button({ hotkeyBadge: true }) } });
		expect(on.find(".fl-hotkey-badge").exists()).toBe(true);
		expect(on.find(".fl-hotkey-badge").text()).toMatch(/H$/);
	});

	it("works on a shaped button too", async () => {
		mountInDwc(CommandButtonWidget, { props: { widget: button({ shape: { kind: "polygon", sides: 6 } }) } });
		press("KeyH", { ctrlKey: true, shiftKey: true });
		await flushPromises();
		expect(lastCode()).toBe("G28");
	});
});

describe("toggle hotkey", () => {
	const toggle = (extra: Record<string, unknown> = {}) => ({ type: "toggle" as const, label: "ATX", onCommand: "M80", offCommand: "M81", hotkey: "F8", ...extra });

	it("flips the toggle and sends the matching command, like a click", async () => {
		mountInDwc(ToggleWidget, { props: { widget: toggle() } });
		press("F8");
		await flushPromises();
		expect(lastCode()).toBe("M80");
		press("F8");
		await flushPromises();
		expect(lastCode()).toBe("M81");
	});

	it("does nothing when disabled", async () => {
		mountInDwc(ToggleWidget, { props: { widget: toggle(), disabled: true } });
		press("F8");
		await flushPromises();
		expect(sentCodes()).toEqual([]);
	});

	it("unbinds on unmount", () => {
		const w = mountInDwc(ToggleWidget, { props: { widget: toggle() } });
		expect(registeredHotkeys()).toEqual(["F8"]);
		w.unmount();
		expect(registeredHotkeys()).toEqual([]);
	});
});

describe("a widget hidden by a condition is not bound (it is not mounted)", () => {
	it("models the shell's v-if: unmounting drops the binding", async () => {
		const show = ref(true);
		const Host = defineComponent({ setup: () => () => (show.value ? h(CommandButtonWidget, { widget: button() }) : null) });
		mountInDwc(Host);
		expect(registeredHotkeys()).toEqual(["Mod+Shift+H"]);
		show.value = false;
		await nextTick();
		expect(registeredHotkeys()).toEqual([]);
		expect(press("KeyH", { ctrlKey: true, shiftKey: true }).fired).toBe(false);
	});
});

describe("HotkeyField (the recorder)", () => {
	const keydown = (w: ReturnType<typeof mountInDwc>, init: KeyboardEventInit & { code: string; key: string }) => {
		const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
		w.find("input").element.dispatchEvent(e);
		return e;
	};

	it("records a valid combination", async () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: undefined } });
		const e = keydown(w, { code: "KeyH", key: "h", ctrlKey: true, shiftKey: true });
		await nextTick();
		expect(e.defaultPrevented).toBe(true);
		expect(w.emitted("update:modelValue")?.[0]).toEqual(["Mod+Shift+H"]);
	});

	it("rejects a reserved combination and explains why, without emitting", async () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: undefined } });
		keydown(w, { code: "KeyW", key: "w", ctrlKey: true });
		await nextTick();
		expect(w.emitted("update:modelValue")).toBeUndefined();
		expect(w.text()).toContain("problem.reserved");
	});

	it("rejects a plain key and says a modifier is needed", async () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: undefined } });
		keydown(w, { code: "KeyH", key: "h" });
		await nextTick();
		expect(w.emitted("update:modelValue")).toBeUndefined();
		expect(w.text()).toContain("problem.needsModifier");
	});

	it("accepts a lone F-key", () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: undefined } });
		keydown(w, { code: "F7", key: "F7" });
		expect(w.emitted("update:modelValue")?.[0]).toEqual(["F7"]);
	});

	it("waits through a bare modifier press", () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: undefined } });
		keydown(w, { code: "ControlLeft", key: "Control", ctrlKey: true });
		expect(w.emitted("update:modelValue")).toBeUndefined();
	});

	it("Backspace clears; Tab is left alone so focus can move on (no keyboard trap)", () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: "F7" } });
		const tab = keydown(w, { code: "Tab", key: "Tab" });
		expect(tab.defaultPrevented).toBe(false);
		expect(w.emitted("update:modelValue")).toBeUndefined();
		keydown(w, { code: "Backspace", key: "Backspace" });
		expect(w.emitted("update:modelValue")?.[0]).toEqual([undefined]);
	});

	it("has a clear button once there is a shortcut", async () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: "F7" } });
		await w.find(".hotkey-clear").trigger("click");
		expect(w.emitted("update:modelValue")?.[0]).toEqual([undefined]);
	});

	it("flags a shortcut another widget on the page already uses", () => {
		const w = mountInDwc(HotkeyField, { props: { modelValue: "F7", taken: ["ctrl+shift+h", "f7"] } });
		expect(w.text()).toContain("hotkey.duplicate");
		const w2 = mountInDwc(HotkeyField, { props: { modelValue: "F7", taken: ["F8"] } });
		expect(w2.text()).not.toContain("hotkey.duplicate");
	});
});
