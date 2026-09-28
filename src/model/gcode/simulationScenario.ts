/**
 * The persistence half of the offline stepper's SCENARIO - everything a person sets up to test how a
 * macro reacts (starting position, object-model values, `param.*`, globals, message-box answers).
 * The model (`SimulationInputs`, its JSON form, every edit helper) lives in
 * `dwc-gcode-core/stepper/simulation`, shared with `duet-gcode-postprocessor`; this module keeps only what is
 * inherently host-specific: `localStorage`, which `dwc-gcode-core` can't depend on.
 *
 * One entry per file path, replacing the two separate ones this used to keep
 * (`simulatedValues.ts`'s object-model values and `messageBoxAnswers.ts`'s answers). Those two are
 * still READ when no scenario has been saved yet, so values a person already entered survive the
 * change; the first save then writes the scenario and clears the old entries.
 */

import {
	emptySimulationInputs, isEmptySimulationInputs, simulationInputsFromJSON, simulationInputsToJSON,
	type SimulationInputs,
} from "dwc-gcode-core/stepper/simulation";

import { loadMessageBoxAnswers, saveMessageBoxAnswers } from "./messageBoxAnswers";
import { loadSimulatedOverrides, saveSimulatedOverrides } from "./simulatedValues";

const LS_KEY_PREFIX = "flexibleLayouts.stepperScenario.";

function storageKeyFor(filePath: string): string {
	return LS_KEY_PREFIX + filePath;
}

/** Loads the scenario saved for `filePath`. Never throws: a disabled or corrupt store just means
 *  "nothing saved yet" - the same fallback `simulatedValues.ts` and `recipeStore.ts` use. */
export function loadSimulationScenario(filePath: string): SimulationInputs {
	try {
		const raw = localStorage.getItem(storageKeyFor(filePath));
		if (raw !== null) {
			const parsed = simulationInputsFromJSON(JSON.parse(raw));
			if (parsed !== null) return parsed;
		}
	} catch {
		// fall through to the legacy entries
	}
	const paths = loadSimulatedOverrides(filePath);
	const messageBoxAnswers = loadMessageBoxAnswers(filePath);
	if (paths.size === 0 && messageBoxAnswers.size === 0) return emptySimulationInputs();
	return { ...emptySimulationInputs(), paths, messageBoxAnswers };
}

/** Saves `inputs` for `filePath`, or clears the entry once nothing is set. Also clears the two legacy
 *  entries so an emptied scenario isn't resurrected from them by the next load. Never throws. */
export function saveSimulationScenario(filePath: string, inputs: SimulationInputs): void {
	saveSimulatedOverrides(filePath, new Map());
	saveMessageBoxAnswers(filePath, new Map());
	try {
		if (isEmptySimulationInputs(inputs)) {
			localStorage.removeItem(storageKeyFor(filePath));
			return;
		}
		localStorage.setItem(storageKeyFor(filePath), JSON.stringify(simulationInputsToJSON(inputs)));
	} catch {
		// Storage disabled - the in-memory scenario remains usable for this session.
	}
}
