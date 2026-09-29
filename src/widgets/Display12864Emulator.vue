
<template>
	<div class="d12864-root d-flex flex-column ga-2">
		<div class="d-flex align-center ga-2 flex-wrap">
			<span class="text-caption text-medium-emphasis">{{ breadcrumb }}</span>
			<v-chip v-if="following" size="x-small" color="primary" variant="tonal" class="d12864-live"
					:title="$t('plugins.flexibleLayouts.display12864.liveHelp')">{{ $t("plugins.flexibleLayouts.display12864.live") }}</v-chip>
			<v-spacer />
			<!-- A preview has no live M291, so a sample box can be put up to see how a message box looks on the display. -->
			<v-menu>
				<template #activator="{ props: menuProps }">
					<v-btn v-bind="menuProps" size="x-small" variant="text" prepend-icon="mdi-message-alert-outline" class="d12864-box-button"
						   :title="$t('plugins.flexibleLayouts.display12864.messageBoxHelp')">{{ $t("plugins.flexibleLayouts.display12864.messageBox") }}</v-btn>
				</template>
				<v-list density="compact">
					<v-list-item v-for="sample in SAMPLE_BOXES" :key="sample.id" :data-sample-box="sample.id"
								 :title="$t(`plugins.flexibleLayouts.display12864.sample.${sample.id}`)" @click="showSampleMessageBox(sample.id)" />
				</v-list>
			</v-menu>
			<v-btn size="x-small" variant="text" prepend-icon="mdi-restart" :title="$t('plugins.flexibleLayouts.display12864.restartHelp')"
				   @click="restart">{{ $t("plugins.flexibleLayouts.display12864.restart") }}</v-btn>
			<v-btn size="x-small" variant="text" prepend-icon="mdi-refresh" :loading="loading"
				   :title="$t('plugins.flexibleLayouts.display12864.reloadHelp')" @click="reload">{{ $t("plugins.flexibleLayouts.display12864.reload") }}</v-btn>
		</div>

		<!-- The LCD. Click a button to press it; focus it and use the arrow keys / Enter for the knob. -->
		<div class="d12864-bezel" @keydown="onKey" tabindex="0" :aria-label="$t('plugins.flexibleLayouts.display12864.screenLabel')">
			<canvas ref="canvas" class="d12864-lcd" :width="COLS * SCALE" :height="ROWS * SCALE" @click="onCanvasClick" />
		</div>

		<div class="d-flex align-center justify-center ga-3">
			<v-btn icon="mdi-rotate-left" size="small" variant="tonal" :title="$t('plugins.flexibleLayouts.display12864.turnLeft')" @click="turn(-1)" />
			<v-btn icon="mdi-circle-double" size="large" color="primary" variant="tonal" :title="$t('plugins.flexibleLayouts.display12864.push')" @click="turn(0)" />
			<v-btn icon="mdi-rotate-right" size="small" variant="tonal" :title="$t('plugins.flexibleLayouts.display12864.turnRight')" @click="turn(1)" />
		</div>
		<div class="text-caption text-medium-emphasis text-center">{{ $t("plugins.flexibleLayouts.display12864.controlsHint") }}</div>

		<!-- What RRF would refuse to load: it stops at the first bad line and blanks the menu. -->
		<v-alert v-if="problems.length" type="warning" variant="tonal" density="compact" class="d12864-problems">
			<div v-for="(p, i) in problems" :key="i" class="text-body-2">
				<strong>{{ $t("plugins.flexibleLayouts.display12864.lineCol", { line: p.line, column: p.rrfColumn }) }}</strong> {{ p.message }}
				<span v-if="i === 0" class="text-medium-emphasis"> - {{ $t("plugins.flexibleLayouts.display12864.stopsHere") }}</span>
			</div>
		</v-alert>

		<div v-if="commands.length" class="text-caption">
			<div class="font-weight-medium">{{ $t("plugins.flexibleLayouts.display12864.wouldSend") }}</div>
			<div v-for="(c, i) in commands" :key="i" class="d12864-command">{{ c }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

import { type DisplayMessageBox, MenuDisplay, type MenuError, resolveMenu } from "dwc-gcode-core";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

import { defaultMachineIO } from "../model/configBackup/machineIO";
import { createEmulatorHost } from "../model/display12864/host";
import { type MenuSource, emptyMenuSource, loadMenuSource } from "../model/display12864/menuSource";

const props = defineProps<{
	/** The menu to show first (default `main`). When it isn't `main`, `main` sits underneath so `return` works. */
	menu?: string;
	/** Pre-loaded menu files. When omitted they are read from the printer's `0:/menu/`. */
	source?: MenuSource;
	/** Bump to re-read the menu directory (e.g. after the file being edited is saved). */
	reloadKey?: number;
	/**
	 * Unsaved text of menu files, by name (case-insensitive), laid over what is on the card - so the preview
	 * follows edits as they are typed. Only files open in an editor that can hand over its buffer appear here;
	 * anything else shows as saved. Changing it restarts the display at the menu it was showing.
	 */
	overrides?: Record<string, string>;
}>();

const COLS = 128;
const ROWS = 64;
const SCALE = 4;
const REFRESH_MS = 250; // RRF's own display refresh interval (Display.cpp NormalRefreshMillis)

// The M291 boxes the display can draw (modes 0-3), as a real `M291 R"..." P"..." S<mode>` would produce them.
const SAMPLE_BOXES: ReadonlyArray<{ id: string; box: Omit<DisplayMessageBox, "title" | "message" | "seq"> }> = [
	{ id: "ok", box: { mode: 2 } }, // M291 S2: OK
	{ id: "okCancel", box: { mode: 3 } }, // M291 S3: OK and Cancel
	{ id: "close", box: { mode: 1 } }, // M291 S1: the display shows Cancel for this (bit 1 is Cancel)
	{ id: "jog", box: { mode: 3, controls: { x: true, y: true, z: true } } }, // M291 S3 X1 Y1 Z1
];
let boxSeq = 0;

const machineStore = useMachineStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const loading = ref(false);
const source = shallowRef<MenuSource>(props.source ?? emptyMenuSource());
// What the display actually reads: the card's files with any unsaved text laid over them.
const effective = computed<MenuSource>(() => {
	const over = Object.entries(props.overrides ?? {});
	if (over.length === 0) return source.value;
	const files = new Map(source.value.files);
	for (const [name, text] of over) files.set(name.toLowerCase(), text);
	return { files, images: source.value.images };
});
const following = computed(() => Object.keys(props.overrides ?? {}).length > 0);
const commands = ref<Array<string>>([]);
const breadcrumb = ref("");
const problems = ref<Array<MenuError>>([]);

const display = shallowRef<MenuDisplay | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

// The message box being previewed. Real RRF holds the box in the firmware and takes it down once the M292 a button
// sent has been processed; the preview has no firmware, so it does the same: a recorded M292 acknowledges the box.
const sampleBox = shallowRef<DisplayMessageBox | null>(null);
let acknowledged = false;

/** Starts from `main`. `keep` (a previous display's menu stack) reopens the menus that were open, so a
 *  reload or a live edit doesn't throw the user back to the top; without it, `props.menu` opens on top of `main`. */
function startMenu(keep?: ReadonlyArray<string>): void {
	const host = createEmulatorHost({
		source: effective.value,
		model: () => machineStore.model as unknown as Record<string, unknown>,
		io: props.source ? undefined : defaultMachineIO(),
		onCommand: (c) => {
			commands.value = [c, ...commands.value].slice(0, 12);
			if (/^M292\b/i.test(c)) acknowledged = true;
		},
	});
	const d = new MenuDisplay(host);
	d.start();
	if (keep !== undefined && keep.length > 1) {
		for (const name of keep.slice(1)) d.load(name);
	} else {
		const wanted = props.menu ?? "main";
		if (wanted.toLowerCase() !== "main") d.load(wanted);
	}
	display.value = d;
	if (sampleBox.value !== null) d.setMessageBox(sampleBox.value); // a restart (a live edit, a reload) keeps the box up
	redraw();
}

/** Puts one of the sample boxes up, replacing any that is showing. */
function showSampleMessageBox(id: string): void {
	const sample = SAMPLE_BOXES.find((s) => s.id === id);
	const d = display.value;
	if (sample === undefined || d === null) return;
	sampleBox.value = {
		...sample.box,
		title: i18n.global.t("plugins.flexibleLayouts.display12864.sampleTitle"),
		message: i18n.global.t("plugins.flexibleLayouts.display12864.sampleMessage"),
		seq: ++boxSeq,
	};
	d.setMessageBox(sampleBox.value);
	redraw();
}

/** What the firmware does once an M292 has been processed: the box goes, and the menu underneath is reloaded. */
function acknowledgeMessageBox(): void {
	if (!acknowledged) return;
	acknowledged = false;
	sampleBox.value = null;
	display.value?.setMessageBox(null);
}

async function reload(): Promise<void> {
	const keep = display.value?.menuStack;
	if (props.source) {
		source.value = props.source;
	} else {
		loading.value = true;
		try {
			source.value = await loadMenuSource(defaultMachineIO());
		} catch {
			source.value = emptyMenuSource();
		} finally {
			loading.value = false;
		}
	}
	startMenu(keep);
}

function restart(): void {
	commands.value = [];
	sampleBox.value = null;
	acknowledged = false;
	startMenu();
}

function analyse(d: MenuDisplay): void {
	// Every problem in the menu now showing, not only the one RRF stops at.
	const name = d.currentMenu;
	const text = name ? effective.value.files.get(name.toLowerCase()) : undefined;
	problems.value = text === undefined ? [] : [...resolveMenu(text).errors];
	breadcrumb.value = d.menuStack.join(" › ");
}

function paint(d: MenuDisplay): void {
	const ctx = canvas.value?.getContext?.("2d");
	if (!ctx) return; // no canvas (tests / SSR)
	const dark = getComputedStyle(canvas.value!).getPropertyValue("--d12864-off") || "#1b3f8f";
	const lit = getComputedStyle(canvas.value!).getPropertyValue("--d12864-on") || "#e9f1ff";
	ctx.fillStyle = dark;
	ctx.fillRect(0, 0, COLS * SCALE, ROWS * SCALE);
	ctx.fillStyle = lit;
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			// A 1-device-pixel gap between dots gives the LCD look.
			if (d.lcd.getPixel(y, x)) ctx.fillRect(x * SCALE, y * SCALE, SCALE - 1, SCALE - 1);
		}
	}
}

function redraw(): void {
	const d = display.value;
	if (!d) return;
	d.refresh();
	analyse(d);
	paint(d);
}

function turn(clicks: number): void {
	display.value?.encoder(clicks);
	acknowledgeMessageBox();
	redraw();
}

function onKey(e: KeyboardEvent): void {
	const map: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Enter: 0, " ": 0 };
	if (e.key in map) {
		e.preventDefault();
		turn(map[e.key]);
	}
}

function onCanvasClick(e: MouseEvent): void {
	const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	const x = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
	const y = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
	display.value?.touch(x, y);
	acknowledgeMessageBox();
	redraw();
}

onMounted(() => {
	void reload();
	timer = setInterval(redraw, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

watch(() => props.reloadKey, () => { void reload(); });
watch(() => props.menu, () => { startMenu(); });
// A live edit: the display restarts on the new text, at the menu it was showing.
watch(() => props.overrides, () => { startMenu(display.value?.menuStack); });

defineExpose({ display, reload, turn, restart, showSampleMessageBox });
</script>

<style scoped>
.d12864-root { --d12864-off: #1b3f8f; --d12864-on: #e9f1ff; }
.d12864-bezel {
	background: #101418;
	padding: 10px;
	border-radius: 6px;
	outline-offset: 2px;
}
.d12864-lcd {
	display: block;
	width: 100%;
	image-rendering: pixelated;
	background: var(--d12864-off);
	cursor: pointer;
}
.d12864-command { font-family: monospace; }
.d12864-problems { max-height: 9rem; overflow: auto; }
</style>
