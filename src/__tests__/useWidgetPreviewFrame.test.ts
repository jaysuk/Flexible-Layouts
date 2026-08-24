import { describe, expect, it } from "vitest";

import { previewTransform } from "../composables/useWidgetPreviewFrame";

describe("previewTransform", () => {
	it("sizes the stage from the grid footprint (90px/col, 30px/row)", () => {
		const style = previewTransform({ w: 4, h: 6 }, { w: 1000, h: 1000 });
		expect(style.width).toBe("360px");
		expect(style.height).toBe("180px");
	});

	it("clamps the footprint to sane bounds for tiny or huge widgets", () => {
		const tiny = previewTransform({ w: 1, h: 1 }, { w: 1000, h: 1000 });
		expect(tiny.width).toBe("160px"); // floor
		expect(tiny.height).toBe("80px"); // floor

		const huge = previewTransform({ w: 20, h: 40 }, { w: 1000, h: 1000 });
		expect(huge.width).toBe("900px"); // ceiling
		expect(huge.height).toBe("640px"); // ceiling
	});

	it("scales down to fit the frame, uniformly on the tighter axis", () => {
		// Footprint 360x180 into a 180x180 frame -> width is the tighter axis, scale = 180/360 = 0.5.
		const style = previewTransform({ w: 4, h: 6 }, { w: 180, h: 180 });
		expect(style.transform).toBe("translate(-50%, -50%) scale(0.5)");
	});

	it("never scales up a widget that already fits the frame", () => {
		const style = previewTransform({ w: 1, h: 1 }, { w: 1000, h: 1000 }); // 160x80 footprint, huge frame
		expect(style.transform).toBe("translate(-50%, -50%) scale(1)");
	});
});
