import { describe, expect, it } from "vitest";

import {
	deployTlsEnableInterfaceMacro, TLS_ENABLE_INTERFACE_MACRO, TLS_ENABLE_INTERFACE_PATH,
} from "../model/tlsSetup/interfaceMacro";

// A fake card: in-memory path->text map, mirrors maintenance.macros.test.ts's fakeIO() shape (only the
// "upload" op this module needs).
function fakeIO(fail = false) {
	const files = new Map<string, string>();
	return {
		files,
		upload: async (filename: string, content: Blob) => {
			if (fail) { throw new Error("upload failed"); }
			files.set(filename, await content.text());
		},
	};
}

describe("TLS_ENABLE_INTERFACE_MACRO", () => {
	it("runs the full stop/start cycle: M552 S0, a settle delay, then M552 T1 S1, in that order", () => {
		const s0 = TLS_ENABLE_INTERFACE_MACRO.indexOf("M552 S0");
		const delay = TLS_ENABLE_INTERFACE_MACRO.indexOf("G4 P500");
		const s1 = TLS_ENABLE_INTERFACE_MACRO.indexOf("M552 T1 S1");
		expect(s0).toBeGreaterThan(-1);
		expect(delay).toBeGreaterThan(s0);
		expect(s1).toBeGreaterThan(delay);
	});

	it("never emits an 'endif' line - RRF meta-gcode has no such keyword", () => {
		expect(TLS_ENABLE_INTERFACE_MACRO).not.toMatch(/endif/i);
	});
});

describe("deployTlsEnableInterfaceMacro", () => {
	it("uploads the macro content to its declared path", async () => {
		const io = fakeIO();
		await expect(deployTlsEnableInterfaceMacro(io)).resolves.toBe(true);
		expect(io.files.get(TLS_ENABLE_INTERFACE_PATH)).toBe(TLS_ENABLE_INTERFACE_MACRO);
	});

	it("reports failure (not a throw) if the upload fails", async () => {
		const io = fakeIO(true);
		await expect(deployTlsEnableInterfaceMacro(io)).resolves.toBe(false);
	});
});
