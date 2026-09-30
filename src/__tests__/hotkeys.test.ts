import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	canonicalizeHotkey, dispatchHotkey, duplicateHotkeys, eventToHotkey, formatHotkey, hotkeysEnabled, installHotkeys,
	registerHotkey, registeredHotkeys, resetHotkeysForTests, setHotkeysEnabled, setHotkeysWhileEditing, validateHotkey,
} from "../model/hotkeys";

const ev = (init: Partial<KeyboardEventInit> & { code?: string; key?: string }): KeyboardEvent =>
	new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

describe("canonicalizeHotkey", () => {
	it.each([
		["Mod+Shift+H", "Mod+Shift+H"],
		["ctrl+shift+h", "Mod+Shift+H"],
		["Shift+Ctrl+H", "Mod+Shift+H"],
		["cmd+alt+1", "Mod+Alt+1"],
		["command+option+x", "Mod+Alt+X"],
		["f7", "F7"],
		["F24", "F24"],
		["alt+left", "Alt+ArrowLeft"],
		["ctrl+esc", "Mod+Escape"],
		["ctrl+-", "Mod+Minus"],
		["alt+space", "Alt+Space"],
	])("%s -> %s", (input, out) => {
		expect(canonicalizeHotkey(input)).toBe(out);
	});

	it.each(["", "  ", "+", "ctrl", "ctrl+", "shift+alt", "F25", "ctrl+shift+ctrl+", "hello", "ctrl+hello", "a+b"])("rejects %j", (input) => {
		expect(canonicalizeHotkey(input)).toBeNull();
	});

	it("is idempotent", () => {
		for (const c of ["Mod+Shift+H", "F7", "Alt+ArrowUp", "Mod+Alt+Shift+9"]) {
			expect(canonicalizeHotkey(canonicalizeHotkey(c))).toBe(c);
		}
	});

	it("tolerates null/undefined", () => {
		expect(canonicalizeHotkey(undefined)).toBeNull();
		expect(canonicalizeHotkey(null)).toBeNull();
	});
});

describe("eventToHotkey", () => {
	it("maps Ctrl on a PC and Command on a Mac to Mod, by physical key", () => {
		expect(eventToHotkey({ code: "KeyH", key: "h", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, false)).toBe("Mod+Shift+H");
		expect(eventToHotkey({ code: "KeyH", key: "h", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true }, true)).toBe("Mod+Shift+H");
	});

	it("uses the physical key, so a non-US layout still matches (AZERTY 'a' sits on KeyQ)", () => {
		expect(eventToHotkey({ code: "KeyQ", key: "a", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, false)).toBe("Mod+Q");
		expect(eventToHotkey({ code: "Digit1", key: "&", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }, false)).toBe("Alt+1");
	});

	it("rejects the modifier this scheme cannot express (Ctrl on a Mac, the Windows key on a PC)", () => {
		expect(eventToHotkey({ code: "KeyH", key: "h", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, true)).toBeNull();
		expect(eventToHotkey({ code: "KeyH", key: "h", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, false)).toBeNull();
	});

	it("ignores a bare modifier press and unbindable keys", () => {
		expect(eventToHotkey({ code: "ShiftLeft", key: "Shift", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true }, false)).toBeNull();
		expect(eventToHotkey({ code: "AudioVolumeUp", key: "AudioVolumeUp", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, false)).toBeNull();
	});

	it("reads F-keys and named keys", () => {
		expect(eventToHotkey({ code: "F7", key: "F7", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, false)).toBe("F7");
		expect(eventToHotkey({ code: "ArrowUp", key: "ArrowUp", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }, false)).toBe("Alt+ArrowUp");
	});

	it("falls back to the typed key when there is no code (synthetic events)", () => {
		expect(eventToHotkey({ code: "", key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, false)).toBe("Mod+K");
	});
});

describe("formatHotkey", () => {
	it("spells Ctrl+Shift+H on a PC and uses symbols on a Mac", () => {
		expect(formatHotkey("Mod+Shift+H", false)).toBe("Ctrl+Shift+H");
		expect(formatHotkey("Mod+Shift+H", true)).toBe("⌘⇧H");
		expect(formatHotkey("Alt+ArrowUp", false)).toBe("Alt+↑");
		expect(formatHotkey("F7", false)).toBe("F7");
	});
	it("shows non-canonical text as-is and empty as empty", () => {
		expect(formatHotkey("garbage", false)).toBe("garbage");
		expect(formatHotkey(undefined, false)).toBe("");
	});
});

describe("validateHotkey", () => {
	it("accepts Mod/Alt combos and F-keys", () => {
		expect(validateHotkey("ctrl+shift+h")).toEqual({ ok: true, combo: "Mod+Shift+H" });
		expect(validateHotkey("alt+1")).toEqual({ ok: true, combo: "Alt+1" });
		expect(validateHotkey("F7")).toEqual({ ok: true, combo: "F7" });
		expect(validateHotkey("shift+F7")).toEqual({ ok: true, combo: "Shift+F7" });
	});

	it("needs a modifier unless it is an F-key - a plain letter is just typing", () => {
		expect(validateHotkey("h")).toEqual({ ok: false, reason: "needsModifier" });
		expect(validateHotkey("shift+h")).toEqual({ ok: false, reason: "needsModifier" });
		expect(validateHotkey("Enter")).toEqual({ ok: false, reason: "needsModifier" });
	});

	it.each([
		"ctrl+w", "ctrl+t", "ctrl+n", "ctrl+r", "ctrl+l", "ctrl+q", "ctrl+tab", "ctrl+shift+t", "F5", "F11", "F12", "alt+F4", "alt+tab",
		"alt+left", "alt+right",
		"ctrl+c", "ctrl+x", "ctrl+v", "ctrl+a", "ctrl+z", "ctrl+y", "ctrl+d", "ctrl+s", "ctrl+p", "ctrl+f",
	])("rejects the reserved combo %s", (combo) => {
		expect(validateHotkey(combo)).toEqual({ ok: false, reason: "reserved" });
	});

	it("rejects junk as invalid", () => {
		expect(validateHotkey("nope")).toEqual({ ok: false, reason: "invalid" });
		expect(validateHotkey("")).toEqual({ ok: false, reason: "invalid" });
	});
});

describe("duplicateHotkeys", () => {
	it("finds combos used twice, whatever their spelling, and ignores empties", () => {
		expect(duplicateHotkeys(["Mod+Shift+H", "ctrl+shift+h", "F7", undefined, "", "F8"])).toEqual(["Mod+Shift+H"]);
		expect(duplicateHotkeys(["F7", "F8"])).toEqual([]);
	});
});

describe("dispatcher", () => {
	beforeEach(() => {
		const map = new Map<string, string>();
		vi.stubGlobal("localStorage", { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) });
		resetHotkeysForTests();
	});
	afterEach(() => {
		resetHotkeysForTests();
		document.body.innerHTML = "";
		vi.unstubAllGlobals();
	});

	const pressF7 = (init: Partial<KeyboardEventInit> = {}) => ev({ code: "F7", key: "F7", ...init });

	it("runs the registered widget and stops the browser's own handling", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		const e = pressF7();
		expect(dispatchHotkey(e)).toBe(true);
		expect(run).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it("does nothing for an unbound key, and leaves the event alone", () => {
		registerHotkey("F7", vi.fn());
		const e = ev({ code: "F8", key: "F8" });
		expect(dispatchHotkey(e)).toBe(false);
		expect(e.defaultPrevented).toBe(false);
	});

	it("unregisters (widget unmounted / page left)", () => {
		const run = vi.fn();
		const off = registerHotkey("F7", run);
		off();
		expect(dispatchHotkey(pressF7())).toBe(false);
		expect(run).not.toHaveBeenCalled();
		expect(registeredHotkeys()).toEqual([]);
	});

	it("never binds an invalid or reserved combo", () => {
		registerHotkey("ctrl+c", vi.fn());
		registerHotkey("F5", vi.fn());
		registerHotkey("h", vi.fn());
		registerHotkey(undefined, vi.fn());
		expect(registeredHotkeys()).toEqual([]);
	});

	it("runs only the first of two widgets sharing a combo", () => {
		const a = vi.fn(); const b = vi.fn();
		registerHotkey("F7", a);
		registerHotkey("ctrl+shift+f7", b);
		registerHotkey("F7", b);
		dispatchHotkey(pressF7());
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).not.toHaveBeenCalled();
	});

	it("stands down on key repeat", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		expect(dispatchHotkey(pressF7({ repeat: true }))).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it("stands down while typing in a field, a CodeMirror/Monaco editor or a contenteditable", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		for (const html of ["<input>", "<textarea></textarea>", "<select></select>", '<div class="cm-editor"><div class="cm-content"></div></div>', '<div class="monaco-editor"><span></span></div>', '<div contenteditable="true"><span></span></div>']) {
			document.body.innerHTML = html;
			const target = (document.body.querySelector("input, textarea, select, .cm-content, span") as HTMLElement);
			const e = pressF7();
			target.dispatchEvent(e);
			expect(dispatchHotkey(e)).toBe(false);
		}
		expect(run).not.toHaveBeenCalled();
	});

	it("stands down while a dialog is open", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		document.body.innerHTML = '<div class="v-overlay v-overlay--active"></div>';
		expect(dispatchHotkey(pressF7())).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it("is off while editing the layout by default, and on when the device opts in", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		installHotkeys({ isEditing: () => true });
		expect(dispatchHotkey(pressF7())).toBe(false);
		setHotkeysWhileEditing(true);
		expect(dispatchHotkey(pressF7())).toBe(true);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("is switched off entirely by the per-device master switch, which is remembered", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		setHotkeysEnabled(false);
		expect(hotkeysEnabled.value).toBe(false);
		expect(dispatchHotkey(pressF7())).toBe(false);
		resetHotkeysForTests();
		expect(hotkeysEnabled.value).toBe(false); // read back from storage
		setHotkeysEnabled(true);
	});

	it("reports a locked widget instead of acting on it", async () => {
		const onLocked = vi.fn();
		installHotkeys({ isEditing: () => false, onLocked });
		registerHotkey("F7", () => "locked");
		dispatchHotkey(pressF7());
		await Promise.resolve();
		await Promise.resolve();
		expect(onLocked).toHaveBeenCalledWith("F7");
	});

	it("does not report a widget that ran", async () => {
		const onLocked = vi.fn();
		installHotkeys({ isEditing: () => false, onLocked });
		registerHotkey("F7", () => "ok");
		dispatchHotkey(pressF7());
		await Promise.resolve();
		await Promise.resolve();
		expect(onLocked).not.toHaveBeenCalled();
	});

	it("survives an activator that throws", async () => {
		registerHotkey("F7", () => { throw new Error("boom"); });
		expect(() => dispatchHotkey(pressF7())).not.toThrow();
		registerHotkey("F8", async () => { throw new Error("async boom"); });
		expect(() => dispatchHotkey(ev({ code: "F8", key: "F8" }))).not.toThrow();
		await Promise.resolve();
	});

	it("the installed window listener dispatches real key events, and uninstalling stops it", () => {
		const run = vi.fn();
		registerHotkey("F7", run);
		const off = installHotkeys({ isEditing: () => false });
		window.dispatchEvent(pressF7());
		expect(run).toHaveBeenCalledTimes(1);
		off();
		window.dispatchEvent(pressF7());
		expect(run).toHaveBeenCalledTimes(1);
	});
});
