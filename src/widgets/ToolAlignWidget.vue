<template>
  <div class="ta-root fill-height d-flex flex-row" :class="{ 'ta-frozen': disabledNow }">
    <!-- Camera with crosshair / target overlay -->
    <div class="ta-cam flex-shrink-0">
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

    <!-- Controls + offsets table, stacked in their own scrollable column to the right of the
         camera - was a single top-to-bottom column with the camera squeezed in above everything
         else; a wide-but-short panel left almost no room for the image. -->
    <div class="ta-controls d-flex flex-column">
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

    <!-- Camera position: jump the toolhead to the saved spot, or record the current spot. -->
    <div class="ta-cam-pos d-flex flex-wrap align-center ga-1 px-1 pt-1 flex-shrink-0">
      <v-btn size="small" variant="tonal" prepend-icon="mdi-camera-marker" :disabled="disabledNow || !hasCameraPos" @click="gotoCamera">
        {{ $t("plugins.flexibleLayouts.toolAlign.gotoCamera") }}
      </v-btn>
      <v-btn size="small" variant="text" prepend-icon="mdi-crosshairs" :disabled="disabledNow" @click="setCamera">
        {{ $t("plugins.flexibleLayouts.toolAlign.setCamera") }}
      </v-btn>
      <v-spacer />
      <v-btn v-if="widget.startCommand" size="small" variant="text" :disabled="disabledNow" @click="runStart">
        {{ $t("plugins.flexibleLayouts.toolAlign.start") }}
      </v-btn>
      <v-btn v-if="widget.finishCommand" size="small" variant="text" :disabled="disabledNow" @click="runFinish">
        {{ $t("plugins.flexibleLayouts.toolAlign.finish") }}
      </v-btn>
    </div>

    <!-- Fine jog to bring the nozzle onto the crosshair (and down onto the Z switch) -->
    <div class="ta-jog d-flex flex-wrap align-center ga-1 px-1 pt-1 flex-shrink-0">
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('X', -1)">X−</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('X', 1)">X+</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('Y', -1)">Y−</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('Y', 1)">Y+</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('Z', -1)">Z−</v-btn>
      <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="nudge('Z', 1)">Z+</v-btn>
      <v-spacer />
      <v-select v-model="step" :items="stepItems" item-title="title" item-value="value"
                density="compact" variant="outlined" hide-details class="ta-step" />
    </div>

    <!-- Capture / reference actions -->
    <div class="ta-actions d-flex flex-wrap align-center ga-1 px-1 pt-1 flex-shrink-0">
      <v-btn size="small" variant="tonal" prepend-icon="mdi-target" :disabled="disabledNow || current < 0" @click="setReference">
        {{ $t("plugins.flexibleLayouts.toolAlign.setRef") }}
      </v-btn>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-crosshairs-gps" :disabled="disabledNow || current < 0" @click="capture">
        {{ $t("plugins.flexibleLayouts.toolAlign.capture") }}
      </v-btn>
      <v-btn v-if="widget.enableZ" size="small" variant="tonal" prepend-icon="mdi-arrow-collapse-down"
             :disabled="disabledNow || current < 0" @click="captureZ">
        {{ $t("plugins.flexibleLayouts.toolAlign.captureZ") }}
      </v-btn>
      <v-btn v-if="widget.enableZ && widget.zProbeCommand" size="small" variant="text" prepend-icon="mdi-arrow-down-bold-circle-outline"
             :disabled="disabledNow || current < 0" @click="probeZ">
        {{ $t("plugins.flexibleLayouts.toolAlign.probeZ") }}
      </v-btn>
      <v-btn size="small" variant="text" :disabled="disabledNow || !hasCaptures" @click="clearAll">
        {{ $t("plugins.flexibleLayouts.toolAlign.clear") }}
      </v-btn>
    </div>
    <div v-if="unhomedNow.length" class="text-caption text-warning px-2 pt-1 flex-shrink-0">
      <v-icon size="14">mdi-alert</v-icon> {{ $t("plugins.flexibleLayouts.homedCheck.notHomed", { axes: unhomedNow.join(", ") }) }}
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
        <v-btn v-if="widget.saveCommand" size="small" variant="tonal" prepend-icon="mdi-content-save-check"
               :disabled="disabledNow" @click="saveOffsets">
          {{ $t("plugins.flexibleLayouts.toolAlign.save") }}
        </v-btn>
        <v-switch v-model="invert" density="compact" hide-details color="primary"
                  :label="$t('plugins.flexibleLayouts.toolAlign.invert')" />
      </div>
      <div class="text-caption text-medium-emphasis mt-1">{{ $t("plugins.flexibleLayouts.toolAlign.persistHint") }}</div>
    </div>
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
import { type AxisCapture, computeToolOffset, formatG10, type ToolOffset } from "../util/toolAlign";
import { resolveOmPath } from "../util/omPath";
import { unhomedAxes } from "../util/homedCheck";

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
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y"]));

function refOffset(): ToolOffset {
  const arr = resolveOmPath(machineStore.model, "tools");
  const t = Array.isArray(arr) ? (arr as Array<RawTool | null>).find((x) => x?.number === props.widget.referenceTool) : null;
  const off = t?.offsets;
  const at = (i: number) => (Array.isArray(off) && typeof off[i] === "number" ? off[i] : 0);
  return { x: at(0), y: at(1), z: at(2) };
}

// --- Alignment state (captures are a per-session measurement, not part of the saved layout) ---
const captures = ref<Record<number, AxisCapture>>({});
const hasCaptures = computed(() => Object.keys(captures.value).length > 0);

const step = ref<number>(props.widget.jogStep ?? 0.1);
// Titles carry the unit so the value isn't clipped by a suffix inside the narrow select.
const stepItems = [0.01, 0.05, 0.1, 0.5, 1].map((n) => ({ title: `${n} mm`, value: n }));

const invert = computed({
  get: () => !!props.widget.invertOffsets,
  set: (v: boolean) => { props.widget.invertOffsets = v; },
});

const hasCameraPos = computed(() => typeof props.widget.cameraX === "number" && typeof props.widget.cameraY === "number");

function notify(msg: string, level: LogLevel = LogLevel.warning): void {
  uiStore.makeNotification(level, i18n.global.t("plugins.flexibleLayouts.widgets.toolAlign"), msg);
}
function send(code: string): Promise<unknown> {
  return machineStore.sendCode(code).catch((e: unknown) => notify((e as Error)?.message ?? String(e), LogLevel.error));
}
const taT = (k: string) => i18n.global.t(`plugins.flexibleLayouts.toolAlign.${k}`);

function select(n: number): void {
  if (disabledNow.value) return;
  // Pressing the already-selected tool's button deselects it (T-1 = no tool) rather than re-sending
  // the same T-code, so the button acts as a toggle.
  void send(n === current.value ? "T-1" : `T${n}`);
}
function nudge(letter: "X" | "Y" | "Z", dir: number): void {
  if (disabledNow.value) return;
  const d = dir * step.value;
  const feed = props.widget.jogFeed || 6000;
  void send(`M120\nG91\nG1 ${letter}${d} F${feed}\nG90\nM121`);
}

// --- Captures: XY from the camera crosshair, Z from a switch/probe (independent) ---
function captureXY(t: number): boolean {
  const x = machinePos("X"), y = machinePos("Y");
  if (x == null || y == null) { notify(taT("noPos")); return false; }
  captures.value = { ...captures.value, [t]: { ...captures.value[t], x, y } };
  return true;
}
function captureZ(): void {
  if (current.value < 0) { notify(taT("selectTool")); return; }
  const z = machinePos("Z");
  if (z == null) { notify(taT("noPos")); return; }
  captures.value = { ...captures.value, [current.value]: { ...captures.value[current.value], z } };
}
function capture(): void {
  if (current.value < 0) { notify(taT("selectTool")); return; }
  captureXY(current.value);
}
function setReference(): void {
  if (current.value < 0) { notify(taT("selectTool")); return; }
  props.widget.referenceTool = current.value;
  captureXY(current.value);
}
function clearAll(): void { captures.value = {}; }

function probeZ(): void {
  if (disabledNow.value || !props.widget.zProbeCommand) return;
  void send(props.widget.zProbeCommand);
}

// --- Camera position (machine coords) + lifecycle hooks ---
function setCamera(): void {
  const x = machinePos("X"), y = machinePos("Y"), z = machinePos("Z");
  if (x == null || y == null) { notify(taT("noPos")); return; }
  props.widget.cameraX = x;
  props.widget.cameraY = y;
  if (z != null) props.widget.cameraZ = z;
  notify(taT("cameraSaved"), LogLevel.success);
}
function gotoCamera(): void {
  if (disabledNow.value) return;
  const w = props.widget;
  if (w.cameraX == null || w.cameraY == null) { notify(taT("setCameraFirst")); return; }
  // G53 = machine coordinates for that line, so the active tool's (mid-calibration) offset can't shift
  // where the move lands. Lift to a safe Z first (if set), travel in XY, then descend to the focus Z.
  const g = (w.useG53 ?? true) ? "G53 " : "";
  const f = w.travelFeed || 6000;
  const zf = w.jogFeed || 1200;
  const lines = ["M120", "G90"];
  if (typeof w.safeZ === "number") lines.push(`${g}G1 Z${w.safeZ} F${zf}`);
  lines.push(`${g}G1 X${w.cameraX} Y${w.cameraY} F${f}`);
  if (typeof w.cameraZ === "number") lines.push(`${g}G1 Z${w.cameraZ} F${zf}`);
  lines.push("M121");
  void send(lines.join("\n"));
}
function runStart(): void { if (props.widget.startCommand) void send(props.widget.startCommand); }
function runFinish(): void { if (props.widget.finishCommand) void send(props.widget.finishCommand); }

// --- Offsets -----------------------------------------------------------------
function offsetFor(t: number): ToolOffset | null {
  if (props.widget.referenceTool == null) return null;
  const ct = captures.value[t], cr = captures.value[props.widget.referenceTool];
  if (!ct || !cr) return null;
  return computeToolOffset(cr, ct, refOffset(), !!props.widget.invertOffsets);
}
function g10For(t: number): string | null {
  const o = offsetFor(t);
  return o ? formatG10(t, o) : null;
}
const anyApplicable = computed(() =>
  tools.value.some((t) => t.number !== props.widget.referenceTool && g10For(t.number)));

function fmtTriple(c?: AxisCapture): string {
  if (!c) return "—";
  const parts: Array<string> = [];
  if (typeof c.x === "number") parts.push(c.x.toFixed(2));
  if (typeof c.y === "number") parts.push(c.y.toFixed(2));
  if (props.widget.enableZ && typeof c.z === "number") parts.push(`Z${c.z.toFixed(2)}`);
  return parts.length ? parts.join(", ") : "—";
}
function fmtOffset(o: ToolOffset | null): string {
  if (!o) return "—";
  const parts: Array<string> = [];
  if (typeof o.x === "number") parts.push(o.x.toFixed(3));
  if (typeof o.y === "number") parts.push(o.y.toFixed(3));
  if (props.widget.enableZ && typeof o.z === "number") parts.push(`Z${o.z.toFixed(3)}`);
  return parts.length ? parts.join(", ") : "—";
}

const rows = computed(() => tools.value.map((t) => {
  const off = offsetFor(t.number);
  return {
    number: t.number,
    name: t.name || ("T" + t.number),
    isRef: t.number === props.widget.referenceTool,
    captured: fmtTriple(captures.value[t.number]),
    offset: fmtOffset(off),
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
  if (props.widget.saveCommand) cmds.push(props.widget.saveCommand);
  if (await confirmApply(cmds)) void send(cmds.join("\n"));
}
async function saveOffsets(): Promise<void> {
  if (!props.widget.saveCommand) return;
  if (await confirmApply([props.widget.saveCommand])) void send(props.widget.saveCommand);
}
async function confirmApply(cmds: Array<string>): Promise<boolean> {
  // A user hit a DWC-internal crash here in the wild (an uncaught error deep in the confirm-dialog
  // machinery) that took down the whole widget tile. Whatever the cause, a failed confirm prompt
  // should never be worse than "assume not confirmed" - so degrade to a notification instead of
  // letting it propagate and crash the widget.
  try {
    return await showConfirmDialog(
      taT("confirmTitle"),
      `${taT("confirmBody")}\n\n${cmds.join("\n")}`,
      "mdi-content-save-cog",
    );
  } catch (e) {
    notify((e as Error)?.message ?? String(e), LogLevel.error);
    return false;
  }
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

/* Camera sits in its own left-hand column now (was a top strip above everything else, which left
   almost no room for the actual image on a wide-but-short panel). A percentage flex-basis keeps it
   proportional as the whole widget resizes, clamped so it neither vanishes nor swallows the panel. */
.ta-cam {
  position: relative; flex: 0 0 40%; min-width: 110px; max-width: 320px; min-height: 100px;
  display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000;
}
.ta-img { max-width: 100%; max-height: 100%; display: block; }
.ta-noimg { text-align: center; }

.ta-controls { flex: 1 1 auto; min-width: 0; overflow-y: auto; }

.ta-overlay { position: absolute; inset: 0; pointer-events: none; }
.ta-cross-h { position: absolute; left: 0; right: 0; top: var(--ta-cy); border-top: var(--ta-lw) solid var(--ta-col); }
.ta-cross-v { position: absolute; top: 0; bottom: 0; left: var(--ta-cx); border-left: var(--ta-lw) solid var(--ta-col); }
.ta-ring { position: absolute; left: var(--ta-cx); top: var(--ta-cy); transform: translate(-50%, -50%); border: var(--ta-lw) solid var(--ta-col); border-radius: 50%; }
.ta-dot { position: absolute; left: var(--ta-cx); top: var(--ta-cy); width: 4px; height: 4px; transform: translate(-50%, -50%); border-radius: 50%; background: var(--ta-col); }

.ta-btn { min-width: 0; }
/* Was 92-116px, which visibly truncated even the shortest option ("0.1 mm") to "0.1 ..." - a
   compact outlined select's own padding plus its dropdown-arrow affix eats more of that budget
   than the text itself gets. Widened so every option in stepItems renders in full. */
.ta-step { max-width: 150px; min-width: 112px; }

.ta-table { min-height: 0; overflow: auto; }
.ta-grid { width: 100%; border-collapse: collapse; font-size: 0.8em; }
.ta-grid th { text-align: left; font-weight: 600; opacity: 0.7; padding: 1px 4px; }
.ta-grid td { padding: 1px 4px; border-top: 1px solid rgba(127, 127, 127, 0.2); }
.ta-num { font-family: monospace; font-variant-numeric: tabular-nums; }
.ta-ref { background: rgba(127, 127, 127, 0.08); }
.ta-badge { margin-left: 4px; font-size: 0.75em; opacity: 0.6; }
</style>
