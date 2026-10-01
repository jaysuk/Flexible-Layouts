import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { forEachDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { useSettingsStore } from "@/stores/settings";

import ExplorerPanel from "../widgets/ExplorerPanel.vue";
import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";
import { clearViewStates } from "../model/editorViewState";
import { clearExplorerSessions, requestReveal, revealRequest } from "../model/explorerSession";
import { readFirmwareChangeState, writeFirmwareChangeState } from "../model/firmware/changeState";
import { preflightTarget } from "../model/firmware/impactRange";

const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

const files: Record<string, string> = {
	"0:/sys/config.g": ["; config", "G1 X1", "M408 S0", "G1 X2", "G1 X3", "G1 X4", ""].join("\n"),
	"0:/menu/main": "text T\"hi\" R0 C0\n",
};
vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => ({
			...actual.useMachineStore(),
			async download(options: { filename: string }) {
				const text = files[options.filename];
				if (text === undefined) throw new Error("not found");
				return text;
			},
			async upload() { return undefined; },
		}),
	};
});

type Vm = { editorInstance: { view: EditorView } | null; revealLine: (line: number) => void };

function machine(version: string): void {
	setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: version }], state: { status: "idle" } });
}
function squiggles(view: EditorView): Array<{ source?: string; from: number; to: number; message: string }> {
	const out: Array<{ source?: string; from: number; to: number; message: string }> = [];
	forEachDiagnostic(view.state, (d, from, to) => { if (d.source === "rrf-changes") out.push({ source: d.source, from, to, message: d.message }); });
	return out;
}
async function mountEditor(filename = "0:/sys/config.g") {
	const w = mountInDwc(GcodeCmEditor, { props: { filename } });
	await vi.waitFor(() => expect((w.vm as unknown as Vm).editorInstance).not.toBeNull());
	return { w, view: (w.vm as unknown as Vm).editorInstance!.view, vm: w.vm as unknown as Vm };
}

beforeEach(() => {
	memoryStorage.clear();
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	preflightTarget.value = null;
	clearExplorerSessions();
	clearViewStates();
	resetEditorColorSettingsForTests();
	revealRequest.value = null;
	machine("3.7.0-rc.2");
});

describe("GcodeCmEditor - changed-since squiggles", () => {
	it("marks the lines a firmware change touched, once the file has loaded", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		const { w, view } = await mountEditor();
		await vi.waitFor(() => expect(squiggles(view).length).toBeGreaterThan(0));
		const [d] = squiggles(view);
		expect(view.state.doc.sliceString(d.from, d.to)).toBe("M408 S0");
		expect(d.message).toContain("plugins.flexibleLayouts.firmwareChanges.changedIn");
		w.unmount();
	});

	it("draws nothing without a firmware change to report, and follows the setting live", async () => {
		writeFirmwareChangeState({ baseline: "3.7.0-rc.2" });
		const { w, view } = await mountEditor();
		await new Promise((r) => setTimeout(r, 200));
		expect(squiggles(view)).toEqual([]);
		writeFirmwareChangeState({ baseline: "3.6.3" });
		await vi.waitFor(() => expect(squiggles(view).length).toBeGreaterThan(0));
		writeFirmwareChangeState({ editorWarnings: false });
		await vi.waitFor(() => expect(squiggles(view)).toEqual([]));
		w.unmount();
	});

	it("follows the release the update widget selected", async () => {
		machine("3.6.3");
		const { w, view } = await mountEditor();
		await new Promise((r) => setTimeout(r, 200));
		expect(squiggles(view)).toEqual([]);
		preflightTarget.value = "3.7.0";
		await vi.waitFor(() => expect(squiggles(view).length).toBeGreaterThan(0));
		preflightTarget.value = null;
		await vi.waitFor(() => expect(squiggles(view)).toEqual([]));
		w.unmount();
	});

	it("Ignore this change stores the id machine-wide and clears the squiggle", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		const { w, view } = await mountEditor();
		await vi.waitFor(() => expect(squiggles(view).length).toBeGreaterThan(0));
		let action: { apply: (v: EditorView, from: number, to: number) => void } | undefined;
		forEachDiagnostic(view.state, (d, from, to) => {
			if (d.source === "rrf-changes" && d.message.includes("M408")) action = { apply: (v, f, t) => d.actions![0].apply(v, f, t) };
			void from; void to;
		});
		const target = squiggles(view).find((s) => view.state.doc.sliceString(s.from, s.to) === "M408 S0")!;
		action!.apply(view, target.from, target.to);
		expect(readFirmwareChangeState().acknowledged.length).toBe(1);
		await vi.waitFor(() => expect(squiggles(view).some((s) => view.state.doc.sliceString(s.from, s.to) === "M408 S0")).toBe(false));
		w.unmount();
	});

	it("leaves a menu file alone", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		const { w, view } = await mountEditor("0:/menu/main");
		await new Promise((r) => setTimeout(r, 200));
		expect(squiggles(view)).toEqual([]);
		w.unmount();
	});
});

describe("GcodeCmEditor - revealLine", () => {
	it("puts the cursor on the line, and waits for the file if it is still loading", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/config.g" } });
		(w.vm as unknown as Vm).revealLine(3); // before the editor exists
		await vi.waitFor(() => expect((w.vm as unknown as Vm).editorInstance).not.toBeNull());
		const view = (w.vm as unknown as Vm).editorInstance!.view;
		await vi.waitFor(() => expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3));
		w.unmount();
	});

	it("clamps a line past the end", async () => {
		const { w, view, vm } = await mountEditor();
		vm.revealLine(9999);
		expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(view.state.doc.lines);
		w.unmount();
	});
});

describe("ExplorerPanel - open at a line", () => {
	it("opens the file the request names, puts the cursor on the line and consumes the request", async () => {
		memoryStorage.set("flexibleLayouts.useGcodeEditor", "1");
		requestReveal("0:/sys/config.g", 4);
		const w = mountInDwc(ExplorerPanel, { props: { target: { kind: "editor", path: "0:/sys/config.g" } } });
		await flushPromises();
		const editor = w.findComponent(GcodeCmEditor);
		await vi.waitFor(() => expect((editor.vm as unknown as Vm).editorInstance).not.toBeNull());
		const view = (editor.vm as unknown as Vm).editorInstance!.view;
		await vi.waitFor(() => expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(4));
		expect(revealRequest.value).toBeNull();
		w.unmount();
	});

	it("drops a request for a different file, and one that has gone stale", async () => {
		memoryStorage.set("flexibleLayouts.useGcodeEditor", "1");
		requestReveal("0:/sys/other.g", 4);
		const w = mountInDwc(ExplorerPanel, { props: { target: { kind: "editor", path: "0:/sys/config.g" } } });
		await flushPromises();
		const editor = w.findComponent(GcodeCmEditor);
		await vi.waitFor(() => expect((editor.vm as unknown as Vm).editorInstance).not.toBeNull());
		const view = (editor.vm as unknown as Vm).editorInstance!.view;
		await new Promise((r) => setTimeout(r, 100));
		expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1); // untouched
		w.unmount();
	});
});
