/**
 * Shared logic behind the console-family widgets (`console` - optionally with its own input row via
 * showInput - plus the standalone `consoleInput`): reading DWC's shared reply log and sending a
 * command with recall history. Factored out so the widgets stay in lockstep rather than drifting
 * copies. (A third, `consoleOutput` - console with no input row - was retired into `console` with
 * showInput:false; see the v7→v8 document migration.)
 */
import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from "vue";

import { useCacheStore } from "@/stores/cache";
import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

// Same per-browser cache-store mechanism (and PLUGIN_KEY casing) as whatsNew.ts's lastSeenVersion.
const PLUGIN_KEY = "flexibleLayouts";
const HISTORY_KEY = "consoleHistory";
const HISTORY_LIMIT = 50;

// DWC's own shared log (uiStore.logMessages) is unbounded for the session - there's no reason for
// this widget to impose a smaller, user-invisible cap on top of that (that WAS the widget's own
// `rows` option, and it silently hid real scrollback - see the v7→v8 migration). This is purely a
// DOM-safety ceiling for an extremely long-running session, set far above anything a real console
// widget would ever need to show at once, not a "recent history" feature.
const MAX_RENDERED_ENTRIES = 1000;

export interface ConsoleLogEntry {
	type: string;
	title: string;
	message: string | null;
}

/** DWC's shared console log (the same source its own console/EventList use) - the full available
 *  backlog (up to a generous DOM-safety ceiling, not a small "recent lines" cap), so asynchronous
 *  replies (e.g. an M122 report, unsolicited messages) show up even though they aren't returned by
 *  sendCode. Defensive access so widgets still mount where stubbed. */
export function useConsoleEntries(): ComputedRef<Array<ConsoleLogEntry>> {
	const uiStore = useUiStore();
	const logMessages = computed<Array<ConsoleLogEntry>>(() =>
		(uiStore as unknown as { logMessages?: Array<ConsoleLogEntry> }).logMessages ?? []);
	return computed(() => logMessages.value.slice(-MAX_RENDERED_ENTRIES));
}

/** Auto-scroll a log container to the bottom whenever the entry count grows. */
export function useAutoScroll(entries: ComputedRef<Array<unknown>>, container: Ref<HTMLElement | null>): void {
	watch(() => entries.value.length, async () => {
		await nextTick();
		if (container.value) {
			container.value.scrollTop = container.value.scrollHeight;
		}
	});
}

/** The command box: current text, ↑/↓ recall through recently-sent commands, and send.
 *
 *  History is read from and written to the cache store's per-plugin data bag (the same mechanism
 *  whatsNew.ts uses for lastSeenVersion), NOT a local ref - a local ref starts empty on every mount
 *  and is never shared between two console-family widgets on the same layout, which is what made
 *  recall look broken (there genuinely was no history to recall, every time). DWC's own native
 *  command box has an equivalent shared, persisted list (cacheStore.addLastSentCode /
 *  lastSentCodes), but that specific method isn't part of the plugin-facing cache-store surface, so
 *  this keeps its own list under FL's own plugin key instead of trying to share DWC's. */
export function useConsoleSend(disabled: () => boolean) {
	const machineStore = useMachineStore();
	const cacheStore = useCacheStore();
	const cmd = ref("");
	let recallIdx = -1;

	const recent = computed<Array<string>>(() => {
		const plugins = cacheStore.plugins as Record<string, Record<string, unknown>> | undefined;
		const v = plugins?.[PLUGIN_KEY]?.[HISTORY_KEY];
		return Array.isArray(v) ? (v as Array<string>) : [];
	});

	function recall(dir: number): void {
		if (!recent.value.length) return;
		recallIdx = Math.max(-1, Math.min(recent.value.length - 1, recallIdx + dir));
		cmd.value = recallIdx < 0 ? "" : recent.value[recent.value.length - 1 - recallIdx];
	}

	async function send(): Promise<void> {
		const code = cmd.value.trim();
		if (!code || disabled()) return;
		cmd.value = "";
		recallIdx = -1;
		// Dedupe-and-move-to-end, matching DWC's own addLastSentCode - repeating the same command
		// (very common: jogging, temperature nudges) shouldn't fill recall history with duplicates.
		const next = [...recent.value.filter((c) => c !== code), code].slice(-HISTORY_LIMIT);
		cacheStore.setPluginData(PLUGIN_KEY, HISTORY_KEY, next);
		// logReply=true routes the command + reply into the shared log (which entries mirror); async
		// output arrives there too. Errors are logged by sendCode, so just swallow the rejection here.
		try {
			await machineStore.sendCode(code, true, true);
		} catch { /* already surfaced in the log */ }
	}

	return { cmd, recall, send };
}
