<template>
  <div class="gl-root fill-height d-flex flex-column pa-1" :class="{ 'gl-frozen': disabledNow }">
    <div v-if="widget.title || (widget.showSearch !== false && widget.mode !== 'list')" class="d-flex align-center ga-2 mb-1 flex-shrink-0">
      <span v-if="widget.title" class="gl-title text-truncate">{{ widget.title }}</span>
      <v-chip size="x-small" variant="tonal">{{ rows.length }}</v-chip>
      <v-spacer />
      <v-text-field v-if="widget.showSearch !== false && widget.mode !== 'list'" v-model="search"
                    density="compact" variant="outlined" hide-details clearable prepend-inner-icon="mdi-magnify"
                    :placeholder="$t('plugins.flexibleLayouts.globals.search')" class="gl-search" />
    </div>

    <div v-if="!rows.length" class="text-medium-emphasis text-caption pa-2">
      {{ $t("plugins.flexibleLayouts.globals.none") }}
    </div>

    <div class="gl-list flex-grow-1">
      <div v-for="r in rows" :key="r.name" class="gl-row">
        <span class="gl-name text-truncate" :title="r.name">{{ r.name }}</span>

        <!-- read-only -->
        <span v-if="widget.allowEdit === false" class="gl-ro text-truncate" :title="r.live">{{ r.live }}</span>

        <!-- boolean: immediate toggle -->
        <v-switch v-else-if="r.kind === 'boolean'" :model-value="r.value === true" color="primary"
                  density="compact" hide-details :disabled="disabledNow" class="gl-switch"
                  @update:model-value="setBool(r.name, $event === true)" />

        <!-- everything else: text field + set -->
        <template v-else>
          <v-text-field :model-value="draft(r)" density="compact" variant="outlined" hide-details
                        :disabled="disabledNow" class="gl-field"
                        :hint="r.kind === 'array' || r.kind === 'object' ? '{ … }' : undefined"
                        @update:model-value="drafts[r.name] = $event"
                        @keyup.enter="commit(r)" />
          <v-btn icon="mdi-check" size="x-small" variant="text" :color="isDirty(r) ? 'primary' : undefined"
                 :disabled="disabledNow || !isDirty(r)" :title="$t('plugins.flexibleLayouts.globals.set')"
                 @click="commit(r)" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

type Kind = "boolean" | "number" | "string" | "array" | "object";
interface Row { name: string; value: unknown; kind: Kind; live: string }

const props = defineProps<{ widget: Extract<Widget, { type: "globals" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const search = ref("");
const drafts = reactive<Record<string, string>>({});

function kindOf(v: unknown): Kind {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (Array.isArray(v)) return "array";
  return "object";
}
// RRF source repr for editing/display.
function liveStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return `{${v.map((e) => braceItem(e)).join(", ")}}`;
  return String(v);
}
function braceItem(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (Array.isArray(v)) return `{${v.map(braceItem).join(", ")}}`;
  return String(v);
}

const rows = computed<Array<Row>>(() => {
  const g = (machineStore.model as unknown as { global?: Map<string, unknown> }).global;
  if (!(g instanceof Map)) return [];
  let list: Array<{ name: string; value: unknown }> = [];
  g.forEach((value, name) => list.push({ name, value }));
  if (props.widget.mode === "list") {
    const want = props.widget.names ?? [];
    const order = new Map(want.map((n, i) => [n, i]));
    list = list.filter((r) => order.has(r.name)).sort((a, b) => (order.get(a.name)! - order.get(b.name)!));
  } else {
    list.sort((a, b) => (a.name < b.name ? -1 : 1));
    const q = search.value.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
  }
  return list.map((r) => ({ name: r.name, value: r.value, kind: kindOf(r.value), live: liveStr(r.value) }));
});

function draft(r: Row): string { return drafts[r.name] ?? r.live; }
function isDirty(r: Row): boolean { return drafts[r.name] !== undefined && drafts[r.name] !== r.live; }

function run(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "global update failed", (e as Error)?.message ?? String(e)));
}
function rrfFor(kind: Kind, text: string): string {
  if (kind === "string") return `"${text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  return text.trim(); // number / array / object: sent as the user typed it (RRF expression)
}
function commit(r: Row): void {
  if (!isDirty(r)) return;
  run(`set global.${r.name} = ${rrfFor(r.kind, draft(r))}`);
  delete drafts[r.name];
}
function setBool(name: string, value: boolean): void {
  run(`set global.${name} = ${value ? "true" : "false"}`);
}
</script>

<style scoped>
.gl-root { min-height: 0; }
.gl-title { font-size: 0.8rem; font-weight: 600; opacity: 0.85; }
.gl-frozen { opacity: 0.5; pointer-events: none; }
.gl-search { max-width: 14rem; }
.gl-list { min-height: 0; overflow-y: auto; }
.gl-row {
  display: flex; align-items: center; gap: 6px; padding: 2px 2px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.gl-row:last-child { border-bottom: none; }
.gl-name { flex: 1 1 6rem; min-width: 4rem; font-family: monospace; font-size: 0.8rem; }
.gl-ro { flex: 1 1 6rem; text-align: right; font-family: monospace; font-size: 0.8rem; opacity: 0.8; }
.gl-field { flex: 1 1 6rem; max-width: 12rem; }
.gl-switch { flex: 0 0 auto; }
</style>
