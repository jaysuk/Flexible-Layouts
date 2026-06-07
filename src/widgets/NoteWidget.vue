<template>
  <!-- Content is author-supplied via the widget settings; rendered from a minimal Markdown subset. -->
  <div class="nt-root fill-height pa-2" v-html="html" />
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "note" }>; disabled?: boolean }>();

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
.nt-root { min-height: 0; overflow-y: auto; font-size: 0.85rem; line-height: 1.5; }
.nt-root :deep(h1) { font-size: 1.1rem; font-weight: 700; margin: 0 0 4px; }
.nt-root :deep(h2) { font-size: 1rem; font-weight: 700; margin: 4px 0 2px; }
.nt-root :deep(h3), .nt-root :deep(h4) { font-size: 0.9rem; font-weight: 600; margin: 4px 0 2px; }
.nt-root :deep(p) { margin: 0 0 6px; }
.nt-root :deep(ul) { margin: 0 0 6px; padding-left: 1.2em; }
.nt-root :deep(code) { font-family: monospace; background: rgba(var(--v-theme-on-surface), 0.08); padding: 0 3px; border-radius: 3px; }
.nt-root :deep(a) { color: rgb(var(--v-theme-primary)); }
</style>
