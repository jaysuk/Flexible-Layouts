/**
 * Machine-shared state of the firmware-change notifications: which firmware version the user last reviewed their files
 * against (the baseline) and which changes they have chosen to stop hearing about.
 *
 * Stored under a SIBLING key (`plugins.flexibleLayouts.firmwareChanges`) beside the layout profiles, on the board, so every
 * browser that opens the machine agrees - and NOT in the layout document, so it stays out of layout export, profiles, undo and
 * the shared-document tests. Per-device things (a browser's own toast cooldown, the scan cache) are in memory and never here.
 *
 * Change-event ids (`acknowledged`) are a contract with `dwc-gcode-core`: it never renames or removes one, precisely so an
 * acknowledgement stored here keeps meaning the same change.
 */
import { compareFirmwareVersions, parseFirmwareVersion } from "dwc-gcode-core";

import { useSettingsStore } from "@/stores/settings";

const PLUGIN_KEY = "flexibleLayouts";
const STATE_KEY = "firmwareChanges";

export interface FirmwareScanSummary {
	from: string;
	to: string;
	/** ISO time of the scan. */
	at: string;
	occurrences: number;
	files: number;
	events: number;
}

export interface FirmwareChangeState {
	/** The whole feature: scanning on connect, the toast, the report's pre-flight. */
	enabled: boolean;
	/** The "changed since <version>" squiggles in the editor. */
	editorWarnings: boolean;
	/** The main board's firmware version when the user last reviewed (or first connected); null before the first connect. */
	baseline: string | null;
	/** Change-event ids the user has chosen to ignore. */
	acknowledged: Array<string>;
	lastScan?: FirmwareScanSummary;
	/** `"<baseline>-><running>"` of the change that already raised its toast, so a second browser (or a reload) does not repeat it. */
	notifiedKey?: string;
}

export const DEFAULT_FIRMWARE_CHANGE_STATE: Readonly<FirmwareChangeState> = Object.freeze({
	enabled: true, editorWarnings: true, baseline: null, acknowledged: [],
});

function container(): Record<string, unknown> {
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, Record<string, unknown>>;
	if (!plugins[PLUGIN_KEY]) {
		plugins[PLUGIN_KEY] = {};
	}
	return plugins[PLUGIN_KEY];
}

/** A stored blob read defensively: a missing or damaged field falls back to its default rather than throwing. */
export function readFirmwareChangeState(): FirmwareChangeState {
	const raw = container()[STATE_KEY] as Partial<FirmwareChangeState> | undefined;
	const state: FirmwareChangeState = {
		enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_FIRMWARE_CHANGE_STATE.enabled,
		editorWarnings: typeof raw?.editorWarnings === "boolean" ? raw.editorWarnings : DEFAULT_FIRMWARE_CHANGE_STATE.editorWarnings,
		baseline: normaliseFirmwareVersion(raw?.baseline),
		acknowledged: Array.isArray(raw?.acknowledged) ? raw.acknowledged.filter((id): id is string => typeof id === "string") : [],
	};
	if (raw?.lastScan && typeof raw.lastScan === "object") { state.lastScan = raw.lastScan; }
	if (typeof raw?.notifiedKey === "string") { state.notifiedKey = raw.notifiedKey; }
	return state;
}

export function writeFirmwareChangeState(patch: Partial<FirmwareChangeState>): FirmwareChangeState {
	const next = { ...readFirmwareChangeState(), ...patch };
	container()[STATE_KEY] = next;
	return next;
}

/**
 * A board's reported version as something `compareFirmwareVersions` can parse, without the STM32 `(CAN0)`-style suffix - or
 * null when it does not parse (empty, "unknown", a build string we cannot read). Never guess: a null means "cannot check".
 */
export function normaliseFirmwareVersion(raw: unknown): string | null {
	if (typeof raw !== "string") { return null; }
	const trimmed = raw.split("(")[0].trim();
	return parseFirmwareVersion(trimmed) === null ? null : trimmed.replace(/^v/i, "");
}

/** The MAIN board's firmware version (`boards[0]`); expansion boards are ignored, as in FirmwareUpdateWidget's mixed-rig handling. */
export function mainBoardFirmwareVersion(model: unknown): string | null {
	const boards = (model as { boards?: Array<{ firmwareVersion?: string }> } | undefined)?.boards;
	return normaliseFirmwareVersion(boards?.[0]?.firmwareVersion);
}

export type CheckDecision = "record-baseline" | "scan" | "none";

/**
 * What a connect (or reconnect) should do.
 *  - disabled, or no readable running version: nothing.
 *  - no baseline yet: store the current version and stay QUIET - there is nothing to compare against, and a first-run toast
 *    about a change the user did not make would be noise.
 *  - the same version: nothing.
 *  - any other version, up or down: scan.
 */
export function decideCheck(state: Pick<FirmwareChangeState, "enabled" | "baseline">, running: string | null): CheckDecision {
	if (!state.enabled || running === null) { return "none"; }
	if (state.baseline === null) { return "record-baseline"; }
	return compareFirmwareVersions(state.baseline, running) === 0 ? "none" : "scan";
}

/** "Mark all as reviewed": the running version becomes the baseline, so the same change is not reported again. */
export function acknowledgeReview(running: string): FirmwareChangeState {
	return writeFirmwareChangeState({ baseline: normaliseFirmwareVersion(running) ?? running });
}

/** Ignore one change for good (idempotent). */
export function ignoreChange(eventId: string): FirmwareChangeState {
	const current = readFirmwareChangeState();
	return current.acknowledged.includes(eventId) ? current : writeFirmwareChangeState({ acknowledged: [...current.acknowledged, eventId] });
}

/** Stop ignoring a change. */
export function restoreChange(eventId: string): FirmwareChangeState {
	const current = readFirmwareChangeState();
	return writeFirmwareChangeState({ acknowledged: current.acknowledged.filter((id) => id !== eventId) });
}
