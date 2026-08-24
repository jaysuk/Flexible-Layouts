<template>
  <div class="nt-root fill-height pa-2 position-relative">
    <template v-if="editing">
      <textarea v-model="draft" class="nt-editor" :disabled="props.disabled"
                @blur="save" @keydown.esc="cancel" />
    </template>
    <!-- Otherwise: content is author-supplied via the widget settings; rendered from a minimal
         Markdown subset. -->
    <div v-else class="nt-view" v-html="html" />
    <!-- mousedown.prevent: clicking this while the textarea is focused would otherwise blur it
         FIRST (before this button's own click handler runs), which already calls save() and flips
         `editing` to false - so the click handler's `editing ? save() : startEdit()` would see
         editing already false and wrongly re-open edit mode right after saving. Preventing default
         on mousedown stops the browser from shifting focus away at all, so blur never fires here. -->
    <v-btn v-if="canEditHere" :icon="editing ? 'mdi-check' : 'mdi-pencil'" size="x-small" variant="text"
           class="nt-edit-btn" :title="$t(editing ? 'plugins.flexibleLayouts.note.save' : 'plugins.flexibleLayouts.note.edit')"
           @mousedown.prevent @click="editing ? save() : startEdit()" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";

import type { Widget } from "../model/document";
import { editMode } from "../model/editorState";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";

const props = defineProps<{ widget: Extract<Widget, { type: "note" }>; disabled?: boolean }>();
const patch = inject(WIDGET_PATCH_KEY, null);

// Only offered outside layout-edit mode (the widget is being dragged/resized there, not read) and
// only when there's somewhere to persist to - a group's free-mode preview, for instance, mounts
// widgets without this injection.
const canEditHere = computed(() => !editMode.value && !props.disabled && patch !== null);
const editing = ref(false);
const draft = ref("");

function startEdit(): void {
  draft.value = props.widget.content ?? "";
  editing.value = true;
}
function save(): void {
  if (!editing.value) return;
  editing.value = false;
  if (draft.value !== (props.widget.content ?? "")) {
    patch?.({ content: draft.value });
  }
}
function cancel(): void {
  editing.value = false;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// Render a minimal Markdown subset (headings, bold/italic/code, links, bullet lists, paragraphs).
const html = computed(() => {
  const lines = (props.widget.content ?? "").split(/\r?\n/);
  const out: Array<string> = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
});
</script>

<style scoped>
.nt-root { min-height: 0; overflow-y: auto; font-size: 0.85em; line-height: 1.5; }
.nt-view { padding-right: 20px; }
.nt-root :deep(h1) { font-size: 1.1em; font-weight: 700; margin: 0 0 4px; }
.nt-root :deep(h2) { font-size: 1em; font-weight: 700; margin: 4px 0 2px; }
.nt-root :deep(h3), .nt-root :deep(h4) { font-size: 0.9em; font-weight: 600; margin: 4px 0 2px; }
.nt-root :deep(p) { margin: 0 0 6px; }
.nt-root :deep(ul) { margin: 0 0 6px; padding-left: 1.2em; }
.nt-root :deep(code) { font-family: monospace; background: rgba(var(--v-theme-on-surface), 0.08); padding: 0 3px; border-radius: 3px; }
.nt-root :deep(a) { color: rgb(var(--v-theme-primary)); }
.nt-editor {
	width: 100%;
	height: 100%;
	min-height: 3em;
	resize: none;
	border: none;
	outline: none;
	background: transparent;
	color: inherit;
	font: inherit;
	padding-right: 20px;
}
.nt-edit-btn { position: absolute; top: 2px; right: 2px; opacity: 0.6; }
.nt-edit-btn:hover { opacity: 1; }
</style>
