<template>
  <div class="ta-root fill-height d-flex flex-column" :class="{ 'ta-frozen': disabledNow }">
    <!-- Camera with crosshair / target overlay -->
    <div class="ta-cam flex-grow-1">
      <div v-if="!widget.url" class="ta-noimg text-caption text-medium-emphasis pa-2">
        {{ $t("plugins.flexibleLayouts.toolAlign.noUrl") }}
      </div>
      <img v-else :src="src" class="ta-img" :style="{ objectFit: widget.fit || 'contain' }" @error="onError" />

      <div v-if="overlayStyle !== 'none'" class="ta-overlay" :style="overlayVars">
        <div class="ta-cross-h" />
        <div class="ta-cross-v" />
        <template v-if="overlayStyle === 'target'">
          <div v-for="r in rings" :key="r" class="ta-ring" :style="{ width: r + 'px', height: r + 'px' }" />
        </template>
        <div class="ta-dot" />
      </div>
    </div>

    <!-- Tool buttons (auto-populated from the object model) -->
    <div class="ta-tools d-flex flex-wrap align-center ga-1 px-1 pt-1 flex-shrink-0">
      <v-btn v-for="t in tools" :key="t.number" size="small" class="text-none ta-btn"
             :variant="t.number === current ? 'flat' : 'tonal'"
             :color="t.number === current ? (widget.color || 'primary') : undefined"
             :disabled="disabledNow" @click="select(t.number)">
        {{ t.name || ("T" + t.number) }}
        <v-icon v-if="t.number === widget.referenceTool" size="14" class="ml-1" :title="$t('plugins.flexibleLayouts.toolAlign.reference')">mdi-target</v-icon>
      </v-btn>
      <span v-if="!tools.length" class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.toolAlign.empty") }}</span>
    </div>

    <!-- Fine jog to bring the nozzle onto the crosshair -->
    <div class="ta-jog d-flex align-center ga-1 px-1 pt-1 flex-shrink-0">
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('X', -1)">X−</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('X', 1)">X+</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('Y', -1)">Y−</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('Y', 1)">Y+</v-btn>
      <v-spacer />
      <v-select v-model.number="step" :items="stepItems" density="compact" variant="outlined" hide-details
                class="ta-step" suffix="mm" />
    </div>

    <!-- Capture / reference actions -->
    <div class="ta-actions d-flex flex-wrap align-center ga-1 px-1 pt-1 flex-shrink-0">
      <v-btn size="small" variant="tonal" prepend-icon="mdi-target" :disabled="disabledNow || current < 0" @click="setReference">
        {{ $t("plugins.flexibleLayouts.toolAlign.setRef") }}
      </v-btn>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-crosshairs-gps" :disabled="disabledNow || current < 0" @click="capture">
        {{ $t("plugins.flexibleLayouts.toolAlign.capture") }}
      </v-btn>
      <v-btn size="small" variant="text" :disabled="disabledNow || !hasCaptures" @click="clearAll">
        {{ $t("plugins.flexibleLayouts.toolAlign.clear") }}
      </v-btn>
    </div>
    <div v-if="!allHomed" class="text-caption text-warning px-2 pt-1 flex-shrink-0">
      <v-icon size="14">mdi-alert</v-icon> {{ $t("plugins.flexibleLayouts.toolAlign.notHomed") }}
    </div>

    <!-- Offsets table -->
    <div class="ta-table flex-grow-1 px-1 pt-1">
      <table class="ta-grid">
        <thead>
          <tr>
            <th>{{ $t("plugins.flexibleLayouts.toolAlign.tool") }}</th>
            <th>{{ $t("plugins.flexibleLayouts.toolAlign.captured") }}</th>
            <th>{{ $t("plugins.flexibleLayouts.toolAlign.offset") }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.number" :class="{ 'ta-ref': r.isRef }">
            <td>{{ r.name }}<span v-if="r.isRef" class="ta-badge">{{ $t("plugins.flexibleLayouts.toolAlign.refBadge") }}</span></td>
            <td class="ta-num">{{ r.captured }}</td>
            <td class="ta-num">{{ r.offset }}</td>
            <td>
              <v-btn v-if="!r.isRef && r.g10" size="x-small" variant="tonal" :disabled="disabledNow" @click="applyTool(r.number)">
                {{ $t("plugins.flexibleLayouts.toolAlign.apply") }}
              </v-btn>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="d-flex align-center ga-2 mt-1 flex-wrap">
        <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-content-save-cog"
               :disabled="disabledNow || !anyApplicable" @click="applyAll">
          {{ $t("plugins.flexibleLayouts.toolAlign.applyAll") }}
        </v-btn>
        <v-switch v-model="invert" density="compact" hide-details color="primary"
                  :label="$t('plugins.flexibleLayouts.toolAlign.invert')" />
      </div>
      <div class="text-caption text-medium-emphasis mt-1">{{ $t("plugins.flexibleLayouts.toolAlign.persistHint") }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { showConfirmDialog } from "@/composables/useConfirmDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "toolAlign" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// --- Camera + overlay ---------------------------------------------------------
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
const src = computed(() => {
  const url = props.widget.url ?? "";
  if (!url || !(props.widget.refreshMs && props.widget.refreshMs > 0)) return url;
  return url + (url.includes("?") ? "&" : "?") + "_t=" + tick.value;
});
function onError(): void { /* keep broken-image icon; the refresh timer retries */ }

const overlayStyle = computed(() => props.widget.overlay ?? "crosshair");
const rings = computed(() => {
  const base = props.widget.overlaySize || 60;
  return [base, base * 2];
});
const overlayVars = computed(() => ({
  "--ta-cx": `${props.widget.overlayX ?? 50}%`,
  "--ta-cy": `${props.widget.overlayY ?? 50}%`,
  "--ta-col": props.widget.overlayColor || "#39FF14",
  "--ta-lw": "1px",
}));

// --- Tools / position ---------------------------------------------------------
interface RawTool { number?: number; name?: string; offsets?: Array<number> }
interface RawAxis { letter?: string; homed?: boolean; machinePosition?: number | null }

const tools = computed<Array<{ number: number; name: string }>>(() => {
  const arr = resolveOmPath(machineStore.model, "tools");
  if (!Array.isArray(arr)) return [];
  return (arr as Array<RawTool | null>).filter((t): t is RawTool => t != null)
    .map((t) => ({ number: t.number ?? 0, name: t.name ?? "" }));
});
const current = computed(() => {
  const n = resolveOmPath(machineStore.model, "state.currentTool");
  return typeof n === "number" ? n : -1;
});
function axisRow(letter: string): RawAxis | null {
  const arr = resolveOmPath(machineStore.model, "move.axes");
  if (!Array.isArray(arr)) return null;
  return (arr as Array<RawAxis>).find((a) => (a?.letter ?? "").toUpperCase() === letter) ?? null;
}
function machinePos(letter: string): number | null {
  const a = axisRow(letter);
  return a && typeof a.machinePosition === "number" ? a.machinePosition : null;
}
const allHomed = computed(() => ["X", "Y"].every((l) => axisRow(l)?.homed));

function refOffsetXY(): { x: number; y: number } {
  const arr = resolveOmPath(machineStore.model, "tools");
  const t = Array.isArray(arr) ? (arr as Array<RawTool | null>).find((x) => x?.number === props.widget.referenceTool) : null;
  const off = t?.offsets;
  return {
    x: Array.isArray(off) && typeof off[0] === "number" ? off[0] : 0,
    y: Array.isArray(off) && typeof off[1] === "number" ? off[1] : 0,
  };
}

// --- Alignment state (captures are a per-session measurement, not part of the saved layout) ---
const captures = ref<Record<number, { x: number; y: number }>>({});
const hasCaptures = computed(() => Object.keys(captures.value).length > 0);

const step = ref<number>(props.widget.jogStep ?? 0.1);
const stepItems = [0.01, 0.05, 0.1, 0.5, 1];

const invert = computed({
  get: () => !!props.widget.invertOffsets,
  set: (v: boolean) => { props.widget.invertOffsets = v; },
});

function notify(msg: string, level: LogLevel = LogLevel.warning): void {
  uiStore.makeNotification(level, i18n.global.t("plugins.flexibleLayouts.widgets.toolAlign"), msg);
}
function send(code: string): Promise<unknown> {
  return machineStore.sendCode(code).catch((e: unknown) => notify((e as Error)?.message ?? String(e), LogLevel.error));
}

function select(n: number): void {
  if (disabledNow.value) return;
  void send(`T${n}`);
}
function nudge(letter: "X" | "Y", dir: number): void {
  if (disabledNow.value) return;
  const d = dir * step.value;
  const feed = props.widget.jogFeed || 6000;
  void send(`M120\nG91\nG1 ${letter}${d} F${feed}\nG90\nM121`);
}
function captureFor(t: number): boolean {
  const x = machinePos("X"), y = machinePos("Y");
  if (x == null || y == null) { notify(i18n.global.t("plugins.flexibleLayouts.toolAlign.noPos")); return false; }
  captures.value = { ...captures.value, [t]: { x, y } };
  return true;
}
function capture(): void {
  if (current.value < 0) { notify(i18n.global.t("plugins.flexibleLayouts.toolAlign.selectTool")); return; }
  captureFor(current.value);
}
function setReference(): void {
  if (current.value < 0) { notify(i18n.global.t("plugins.flexibleLayouts.toolAlign.selectTool")); return; }
  props.widget.referenceTool = current.value;
  captureFor(current.value);
}
function clearAll(): void { captures.value = {}; }

// O_t = O_ref + (M_t − M_ref). The reference's existing G10 offset is preserved; the invert switch
// flips the correction term if a machine's convention comes out mirrored (verify by re-selecting a
// tool after applying — its nozzle should sit on the crosshair).
function offsetFor(t: number): { x: number; y: number } | null {
  if (props.widget.referenceTool == null) return null;
  const ct = captures.value[t], cr = captures.value[props.widget.referenceTool];
  if (!ct || !cr) return null;
  const s = props.widget.invertOffsets ? -1 : 1;
  const ro = refOffsetXY();
  return { x: ro.x + s * (ct.x - cr.x), y: ro.y + s * (ct.y - cr.y) };
}
function g10For(t: number): string | null {
  const o = offsetFor(t);
  return o ? `G10 P${t} X${o.x.toFixed(3)} Y${o.y.toFixed(3)}` : null;
}
const anyApplicable = computed(() =>
  tools.value.some((t) => t.number !== props.widget.referenceTool && g10For(t.number)));

const rows = computed(() => tools.value.map((t) => {
  const cap = captures.value[t.number];
  const off = offsetFor(t.number);
  return {
    number: t.number,
    name: t.name || ("T" + t.number),
    isRef: t.number === props.widget.referenceTool,
    captured: cap ? `${cap.x.toFixed(2)}, ${cap.y.toFixed(2)}` : "—",
    offset: off ? `${off.x.toFixed(3)}, ${off.y.toFixed(3)}` : "—",
    g10: g10For(t.number),
  };
}));

async function applyTool(t: number): Promise<void> {
  const cmd = g10For(t);
  if (!cmd) return;
  if (await confirmApply([cmd])) void send(cmd);
}
async function applyAll(): Promise<void> {
  const cmds = tools.value
    .filter((t) => t.number !== props.widget.referenceTool)
    .map((t) => g10For(t.number))
    .filter((c): c is string => !!c);
  if (!cmds.length) return;
  if (await confirmApply(cmds)) void send(cmds.join("\n"));
}
function confirmApply(cmds: Array<string>): Promise<boolean> {
  return showConfirmDialog(
    i18n.global.t("plugins.flexibleLayouts.toolAlign.confirmTitle"),
    `${i18n.global.t("plugins.flexibleLayouts.toolAlign.confirmBody")}\n\n${cmds.join("\n")}`,
    "mdi-content-save-cog",
  );
}

onMounted(() => {
  const ms = props.widget.refreshMs ?? 0;
  if (ms > 0) timer = setInterval(() => { tick.value = Date.now(); }, ms);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.ta-root { min-height: 0; overflow: hidden; }
.ta-frozen { opacity: 0.55; pointer-events: none; }

.ta-cam { position: relative; min-height: 100px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; }
.ta-img { max-width: 100%; max-height: 100%; display: block; }
.ta-noimg { text-align: center; }

.ta-overlay { position: absolute; inset: 0; pointer-events: none; }
.ta-cross-h { position: absolute; left: 0; right: 0; top: var(--ta-cy); border-top: var(--ta-lw) solid var(--ta-col); }
.ta-cross-v { position: absolute; top: 0; bottom: 0; left: var(--ta-cx); border-left: var(--ta-lw) solid var(--ta-col); }
.ta-ring { position: absolute; left: var(--ta-cx); top: var(--ta-cy); transform: translate(-50%, -50%); border: var(--ta-lw) solid var(--ta-col); border-radius: 50%; }
.ta-dot { position: absolute; left: var(--ta-cx); top: var(--ta-cy); width: 4px; height: 4px; transform: translate(-50%, -50%); border-radius: 50%; background: var(--ta-col); }

.ta-btn { min-width: 0; }
.ta-step { max-width: 96px; }

.ta-table { min-height: 0; overflow: auto; }
.ta-grid { width: 100%; border-collapse: collapse; font-size: 0.8em; }
.ta-grid th { text-align: left; font-weight: 600; opacity: 0.7; padding: 1px 4px; }
.ta-grid td { padding: 1px 4px; border-top: 1px solid rgba(127, 127, 127, 0.2); }
.ta-num { font-family: monospace; font-variant-numeric: tabular-nums; }
.ta-ref { background: rgba(127, 127, 127, 0.08); }
.ta-badge { margin-left: 4px; font-size: 0.75em; opacity: 0.6; }
</style>
