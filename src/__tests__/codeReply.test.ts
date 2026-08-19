import { describe, expect, it, vi } from "vitest";

import { isErrorReply, isWarningReply, sendCodeChecked } from "../util/codeReply";

describe("isErrorReply / isWarningReply", () => {
	it("recognises RRF's own Error:/Warning: prefixes", () => {
		expect(isErrorReply("Error: Probe was not triggered during probing move")).toBe(true);
		expect(isWarningReply("Warning: Motor phase A may be disconnected")).toBe(true);
	});

	it("tolerates the leading whitespace RRF sometimes emits before a reply", () => {
		expect(isErrorReply("\nError: bad command")).toBe(true);
	});

	it("does not treat an ordinary reply, an empty reply, or a nullish one as a failure", () => {
		expect(isErrorReply("")).toBe(false);
		expect(isErrorReply("ok")).toBe(false);
		expect(isErrorReply("Bed compensation in use: mesh")).toBe(false);
		expect(isErrorReply(null)).toBe(false);
		expect(isErrorReply(undefined)).toBe(false);
	});

	it("does not fire on a reply that merely mentions the word error later on", () => {
		// The prefix is positional in RRF's convention - a reply describing an error is not itself one.
		expect(isErrorReply("Probe triggered; no error detected")).toBe(false);
	});
});

describe("sendCodeChecked", () => {
	it("returns the reply for a successful code", async () => {
		const sender = vi.fn().mockResolvedValue("ok");
		await expect(sendCodeChecked(sender, "G28")).resolves.toBe("ok");
		expect(sender).toHaveBeenCalledWith("G28");
	});

	// The whole point: RRF reports a refused command by RESOLVING with "Error: ...", so without this
	// a caller's try/catch never fires and the success path runs after a command that did nothing.
	it("throws on an error reply that the underlying sender resolved with", async () => {
		const sender = vi.fn().mockResolvedValue("Error: Probe was not triggered during probing move");
		await expect(sendCodeChecked(sender, "G38.2 Z-10")).rejects.toThrow(
			"Probe was not triggered during probing move",
		);
	});

	it("strips RRF's Error: prefix so a UI alert doesn't stutter", async () => {
		const sender = vi.fn().mockResolvedValue("Error: bad parameter");
		await expect(sendCodeChecked(sender, "M999")).rejects.toThrow(/^bad parameter$/);
	});

	it("passes a warning straight through - the command still ran", async () => {
		const sender = vi.fn().mockResolvedValue("Warning: this is only a warning");
		await expect(sendCodeChecked(sender, "G1 X1")).resolves.toBe("Warning: this is only a warning");
	});

	it("still propagates a genuine transport rejection", async () => {
		const sender = vi.fn().mockRejectedValue(new Error("disconnected"));
		await expect(sendCodeChecked(sender, "G28")).rejects.toThrow("disconnected");
	});
});
