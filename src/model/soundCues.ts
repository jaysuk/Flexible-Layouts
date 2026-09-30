/**
 * Global event cues (MISSING-FEATURES-PLAN §B1): a sound and/or a vibration when the machine does something worth
 * hearing about - a job finishes or stops, the firmware pauses, a filament monitor or heater faults, an M291 message
 * box appears. Works on any page, installed once at plugin load like autoBackupNudges.ts and torn down on unload.
 *
 * Every detector is a RISING EDGE between two snapshots of the machine, never a level: a heater that stays faulted
 * cannot sound again every poll, and a machine that was already in some state when the page loaded (or when the
 * connection came back) makes no noise for it. Each event is opt-in per device (util/sound.ts) - silence is the default.
 *
 * A background tab still receives model updates (DWC keeps polling), so these still fire there, subject to the
 * browser's timer throttling - the settings text says so rather than promising real time.
 */
import { watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import { EVENT_HAPTICS, playCue, soundSettings, vibrate, type SoundEventName } from "../util/sound";

export interface CueSnapshot {
	status?: string;
	lastFileCancelled?: boolean;
	/** How many filament monitors currently report a fault. */
	filamentFaults: number;
	/** How many heaters are in the `fault` state. */
	heaterFaults: number;
	messageBox: boolean;
}

/** Filament-monitor statuses that mean something is wrong (`ok`, `noMonitor` and `noDataReceived` do not). */
const FILAMENT_FAULTS = new Set(["noFilament", "tooLittleMovement", "tooMuchMovement", "sensorError"]);
const RUNNING = new Set(["processing", "simulating", "resuming"]);
const PAUSING = new Set(["pausing", "paused"]);

interface ModelLike {
	state?: { status?: string; messageBox?: unknown };
	job?: { lastFileCancelled?: boolean };
	sensors?: { filamentMonitors?: Array<{ status?: string } | null | undefined> };
	heat?: { heaters?: Array<{ state?: string } | null | undefined> };
}

export function snapshotFromModel(model: unknown): CueSnapshot {
	const m = (model ?? {}) as ModelLike;
	return {
		status: m.state?.status,
		lastFileCancelled: m.job?.lastFileCancelled,
		filamentFaults: (m.sensors?.filamentMonitors ?? []).filter((f) => !!f?.status && FILAMENT_FAULTS.has(f.status)).length,
		heaterFaults: (m.heat?.heaters ?? []).filter((h) => h?.state === "fault").length,
		messageBox: !!m.state?.messageBox,
	};
}

/** The events that happened between two snapshots. Pure. */
export function detectCueEvents(prev: CueSnapshot, next: CueSnapshot): Array<SoundEventName> {
	const events: Array<SoundEventName> = [];
	const was = prev.status;
	const now = next.status;

	// The job ended. A run that goes straight from running to idle FINISHED - unless the OM says the file was
	// cancelled, which is how a cancel looks on firmware that skips the `cancelling` step.
	if (now === "idle" && was !== undefined && was !== "idle") {
		if (was !== undefined && RUNNING.has(was)) {
			events.push(next.lastFileCancelled ? "jobStopped" : "jobFinished");
		} else if (was === "cancelling" || PAUSING.has(was)) {
			events.push("jobStopped"); // cancelled while cancelling/paused
		}
	}
	// Halted (an emergency stop or a firmware error) from anything but halted.
	if (now === "halted" && was !== undefined && was !== "halted") {
		events.push("jobStopped");
	}
	// The firmware (or anyone) paused the job.
	if (now !== undefined && PAUSING.has(now) && was !== undefined && !PAUSING.has(was)) {
		events.push("pauseRequested");
	}
	if (next.filamentFaults > prev.filamentFaults) { events.push("filamentError"); }
	if (next.heaterFaults > prev.heaterFaults) { events.push("heaterFault"); }
	if (!prev.messageBox && next.messageBox) { events.push("messageBox"); }
	return events;
}

/** React to one event according to this device's settings. Exported for the settings page's Test buttons. */
export function fireEvent(name: SoundEventName): void {
	const setting = soundSettings.value.events[name];
	if (!setting.on) { return; }
	playCue(setting.cue);
	if (setting.haptic) { vibrate(EVENT_HAPTICS[name]); }
}

let stopWatch: (() => void) | null = null;
let stopConnectWatch: (() => void) | null = null;

export function installSoundCues(): void {
	if (stopWatch) { return; }
	const machineStore = useMachineStore();
	let prev: CueSnapshot | null = null;

	// A reconnect re-baselines: whatever state the machine came back in is not an event.
	stopConnectWatch = watch(() => machineStore.isConnected, (connected) => { if (!connected) { prev = null; } }, { immediate: true });

	stopWatch = watch(
		() => JSON.stringify(snapshotFromModel(machineStore.model)),
		(json) => {
			const next = JSON.parse(json) as CueSnapshot;
			const before = prev;
			prev = next;
			// The baseline must be a LOADED model: right after connecting the store is still empty (no status yet),
			// and the fill-in from empty is not a set of events. Nothing fires until a snapshot with a status exists.
			if (!before || before.status === undefined || !machineStore.isConnected) { return; }
			for (const event of detectCueEvents(before, next)) { fireEvent(event); }
		},
		{ immediate: true },
	);
}

export function uninstallSoundCues(): void {
	stopWatch?.();
	stopConnectWatch?.();
	stopWatch = null;
	stopConnectWatch = null;
}
