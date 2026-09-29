import { beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

import ExplorerFallback from "../page/fallbacks/ExplorerFallback.vue";
import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";
import { clearViewStates } from "../model/editorViewState";
import { clearExplorerSessions } from "../model/explorerSession";

// The kit's router stub swallows push/replace, so it can't say what the page asked the router to do.
const push = vi.fn();
const replace = vi.fn();
vi.mock("vue-router", async () => {
	const { dwc: state } = await import("dwc-plugin-test-kit");
	return {
		useRoute: () => state.route,
		useRouter: () => ({ push, replace, beforeEach: () => () => { /* unregister */ } }),
	};
});

const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

const files: Record<string, string> = { "0:/macros/a.g": "G28\n", "0:/macros/b.g": "M84\n" };
vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => ({
			...actual.useMachineStore(),
			download: async (options: { filename: string }) => {
				const text = files[options.filename];
				if (text === undefined) throw new Error("not found");
				return text;
			},
			upload: async () => undefined,
		}),
	};
});

/** Put the router on an Explorer URL the way vue-router's `/Explorer/:tab?/:volume?/:path*` would split it. */
function at(path: string, params: Record<string, unknown> = {}): void {
	dwc.route.path = path;
	dwc.route.params = params;
}
const OPEN_A = { tab: "edit", volume: "macros", path: ["a.g"] };

beforeEach(() => {
	memoryStorage.clear();
	memoryStorage.set("flexibleLayouts.useGcodeEditor", "1");
	clearExplorerSessions();
	clearViewStates();
	resetEditorColorSettingsForTests();
	push.mockClear();
	replace.mockClear();
});

describe("the replacement Explorer page follows its URL, and the URL follows it", () => {
	it("leaves a URL alone when it already says what the page shows", async () => {
		at("/Explorer/edit/macros/a.g", OPEN_A);
		const w = mountInDwc(ExplorerFallback);
		await vi.waitFor(() => expect(w.findComponent(GcodeCmEditor).exists()).toBe(true));
		expect(push).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		w.unmount();
	});

	it("puts a file you open in the address bar, as a step Back can undo", async () => {
		at("/Explorer/edit/macros/a.g", OPEN_A);
		const w = mountInDwc(ExplorerFallback);
		await vi.waitFor(() => expect(w.findComponent(GcodeCmEditor).exists()).toBe(true));
		(w.findComponent({ name: "ExplorerPanel" }).vm as unknown as { open: (item: { name: string }, dir: string) => void })
			.open({ name: "b.g" }, "0:/macros");
		await nextTick();
		expect(push).toHaveBeenCalledWith("/Explorer/edit/macros/b.g");
		expect(replace).not.toHaveBeenCalled();
		w.unmount();
	});

	it("comes back from another page to the open file, and repairs the bare URL it arrived on", async () => {
		at("/Explorer/edit/macros/a.g", OPEN_A);
		const first = mountInDwc(ExplorerFallback);
		await vi.waitFor(() => expect(first.findComponent(GcodeCmEditor).exists()).toBe(true));
		first.unmount();

		at("/Explorer"); // the nav drawer's link
		const second = mountInDwc(ExplorerFallback);
		await vi.waitFor(() => expect(second.findComponent(GcodeCmEditor).props("filename")).toBe("0:/macros/a.g"));
		expect(replace).toHaveBeenCalledWith("/Explorer/edit/macros/a.g"); // caught up, not a new history step
		expect(push).not.toHaveBeenCalled();
		second.unmount();
	});

	it("does not reset the browser to the root as it is left for another page", async () => {
		at("/Explorer/macros", { tab: "macros" });
		const w = mountInDwc(ExplorerFallback);
		await nextTick();
		const panel = w.findComponent({ name: "ExplorerPanel" }).vm as unknown as { tabs: Array<{ directory?: string }> };
		expect(panel.tabs[0].directory).toBe("0:/macros");

		at("/Console"); // the route is the next page's while this one is still mounted
		await nextTick();
		expect(panel.tabs[0].directory).toBe("0:/macros"); // real teeth: read as an Explorer URL this is "the root"
		expect(push).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		w.unmount();
	});
});
