import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import type { Widget } from "../model/document";
import LabelWidget from "../widgets/LabelWidget.vue";

// The test-kit's machine stub doesn't implement download() or isConnected as a real toggle - stub
// just enough to exercise LabelWidget's imageSource === "sd" path (mirrors maintenanceWidget's own
// download() mock, the first thing in the repo to need one).
const DOWNLOADED = new Blob(["fake-image-bytes"], { type: "image/png" });
let connected = true;
vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => {
			const real = actual.useMachineStore();
			return {
				...real,
				get isConnected() { return connected; },
				async download(options: { filename: string }) {
					if (options.filename === "0:/gcodes/photo.png") { return DOWNLOADED; }
					throw new Error("not found");
				},
			};
		},
	};
});

// happy-dom doesn't implement the createObjectURL/revokeObjectURL pair used to display the
// downloaded blob - stub both so the widget's own logic (not the DOM API) is what's under test.
let nextUrl = 0;
const revoked: Array<string> = [];
URL.createObjectURL = vi.fn(() => `blob:mock-${nextUrl++}`);
URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url); });

function mountLabel(widget: Partial<Extract<Widget, { type: "label" }>>) {
	return mountInDwc(LabelWidget, { props: { widget: { type: "label", variant: "image", ...widget } as Widget } });
}

describe("LabelWidget - SD card image source", () => {
	it("loads the file as a blob and renders it as an object URL", async () => {
		connected = true;
		const w = mountLabel({ imageSource: "sd", imagePath: "0:/gcodes/photo.png" });
		await flushPromises();
		const img = w.find("img");
		expect(img.exists()).toBe(true);
		expect(img.attributes("src")).toMatch(/^blob:mock-/);
	});

	it("shows the placeholder, not an <img>, when the machine is disconnected", async () => {
		connected = false;
		const w = mountLabel({ imageSource: "sd", imagePath: "0:/gcodes/photo.png" });
		await flushPromises();
		expect(w.find("img").exists()).toBe(false);
	});

	it("shows the placeholder when the download fails", async () => {
		connected = true;
		const w = mountLabel({ imageSource: "sd", imagePath: "0:/gcodes/missing.png" });
		await flushPromises();
		expect(w.find("img").exists()).toBe(false);
		expect(w.text()).toContain("not found");
	});

	it("revokes the previous object URL when imagePath changes", async () => {
		connected = true;
		const w = mountLabel({ imageSource: "sd", imagePath: "0:/gcodes/photo.png" });
		await flushPromises();
		const first = w.find("img").attributes("src");
		await w.setProps({ widget: { type: "label", variant: "image", imageSource: "sd", imagePath: "0:/gcodes/missing.png" } });
		await flushPromises();
		expect(revoked).toContain(first);
	});

	it("uses widget.content directly (no download) when imageSource is left as url", async () => {
		const w = mountLabel({ imageSource: "url", content: "https://example.com/a.png" });
		await flushPromises();
		expect(w.find("img").attributes("src")).toBe("https://example.com/a.png");
	});
});
