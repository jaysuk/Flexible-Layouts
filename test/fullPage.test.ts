import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";

import FlexPage from "../src/page/FlexPage.vue";
import { useLayoutStore } from "../src/model/store";
import { scrollPageToBottom } from "../src/util/pageScroll";

function setAutoScroll(mode: string | undefined): void {
	(dwc.settings as Record<string, unknown>).behaviour = mode === undefined ? undefined : { autoScrollMode: mode };
}

describe("scrollPageToBottom", () => {
	let scrollTo: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		vi.useFakeTimers();
		scrollTo = vi.fn();
		window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
		window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as unknown as typeof window.requestAnimationFrame;
	});
	afterEach(() => {
		vi.useRealTimers();
		setAutoScroll("viewerPages");
	});

	it("scrolls once smoothly, then chases the growing bottom with instant passes", () => {
		setAutoScroll("viewerPages");
		expect(scrollPageToBottom()).toBe(true);
		vi.advanceTimersByTime(2000);
		const behaviours = scrollTo.mock.calls.map((c) => (c[0] as ScrollToOptions).behavior);
		expect(behaviours).toEqual(["smooth", "auto", "auto", "auto"]);
	});

	it("does nothing when disabled for this viewport", () => {
		expect(scrollPageToBottom(false)).toBe(false);
		vi.advanceTimersByTime(2000);
		expect(scrollTo).not.toHaveBeenCalled();
	});

	it("respects the user's auto-scroll = off preference", () => {
		setAutoScroll("off");
		expect(scrollPageToBottom()).toBe(false);
		vi.advanceTimersByTime(2000);
		expect(scrollTo).not.toHaveBeenCalled();
	});

	it("still scrolls when the setting doesn't exist (older DWC)", () => {
		setAutoScroll(undefined);
		expect(scrollPageToBottom()).toBe(true);
	});
});

describe("FlexPage fullPage", () => {
	beforeEach(() => {
		setAutoScroll("viewerPages");
		window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
	});

	function pageWith(fullPage: boolean) {
		const store = useLayoutStore();
		const page = store.ensurePage("/Full", "custom");
		page.fullPage = fullPage ? true : undefined;
		return mountInDwc(FlexPage, { props: { pageId: "/Full", kind: "custom" } });
	}

	it("marks a full page and scrolls it flush on open", async () => {
		const w = pageWith(true);
		expect(w.classes()).toContain("flex-page--full");
		await new Promise((r) => setTimeout(r, 50));
		expect(window.scrollTo).toHaveBeenCalled();
	});

	it("leaves an ordinary page alone", async () => {
		const w = pageWith(false);
		expect(w.classes()).not.toContain("flex-page--full");
		await new Promise((r) => setTimeout(r, 50));
		expect(window.scrollTo).not.toHaveBeenCalled();
	});

	it("never treats the status region as a full page", () => {
		useLayoutStore().ensurePage("__status__", "custom").fullPage = true;
		const w = mountInDwc(FlexPage, { props: { pageId: "__status__", kind: "custom" } });
		expect(w.classes()).not.toContain("flex-page--full");
	});
});
