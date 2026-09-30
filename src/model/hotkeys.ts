/**
 * Keyboard shortcuts for buttons (MISSING-FEATURES-PLAN §B2).
 *
 * A hotkey is stored on the widget as a canonical, platform-neutral string: modifiers in the fixed order
 * `Mod`, `Alt`, `Shift`, then the key - `Mod+Shift+H`, `F7`, `Alt+1`. `Mod` is Ctrl on Windows/Linux and the Command
 * key on macOS, so a layout shared between machines means the same thing on each. Letters and digits are matched by
 * physical key (`event.code`), not by the character produced, so a shortcut keeps working on a non-US layout.
 *
 * Widgets REGISTER on mount and UNREGISTER on unmount (composables/useHotkey.ts), so only widgets that are actually on
 * screen respond - a widget on another page, or hidden by a condition, is not mounted and therefore not bound.
 * Activation goes through the widget's own click path (its `activate()`), so confirm dialogs, debounce, the print
 * lock, the access lock and a disabling condition all apply exactly as they do to a click; a hotkey is never a way
 * around them.
 *
 * One `keydown` listener does the dispatching. It stands down while typing, while a dialog is open, on key repeat,
 * and (by default) while editing the layout.
 */
import { ref } from "vue";

export type HotkeyResult = "ok" | "locked";

/** What a widget hands the dispatcher: run the widget's own click path and say whether it was allowed to. */
export type HotkeyActivator = () => HotkeyResult | void | Promise<HotkeyResult | void>;

// #region canonical form
const MODIFIER_ORDER = ["Mod", "Alt", "Shift"] as const;

/** Named keys a combo may use besides letters, digits and F1-F24. */
const NAMED_KEYS = new Set([
	"Enter", "Space", "Tab", "Backspace", "Delete", "Escape", "Insert", "Home", "End", "PageUp", "PageDown",
	"ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
	"Minus", "Equal", "Comma", "Period", "Slash", "Semicolon", "Quote", "BracketLeft", "BracketRight", "Backslash", "Backquote",
]);

const isFunctionKey = (key: string): boolean => /^F([1-9]|1\d|2[0-4])$/.test(key);
const isLetterOrDigit = (key: string): boolean => /^[A-Z0-9]$/.test(key);
const isKey = (key: string): boolean => isLetterOrDigit(key) || isFunctionKey(key) || NAMED_KEYS.has(key);

/** `event.code` -> the key part of a combo, or null when it is not a key we bind (a bare modifier, media key...). */
function keyFromCode(code: string, key: string): string | null {
	if (/^Key[A-Z]$/.test(code)) { return code.slice(3); }
	if (/^Digit[0-9]$/.test(code)) { return code.slice(5); }
	if (/^Numpad[0-9]$/.test(code)) { return code.slice(6); }
	if (isFunctionKey(code)) { return code; }
	if (NAMED_KEYS.has(code)) { return code; }
	if (code === "NumpadEnter") { return "Enter"; }
	// Some environments give no `code` (synthetic events); fall back to what was typed.
	if (!code) {
		if (key.length === 1 && /[a-z0-9]/i.test(key)) { return key.toUpperCase(); }
		if (isFunctionKey(key) || NAMED_KEYS.has(key)) { return key; }
		if (key === " ") { return "Space"; }
	}
	return null;
}

export function isMacPlatform(): boolean {
	if (typeof navigator === "undefined") { return false; }
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	return /Mac|iPhone|iPad|iPod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent || "");
}

const PUNCTUATION: Record<string, string> = {
	"-": "Minus", "=": "Equal", ",": "Comma", ".": "Period", "/": "Slash", ";": "Semicolon", "'": "Quote",
	"[": "BracketLeft", "]": "BracketRight", "\\": "Backslash", "`": "Backquote",
};
const KEY_ALIASES: Record<string, string> = { esc: "Escape", del: "Delete", return: "Enter", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", pgup: "PageUp", pgdn: "PageDown", ins: "Insert" };

/** Typed text for the key part of a combo -> its canonical name (`h` -> `H`, `f7` -> `F7`, `-` -> `Minus`, `esc` -> `Escape`). */
function normalizeKeyName(raw: string): string {
	if (raw.length === 1) { return PUNCTUATION[raw] ?? raw.toUpperCase(); }
	const lower = raw.toLowerCase();
	if (isFunctionKey(raw.toUpperCase())) { return raw.toUpperCase(); }
	if (KEY_ALIASES[lower]) { return KEY_ALIASES[lower]; }
	for (const name of NAMED_KEYS) { if (name.toLowerCase() === lower) { return name; } }
	return raw;
}

/**
 * Normalise user-typed or stored text to the canonical form, or null when it is not a valid combination of
 * modifiers and a bindable key. Accepts `ctrl`/`cmd`/`command`/`meta`/`control` as `Mod`, any order and case.
 */
export function canonicalizeHotkey(input: string | undefined | null): string | null {
	if (!input) { return null; }
	const parts = input.split("+").map((p) => p.trim()).filter(Boolean);
	if (parts.length === 0) { return null; }
	const mods = new Set<string>();
	let key: string | null = null;
	for (let i = 0; i < parts.length; i++) {
		const raw = parts[i];
		const lower = raw.toLowerCase();
		if (["mod", "ctrl", "control", "cmd", "command", "meta"].includes(lower) && i < parts.length - 1) { mods.add("Mod"); continue; }
		if (["alt", "option", "opt"].includes(lower) && i < parts.length - 1) { mods.add("Alt"); continue; }
		if (lower === "shift" && i < parts.length - 1) { mods.add("Shift"); continue; }
		if (i !== parts.length - 1 || key !== null) { return null; }
		key = normalizeKeyName(raw);
	}
	if (key === null || !isKey(key)) { return null; }
	return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** The canonical combo a keydown event represents, or null (a bare modifier press, an unbindable key, or a
 *  modifier this scheme cannot express: Ctrl on a Mac, or the Windows key elsewhere). */
export function eventToHotkey(e: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac = isMacPlatform()): string | null {
	const key = keyFromCode(e.code, e.key);
	if (!key) { return null; }
	const modKey = mac ? e.metaKey : e.ctrlKey;
	const foreign = mac ? e.ctrlKey : e.metaKey;
	if (foreign) { return null; }
	const mods = [modKey ? "Mod" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
	return [...mods, key].join("+");
}

const KEY_LABEL: Record<string, string> = {
	Space: "Space", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
	BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`",
	ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Delete: "Del", PageUp: "PgUp", PageDown: "PgDn",
};

/** Human text for a combo: `Ctrl+Shift+H` on PC, `⌘⇧H` on a Mac. Falls back to the raw text when it is not canonical. */
export function formatHotkey(combo: string | undefined | null, mac = isMacPlatform()): string {
	const canonical = canonicalizeHotkey(combo);
	if (!canonical) { return combo ?? ""; }
	const parts = canonical.split("+");
	const key = parts[parts.length - 1];
	const label = KEY_LABEL[key] ?? key;
	const mods = parts.slice(0, -1);
	if (mac) {
		return mods.map((m) => (m === "Mod" ? "⌘" : m === "Alt" ? "⌥" : "⇧")).join("") + label;
	}
	return [...mods.map((m) => (m === "Mod" ? "Ctrl" : m)), label].join("+");
}
// #endregion

// #region validity
export type HotkeyProblem = "invalid" | "needsModifier" | "reserved";
export type HotkeyValidation = { ok: true; combo: string } | { ok: false; reason: HotkeyProblem };

/**
 * Combos the browser or OS owns, and ones that would break editing or FL's own shortcuts. Binding them either
 * cannot work (the browser takes them first), or would be hostile (Ctrl+C no longer copies).
 */
const RESERVED = new Set([
	// Browser / OS
	"Mod+W", "Mod+T", "Mod+N", "Mod+R", "Mod+L", "Mod+Q", "Mod+Tab", "Mod+Shift+T", "Mod+Shift+N", "Mod+Shift+W",
	"Mod+Shift+R", "Mod+Shift+Tab", "Mod+Shift+Q", "Mod+M", "Mod+H", "Mod+Space",
	"Mod+PageUp", "Mod+PageDown", "Mod+Alt+ArrowLeft", "Mod+Alt+ArrowRight",
	"F5", "F11", "F12", "Alt+F4", "Alt+Tab", "Alt+Space", "Alt+ArrowLeft", "Alt+ArrowRight", "Alt+Home",
	"Mod+F5", "Mod+Shift+I", "Mod+Shift+J", "Mod+Shift+C", "Mod+Alt+I", "Mod+Alt+J", "Mod+Alt+C", "Mod+Shift+Delete", "Mod+Shift+P",
	"Mod+F4", "Mod+Alt+Delete",
	// Editing and FL's own shortcuts (Flexible Layouts uses Mod+C/X/V/D/Z/Y while editing)
	"Mod+C", "Mod+X", "Mod+V", "Mod+A", "Mod+Z", "Mod+Y", "Mod+Shift+Z", "Mod+D",
	// Other things people expect to keep working
	"Mod+S", "Mod+P", "Mod+F", "Mod+G", "Mod+O", "Mod+U", "Mod+J", "Mod+K", "Mod+E", "Mod+Minus", "Mod+Equal", "Mod+0",
]);

/**
 * Is this combo one we will bind? It needs `Mod` or `Alt` (a letter with at most Shift is just typing) unless it is an
 * F-key, and it must not be reserved. Pass the raw text or an already-canonical combo.
 */
export function validateHotkey(input: string | undefined | null): HotkeyValidation {
	const combo = canonicalizeHotkey(input);
	if (!combo) { return { ok: false, reason: "invalid" }; }
	const parts = combo.split("+");
	const key = parts[parts.length - 1];
	const mods = parts.slice(0, -1);
	if (!isFunctionKey(key) && !mods.includes("Mod") && !mods.includes("Alt")) { return { ok: false, reason: "needsModifier" }; }
	if (RESERVED.has(combo)) { return { ok: false, reason: "reserved" }; }
	return { ok: true, combo };
}

/** Combos that appear more than once in `combos` (canonicalised) - for the "already used on this page" warning. */
export function duplicateHotkeys(combos: Array<string | undefined | null>): Array<string> {
	const seen = new Set<string>();
	const dup = new Set<string>();
	for (const raw of combos) {
		const c = canonicalizeHotkey(raw);
		if (!c) { continue; }
		if (seen.has(c)) { dup.add(c); } else { seen.add(c); }
	}
	return [...dup];
}
// #endregion

// #region dispatcher
interface Binding { id: symbol; combo: string; activate: HotkeyActivator }

const bindings: Array<Binding> = [];

// Per-device switches (localStorage, not the shared document).
const MASTER_KEY = "flexibleLayouts.hotkeys";
const EDITING_KEY = "flexibleLayouts.hotkeysWhileEditing";
function readBool(key: string, fallback: boolean): boolean {
	try { const v = localStorage.getItem(key); return v === null ? fallback : v === "1"; } catch { return fallback; }
}
function writeBool(key: string, on: boolean): void {
	try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* storage blocked */ }
}
/** Hotkeys on at all, on this device. */
export const hotkeysEnabled = ref(readBool(MASTER_KEY, true));
/** Also respond while the layout is being edited (off by default: editing is when you press keys for other reasons). */
export const hotkeysWhileEditing = ref(readBool(EDITING_KEY, false));
export function setHotkeysEnabled(on: boolean): void { hotkeysEnabled.value = on; writeBool(MASTER_KEY, on); }
export function setHotkeysWhileEditing(on: boolean): void { hotkeysWhileEditing.value = on; writeBool(EDITING_KEY, on); }

/** Bind `combo` to `activate` until the returned function is called. An invalid/reserved combo is silently not bound. */
export function registerHotkey(combo: string | undefined | null, activate: HotkeyActivator): () => void {
	const v = validateHotkey(combo);
	if (!v.ok) { return () => {}; }
	const binding: Binding = { id: Symbol("hotkey"), combo: v.combo, activate };
	bindings.push(binding);
	return () => {
		const i = bindings.indexOf(binding);
		if (i >= 0) { bindings.splice(i, 1); }
	};
}

export function registeredHotkeys(): Array<string> {
	return bindings.map((b) => b.combo);
}

/** Should this keydown be left to the page (typing, a dialog, key repeat, editing)? */
export function shouldStandDown(e: KeyboardEvent, editing: boolean): boolean {
	if (e.repeat || e.isComposing || e.defaultPrevented) { return true; }
	if (editing && !hotkeysWhileEditing.value) { return true; }
	const el = e.target as HTMLElement | null;
	if (el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .monaco-editor')) { return true; }
	if (typeof document !== "undefined" && document.querySelector(".v-overlay--active")) { return true; }
	return false;
}

/** Wired up by the shell with the edit-mode flag and the "locked" toast, so this file stays free of stores. */
export interface DispatchHooks {
	isEditing: () => boolean;
	onLocked?: (combo: string) => void;
}

let hooks: DispatchHooks = { isEditing: () => false };

/** Handle one keydown. Returns true when it triggered a widget (and the browser's own handling was prevented). */
export function dispatchHotkey(e: KeyboardEvent): boolean {
	if (!hotkeysEnabled.value || bindings.length === 0) { return false; }
	if (shouldStandDown(e, hooks.isEditing())) { return false; }
	const combo = eventToHotkey(e);
	if (!combo) { return false; }
	const binding = bindings.find((b) => b.combo === combo);
	if (!binding) { return false; }
	e.preventDefault();
	let outcome: ReturnType<HotkeyActivator>;
	try {
		outcome = binding.activate();
	} catch {
		return true; // a widget's own bug must not break the keyboard handler; the key was still ours
	}
	void Promise.resolve(outcome).then((result) => {
		if (result === "locked") { hooks.onLocked?.(combo); }
	}, () => { /* the widget reports its own failures */ });
	return true;
}

let listener: ((e: KeyboardEvent) => void) | null = null;

/** Install the single global listener (idempotent). Returns its uninstaller. */
export function installHotkeys(h: DispatchHooks): () => void {
	hooks = h;
	if (!listener && typeof window !== "undefined") {
		listener = (e) => { dispatchHotkey(e); };
		window.addEventListener("keydown", listener);
	}
	return uninstallHotkeys;
}
export function uninstallHotkeys(): void {
	if (listener && typeof window !== "undefined") { window.removeEventListener("keydown", listener); }
	listener = null;
	hooks = { isEditing: () => false };
}

export function resetHotkeysForTests(): void {
	bindings.length = 0;
	uninstallHotkeys();
	hotkeysEnabled.value = readBool(MASTER_KEY, true);
	hotkeysWhileEditing.value = readBool(EDITING_KEY, false);
}
// #endregion
