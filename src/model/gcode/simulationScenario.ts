/**
 * The persistence half of the offline stepper's SCENARIOS - everything a person sets up to test how a
 * macro reacts (starting position, start line, object-model values, `param.*`, globals, message-box
 * answers), now as a set of NAMED scenarios per file with one active. The models (`SimulationInputs`
 * in `dwc-gcode-core/stepper/simulation`, `ScenarioSet` in `dwc-gcode-core/stepper/scenarioSet`, their
 * JSON forms and every edit helper) live in core, shared with `duet-gcode-postprocessor`; this module keeps
 * only what is inherently host-specific: `localStorage`, which `dwc-gcode-core` can't depend on.
 *
 * One entry per file path. What an entry held before named scenarios existed - a single bare
 * scenario - still loads, as a set of one scenario named "Default", so nothing entered is lost; and
 * the two entries before THAT (`simulatedValues.ts`'s object-model values and `messageBoxAnswers.ts`'s
 * answers) are still READ when nothing has been saved yet. The first save then writes the set and
 * clears the old entries.
 */

import { isEmptyScenarioSet, scenarioSetFromJSON, scenarioSetToJSON, singleScenarioSet, type ScenarioSet } from "dwc-gcode-core/stepper/scenarioSet";
import { emptySimulationInputs } from "dwc-gcode-core/stepper/simulation";

import { loadMessageBoxAnswers, saveMessageBoxAnswers } from "./messageBoxAnswers";
import { loadSimulatedOverrides, saveSimulatedOverrides } from "./simulatedValues";

// The key kept its name when named scenarios arrived: the value is self-tagged (`kind`), so the old
// single-scenario shape and the new set are told apart by content, and an older build never sees a key
// it would misread under a new name.
const LS_KEY_PREFIX = "flexibleLayouts.stepperScenario.";

function storageKeyFor(filePath: string): string {
	return LS_KEY_PREFIX + filePath;
}

/** Loads the scenarios saved for `filePath`. Never throws: a disabled or corrupt store just means
 *  "nothing saved yet" - the same fallback `simulatedValues.ts` and `recipeStore.ts` use. */
export function loadScenarioSet(filePath: string): ScenarioSet {
	try {
		const raw = localStorage.getItem(storageKeyFor(filePath));
		if (raw !== null) {
			const parsed = scenarioSetFromJSON(JSON.parse(raw));
			if (parsed !== null) return parsed;
		}
	} catch {
		// fall through to the legacy entries
	}
	const paths = loadSimulatedOverrides(filePath);
	const messageBoxAnswers = loadMessageBoxAnswers(filePath);
	if (paths.size === 0 && messageBoxAnswers.size === 0) return singleScenarioSet();
	return singleScenarioSet({ ...emptySimulationInputs(), paths, messageBoxAnswers });
}

/** Saves `set` for `filePath`, or clears the entry once it holds nothing worth keeping. Also clears the
 *  two oldest entries so an emptied scenario isn't resurrected from them by the next load. Never throws. */
export function saveScenarioSet(filePath: string, set: ScenarioSet): void {
	saveSimulatedOverrides(filePath, new Map());
	saveMessageBoxAnswers(filePath, new Map());
	try {
		if (isEmptyScenarioSet(set)) {
			localStorage.removeItem(storageKeyFor(filePath));
			return;
		}
		localStorage.setItem(storageKeyFor(filePath), JSON.stringify(scenarioSetToJSON(set)));
	} catch {
		// Storage disabled - the in-memory scenarios remain usable for this session.
	}
}
