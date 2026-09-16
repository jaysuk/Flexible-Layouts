import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isNewGcodeEditorEnabled, setNewGcodeEditorEnabled, shouldUseNewGcodeEditor } from "../model/editorPreference";

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

	it("is false even when the setting is on for a non-G-code file (menu/plain text)", () => {
		setNewGcodeEditorEnabled(true);
		expect(shouldUseNewGcodeEditor("0:/menu/main")).toBe(false);
		expect(shouldUseNewGcodeEditor("0:/sys/board.txt")).toBe(false);
		expect(shouldUseNewGcodeEditor("0:/sys/notes.txt")).toBe(false);
	});
});
