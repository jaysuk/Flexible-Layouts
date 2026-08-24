import { mountInDwc } from "dwc-plugin-test-kit";
import { describe, expect, it, vi } from "vitest";

import { WIDGET_PATCH_KEY } from "../src/util/widgetPatch";
import NoteWidget from "../src/widgets/NoteWidget.vue";
import type { Widget } from "../src/model/document";

function mountNote(content: string, patch: ((p: Record<string, unknown>) => void) | null) {
	return mountInDwc(NoteWidget, {
		props: { widget: { type: "note", content } as Widget },
		global: { provide: { [WIDGET_PATCH_KEY as unknown as string]: patch } },
	});
}

describe("Note widget inline edit", () => {
	it("offers no edit affordance when nothing can persist a patch (no WIDGET_PATCH_KEY provider)", () => {
		const w = mountNote("hello", null);
		expect(w.find(".nt-edit-btn").exists()).toBe(false);
	});

	it("edit button reveals a textarea seeded with the current content, and Escape discards changes", async () => {
		const w = mountNote("original text", vi.fn());
		await w.find(".nt-edit-btn").trigger("click");
		const textarea = w.find<HTMLTextAreaElement>(".nt-editor");
		expect(textarea.exists()).toBe(true);
		expect(textarea.element.value).toBe("original text");

		await textarea.setValue("changed but discarded");
		await textarea.trigger("keydown.esc");
		expect(w.find(".nt-editor").exists()).toBe(false);
		expect(w.find(".nt-view").text()).toContain("original text");
	});

	it("blurring the textarea persists a changed draft via the injected patch function", async () => {
		const patch = vi.fn();
		const w = mountNote("original text", patch);
		await w.find(".nt-edit-btn").trigger("click");
		await w.find(".nt-editor").setValue("updated text");
		await w.find(".nt-editor").trigger("blur");
		expect(patch).toHaveBeenCalledWith({ content: "updated text" });
	});

	it("does not call patch when the draft is unchanged", async () => {
		const patch = vi.fn();
		const w = mountNote("same", patch);
		await w.find(".nt-edit-btn").trigger("click");
		await w.find(".nt-editor").trigger("blur");
		expect(patch).not.toHaveBeenCalled();
	});
});
