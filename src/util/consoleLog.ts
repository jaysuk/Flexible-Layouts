/**
 * Shared logic behind the console-family widgets (the combined `console`, plus the split
 * `consoleInput`/`consoleOutput` halves): reading DWC's shared reply log and sending a command with
 * recall history. Factored out so the three widgets stay in lockstep rather than drifting copies.
 */
import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

export interface ConsoleLogEntry {
	type: string;
	title: string;
	message: string | null;
}

/** The most recent `rows` entries of DWC's shared console log (the same source its own console/
 *  EventList use), so asynchronous replies (e.g. an M122 report, unsolicited messages) show up even
 *  though they aren't returned by sendCode. Defensive access so widgets still mount where stubbed. */
export function useConsoleEntries(rows: () => number): ComputedRef<Array<ConsoleLogEntry>> {
	const uiStore = useUiStore();
	const logMessages = computed<Array<ConsoleLogEntry>>(() =>
		(uiStore as unknown as { logMessages?: Array<ConsoleLogEntry> }).logMessages ?? []);
	return computed(() => logMessages.value.slice(-rows()));
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

/** The command box: current text, ↑/↓ recall through recently-sent commands, and send. */
export function useConsoleSend(disabled: () => boolean) {
	const machineStore = useMachineStore();
	const cmd = ref("");
	const recent = ref<Array<string>>([]);
	let recallIdx = -1;

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
		recent.value.push(code);
		if (recent.value.length > 50) recent.value.shift();
		// logReply=true routes the command + reply into the shared log (which entries mirror); async
		// output arrives there too. Errors are logged by sendCode, so just swallow the rejection here.
		try {
			await machineStore.sendCode(code, true, true);
		} catch { /* already surfaced in the log */ }
	}

	return { cmd, recall, send };
}
