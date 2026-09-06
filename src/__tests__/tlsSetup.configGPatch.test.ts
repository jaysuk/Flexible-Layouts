import { describe, expect, it } from "vitest";

import { patchM552ForTls, patchM586ForTls } from "../model/tlsSetup/configGPatch";

describe("patchM552ForTls", () => {
	it("adds T1 to an M552 line with no T parameter", () => {
		const result = patchM552ForTls("M111 S0\nM552 S1 P192.168.1.5\nM586 P0 S1\n");
		expect(result.changed).toBe(true);
		expect(result.text).toBe("M111 S0\nM552 S1 P192.168.1.5 T1\nM586 P0 S1\n");
	});

	it("replaces an existing T0 with T1", () => {
		const result = patchM552ForTls("M552 S1 T0\n");
		expect(result.changed).toBe(true);
		expect(result.text).toBe("M552 S1 T1\n");
	});

	it("replaces an existing T-1 with T1", () => {
		const result = patchM552ForTls("M552 S1 T-1\n");
		expect(result.changed).toBe(true);
		expect(result.text).toBe("M552 S1 T1\n");
	});

	it("preserves a trailing comment", () => {
		const result = patchM552ForTls("M552 S1 ; enable network\n");
		expect(result.text).toBe("M552 S1 T1 ; enable network\n");
	});

	it("is a no-op when T1 is already set", () => {
		const original = "M552 S1 T1\n";
		const result = patchM552ForTls(original);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});

	it("reports when there's no M552 line at all", () => {
		const result = patchM552ForTls("M111 S0\n");
		expect(result.changed).toBe(false);
		expect(result.changes[0]).toMatch(/No M552 line/);
	});

	it("ignores M552 mentioned only in a comment", () => {
		const result = patchM552ForTls("M111 S0 ; see M552 docs\n");
		expect(result.changed).toBe(false);
		expect(result.changes[0]).toMatch(/No M552 line/);
	});
});

describe("patchM586ForTls", () => {
	// Regression coverage for a real bug: this used to add T1 onto whatever M586 line already existed
	// for the protocol, which silently took plain HTTP offline the moment HTTPS was enabled - confirmed
	// on real hardware. It must now always ADD a separate TLS line, never convert the plain one.
	it("adds a separate TLS line, leaving an existing plain M586 P0 line untouched", () => {
		const result = patchM586ForTls("M552 S1 T1\nM586 P0 S1\n", 0, 443);
		expect(result.changed).toBe(true);
		expect(result.text).toBe("M552 S1 T1\nM586 P0 S1\nM586 P0 S1 T1 R443\n");
	});

	it("does not touch an M586 line for a different protocol", () => {
		const result = patchM586ForTls("M552 S1 T1\nM586 P1 S1\n", 0, 443);
		expect(result.changed).toBe(true);
		expect(result.text).toContain("M586 P1 S1\n"); // untouched
		expect(result.text).toContain("M586 P0 S1 T1 R443"); // newly appended
	});

	it("adds BOTH a plain and a TLS line right after M552 when no line exists for that protocol at all", () => {
		const result = patchM586ForTls("M552 S1 T1\nM98 P\"config-override.g\"\n", 0, 443);
		expect(result.changed).toBe(true);
		expect(result.text).toBe("M552 S1 T1\nM586 P0 S1\nM586 P0 S1 T1 R443\nM98 P\"config-override.g\"\n");
	});

	it("is a no-op when both a plain and a TLS line already exist for that protocol", () => {
		const original = "M552 S1 T1\nM586 P0 S1\nM586 P0 S1 T1 R443\n";
		const result = patchM586ForTls(original, 0, 443);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});

	it("adds only the plain line when a TLS line already exists but no plain one does", () => {
		const result = patchM586ForTls("M552 S1 T1\nM586 P0 S1 T1 R443\n", 0, 443);
		expect(result.changed).toBe(true);
		// Anchored after the existing TLS line (grouped with its sibling), not reordered before it.
		expect(result.text).toBe("M552 S1 T1\nM586 P0 S1 T1 R443\nM586 P0 S1\n");
	});

	it("uses the given TLS port in the appended line", () => {
		const result = patchM586ForTls("M552 S1 T1\n", 0, 8443);
		expect(result.text).toContain("M586 P0 S1 T1 R8443");
	});

	it("appends both at the end when there's no M552 line either", () => {
		const result = patchM586ForTls("M111 S0\n", 2, 992);
		expect(result.changed).toBe(true);
		expect(result.text).toBe("M111 S0\nM586 P2 S1\nM586 P2 S1 T1 R992\n");
	});
});
