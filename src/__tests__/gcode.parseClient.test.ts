import { describe, expect, it } from "vitest";

import { parseGcode } from "../model/gcode/parse";
import { parseGcodeAsync } from "../model/gcode/parseClient";

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
