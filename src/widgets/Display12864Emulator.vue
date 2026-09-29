
<template>
	<div class="d12864-root d-flex flex-column ga-2">
		<div class="d-flex align-center ga-2 flex-wrap">
			<span class="text-caption text-medium-emphasis">{{ breadcrumb }}</span>
			<v-spacer />
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
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

import { MenuDisplay, type MenuError, resolveMenu } from "dwc-gcode-core";
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
}>();

const COLS = 128;
const ROWS = 64;
const SCALE = 4;
const REFRESH_MS = 250; // RRF's own display refresh interval (Display.cpp NormalRefreshMillis)

const machineStore = useMachineStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const loading = ref(false);
const source = shallowRef<MenuSource>(props.source ?? emptyMenuSource());
const commands = ref<Array<string>>([]);
const breadcrumb = ref("");
const problems = ref<Array<MenuError>>([]);

const display = shallowRef<MenuDisplay | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

function startMenu(): void {
	const host = createEmulatorHost({
		source: source.value,
		model: () => machineStore.model as unknown as Record<string, unknown>,
		io: props.source ? undefined : defaultMachineIO(),
		onCommand: (c) => { commands.value = [c, ...commands.value].slice(0, 12); },
	});
	const d = new MenuDisplay(host);
	d.start();
	const wanted = props.menu ?? "main";
	if (wanted.toLowerCase() !== "main") d.load(wanted);
	display.value = d;
	redraw();
}

async function reload(): Promise<void> {
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
	startMenu();
}

function restart(): void {
	commands.value = [];
	startMenu();
}

function analyse(d: MenuDisplay): void {
	// Every problem in the menu now showing, not only the one RRF stops at.
	const name = d.currentMenu;
	const text = name ? source.value.files.get(name.toLowerCase()) : undefined;
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
	redraw();
}

onMounted(() => {
	void reload();
	timer = setInterval(redraw, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

watch(() => props.reloadKey, () => { void reload(); });
watch(() => props.menu, () => { startMenu(); });

defineExpose({ display, reload, turn, restart });
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
