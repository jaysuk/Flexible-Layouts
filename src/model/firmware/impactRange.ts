/**
 * Which firmware range the editor's "changed since <version>" squiggles are drawn for.
 *
 * Two sources, the pre-flight winning because it is what the user is looking at right now:
 *  - the firmware-update widget has a release selected: from the running version to that release ("what would break if I flash this");
 *  - otherwise, a firmware change nobody has reviewed yet: from the baseline (where the files were last reviewed) to the running
 *    version.
 * `null` (no squiggles) when the feature or the editor setting is off, when either version cannot be read, or when the range is empty.
 * Reactive: it reads the settings store and the machine model, so a computed over it re-evaluates when either changes.
 */
import { ref } from "vue";

import { compareFirmwareVersions } from "dwc-gcode-core";

import { useMachineStore } from "@/stores/machine";

import { mainBoardFirmwareVersion, normaliseFirmwareVersion, readFirmwareChangeState } from "./changeState";

/** The release the firmware-update widget currently has selected, as a version; `null` when none or it cannot be parsed. */
export const preflightTarget = ref<string | null>(null);

export function setPreflightTarget(tag: string | null): void {
	preflightTarget.value = tag === null ? null : normaliseFirmwareVersion(tag);
}

export interface FirmwareRange {
	from: string;
	to: string;
}

export function currentImpactRange(): FirmwareRange | null {
	const state = readFirmwareChangeState();
	if (!state.enabled || !state.editorWarnings) { return null; }
	const running = mainBoardFirmwareVersion(useMachineStore().model);
	if (running === null) { return null; }
	const target = preflightTarget.value;
	const range: FirmwareRange | null = target !== null
		? { from: running, to: target }
		: state.baseline !== null ? { from: state.baseline, to: running } : null;
	return range !== null && compareFirmwareVersions(range.from, range.to) !== 0 ? range : null;
}
