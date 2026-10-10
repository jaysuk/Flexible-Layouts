import { afterEach, describe, expect, it, vi } from "vitest";

import { parseGcode } from "../model/gcode/parse";
import { parseGcodeAsync } from "../model/gcode/parseClient";

describe("parseWorker entry", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetModules();
		(self as unknown as { onmessage: unknown }).onmessage = null;
	});

	// DWC's plugin loader also injects this file as a classic <script> on the main thread, where
	// `self` is `window`: a handler there answers its own replies in an endless postMessage loop.
	it("does nothing when it is loaded on the main thread as a plain script", async () => {
		const post = vi.spyOn(self, "postMessage").mockImplementation(() => {});
		await import("../model/gcode/parseWorker");
		expect((self as unknown as { onmessage: unknown }).onmessage).toBeNull();
		expect(post).not.toHaveBeenCalled();
	});

	it("inside a worker answers a request once and ignores anything else, including its own reply", async () => {
		vi.stubGlobal(
			"WorkerGlobalScope",
			class {
				static [Symbol.hasInstance]() {
					return true;
				}
			}
		);
		const post = vi.spyOn(self, "postMessage").mockImplementation(() => {});
		await import("../model/gcode/parseWorker");
		const onmessage = (self as unknown as { onmessage: (ev: { data: unknown }) => void }).onmessage;
		expect(typeof onmessage).toBe("function");

		onmessage({ data: { id: 7, text: "G1 X1 Y1\n" } });
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][0]).toMatchObject({ id: 7, ok: true });

		onmessage({ data: { id: 7, ok: true } });
		onmessage({ data: { id: 8, ok: false, error: "x" } });
		onmessage({ data: null });
		onmessage({ data: "devtools" });
		expect(post).toHaveBeenCalledTimes(1);
	});
});

describe("parseGcodeAsync", () => {
	// happy-dom (this project's test environment) does not implement Worker at all, so this
	// exercises exactly the fallback path a real browser would also take under a strict CSP or an
	// older DWC build that predates pluginAssetUrl() - not a mock standing in for the worker path.
	it("falls back to the synchronous parser when Worker is unavailable, with an identical result", async () => {
		const text = "G21\nG90\nG1 X10 Y10 F600\nG0 Z5\n";
		const [sync, async_] = [parseGcode(text), await parseGcodeAsync(text)];
		expect(async_).toEqual(sync);
	});
});
