import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBoardFile, isExplorerReplaceEnabled, isNewGcodeEditorEnabled, setExplorerReplaceEnabled, setNewGcodeEditorEnabled, shouldReplaceExplorerPage, shouldUseNewGcodeEditor } from "../model/editorPreference";

// This harness's happy-dom localStorage is a non-functional stub (documented the same way
// elsewhere in this family - duet-gcode-postprocessor's test/component.test.ts, dwc-gcode-postprocessor's
// src/__tests__/autoRun.test.ts) - a scoped in-memory stand-in is the only way to exercise this.
let memoryStorage: Map<string, string>;

beforeEach(() => {
	memoryStorage = new Map();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => memoryStorage.get(key) ?? null,
		setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
		removeItem: (key: string) => { memoryStorage.delete(key); },
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("editorPreference", () => {
	it("defaults to disabled (stock Monaco)", () => {
		expect(isNewGcodeEditorEnabled()).toBe(false);
	});

	it("turns on and persists", () => {
		setNewGcodeEditorEnabled(true);
		expect(isNewGcodeEditorEnabled()).toBe(true);
	});

	it("turns back off", () => {
		setNewGcodeEditorEnabled(true);
		setNewGcodeEditorEnabled(false);
		expect(isNewGcodeEditorEnabled()).toBe(false);
	});
});

describe("shouldUseNewGcodeEditor", () => {
	it("is false for any file when the setting is off, even a print file", () => {
		setNewGcodeEditorEnabled(false);
		expect(shouldUseNewGcodeEditor("0:/gcodes/part.gcode")).toBe(false);
	});

	it("is true for a G-code-syntax file when the setting is on", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/gcodes/part.gcode")).toBe(true);
		expect(shouldUseNewGcodeEditor("0:/sys/config.g")).toBe(true);
	});

	it("recognises a well-known RRF file by name even without a .g/.gcode extension", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/sys/config-override.g")).toBe(true);
	});

	it("is false even when the setting is on for a file it has no support for (plain text)", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/sys/notes.txt")).toBe(false);
	});

	it("is true for the STM32 board.txt when the setting is on, and false when it is off", () => {
		expect(shouldUseNewGcodeEditor("0:/sys/board.txt")).toBe(false);
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/sys/board.txt")).toBe(true);
		expect(isBoardFile("0:/sys/board.txt")).toBe(true);
		expect(isBoardFile("0:/sys/config.g")).toBe(false);
	});

	it("is true for a 12864 menu file when the setting is on - its unsaved text feeds the display preview", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/menu/main")).toBe(true);
		expect(shouldUseNewGcodeEditor("0:/menu/listFiles")).toBe(true);
		setNewGcodeEditorEnabled(false);
		expect(shouldUseNewGcodeEditor("0:/menu/main")).toBe(false);
	});

	it("keeps a menu image (.bin) in the standard editor's hands", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/menu/logo.bin")).toBe(false);
	});
});

describe("shouldReplaceExplorerPage", () => {
	it("defaults to off", () => {
		expect(isExplorerReplaceEnabled()).toBe(false);
		expect(shouldReplaceExplorerPage()).toBe(false);
	});

	it("needs BOTH the replacement choice and the new editor", () => {
		setExplorerReplaceEnabled(true);
		expect(shouldReplaceExplorerPage()).toBe(false); // new editor still off
		setNewGcodeEditorEnabled(true);
		expect(shouldReplaceExplorerPage()).toBe(true);
		setNewGcodeEditorEnabled(false);
		expect(shouldReplaceExplorerPage()).toBe(false); // turning the editor off drops the replacement
	});

	it("the new editor alone doesn't replace the page", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldReplaceExplorerPage()).toBe(false);
	});
});
