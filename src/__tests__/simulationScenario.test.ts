import { describe, expect, it, vi } from "vitest";

// Same in-memory localStorage stand-in simulatedValues.test.ts documents (happy-dom's is a stub here).
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

import {
	activeScenario, addScenario, renameScenario, scenarioNames, singleScenarioSet, updateActiveScenario,
} from "dwc-gcode-core/stepper/scenarioSet";
import {
	emptySimulationInputs, simulationInputsToJSON, withInputValue, withStartAxis, withStartLine, type SimulationInputs,
} from "dwc-gcode-core/stepper/simulation";

import { loadMessageBoxAnswers, saveMessageBoxAnswers } from "../model/gcode/messageBoxAnswers";
import { loadSimulatedOverrides, saveSimulatedOverrides } from "../model/gcode/simulatedValues";
import { loadScenarioSet, saveScenarioSet } from "../model/gcode/simulationScenario";

// The scenario model itself (round-trip, validation, every edit helper, the set operations) is tested at
// its source, dwc-gcode-core/test/simulation*.test.ts and scenarioSet.test.ts - this file covers only what
// this module adds: per-path storage and migration of the entries it replaced.
function sample(): SimulationInputs {
	let s = withStartAxis(emptySimulationInputs(), "X", 100);
	s = withStartAxis(s, "U", 5);
	s = withStartLine(s, 9);
	s = withInputValue(s, "objectModel", "sensors.gpIn[0].value", 1);
	s = withInputValue(s, "global", "flag", true);
	return s;
}

describe("simulation scenario persistence", () => {
	it("round-trips a whole scenario through localStorage, keyed by file path", () => {
		const path = "0:/macros/scenario-roundtrip.g";
		saveScenarioSet(path, singleScenarioSet(sample()));
		expect(activeScenario(loadScenarioSet(path))).toEqual(sample());
	});

	it("round-trips several named scenarios and which one is active", () => {
		const path = "0:/macros/scenario-named.g";
		let set = singleScenarioSet(withStartAxis(emptySimulationInputs(), "X", 1));
		set = addScenario(set, "Primed");
		set = updateActiveScenario(set, withStartAxis(emptySimulationInputs(), "X", 2));
		saveScenarioSet(path, set);
		const back = loadScenarioSet(path);
		expect(scenarioNames(back)).toEqual(["Default", "Primed"]);
		expect(back.active).toBe("Primed");
		expect(activeScenario(back).start.axes).toEqual({ X: 2 });
	});

	it("keeps a separate set per file", () => {
		saveScenarioSet("0:/macros/a.g", singleScenarioSet(withStartAxis(emptySimulationInputs(), "X", 1)));
		saveScenarioSet("0:/macros/b.g", singleScenarioSet(withStartAxis(emptySimulationInputs(), "X", 2)));
		expect(activeScenario(loadScenarioSet("0:/macros/a.g")).start.axes).toEqual({ X: 1 });
		expect(activeScenario(loadScenarioSet("0:/macros/b.g")).start.axes).toEqual({ X: 2 });
	});

	it("loads a blank single scenario for a file nothing was saved for", () => {
		expect(loadScenarioSet("0:/macros/never-saved.g")).toEqual(singleScenarioSet());
	});

	it("clears the entry when the set is emptied, rather than leaving a stale one", () => {
		const path = "0:/macros/scenario-clear.g";
		saveScenarioSet(path, singleScenarioSet(sample()));
		saveScenarioSet(path, singleScenarioSet());
		expect(loadScenarioSet(path)).toEqual(singleScenarioSet());
		expect([...memoryStorage.keys()].some((k) => k.endsWith(path))).toBe(false);
	});

	it("a blank scenario with a custom name IS kept - the name is something the person made", () => {
		const path = "0:/macros/scenario-named-blank.g";
		saveScenarioSet(path, renameScenario(singleScenarioSet(), "Default", "Cold start"));
		expect(loadScenarioSet(path).active).toBe("Cold start");
	});

	it("shrugs off a corrupt entry", () => {
		const path = "0:/macros/scenario-corrupt.g";
		memoryStorage.set("flexibleLayouts.stepperScenario." + path, "{not json");
		expect(loadScenarioSet(path)).toEqual(singleScenarioSet());
		memoryStorage.set("flexibleLayouts.stepperScenario." + path, JSON.stringify({ kind: "something else" }));
		expect(loadScenarioSet(path)).toEqual(singleScenarioSet());
	});

	describe("migration", () => {
		it("a scenario saved before named scenarios existed becomes the Default of a set", () => {
			const path = "0:/macros/scenario-pre-sets.g";
			memoryStorage.set("flexibleLayouts.stepperScenario." + path, JSON.stringify(simulationInputsToJSON(sample())));
			const loaded = loadScenarioSet(path);
			expect(scenarioNames(loaded)).toEqual(["Default"]);
			expect(activeScenario(loaded)).toEqual(sample());
		});

		it("picks up object-model values and message-box answers from the two entries before that", () => {
			const path = "0:/macros/scenario-legacy.g";
			saveSimulatedOverrides(path, new Map([["sensors.gpIn[0].value", 1]]));
			saveMessageBoxAnswers(path, new Map([["k", { input: 3, cancelled: false }]]));
			const loaded = activeScenario(loadScenarioSet(path));
			expect(loaded.paths.get("sensors.gpIn[0].value")).toBe(1);
			expect(loaded.messageBoxAnswers.get("k")).toEqual({ input: 3, cancelled: false });
		});

		it("the first save clears the legacy entries, so an emptied scenario stays empty", () => {
			const path = "0:/macros/scenario-legacy-clear.g";
			saveSimulatedOverrides(path, new Map([["x", 1]]));
			saveScenarioSet(path, singleScenarioSet(withStartAxis(emptySimulationInputs(), "X", 5)));
			expect(loadSimulatedOverrides(path).size).toBe(0);
			expect(loadMessageBoxAnswers(path).size).toBe(0);
			saveScenarioSet(path, singleScenarioSet());
			expect(loadScenarioSet(path)).toEqual(singleScenarioSet()); // not resurrected
		});

		it("a saved set wins over any legacy entry left behind", () => {
			const path = "0:/macros/scenario-precedence.g";
			saveScenarioSet(path, singleScenarioSet(withStartAxis(emptySimulationInputs(), "X", 7)));
			saveSimulatedOverrides(path, new Map([["stale", 1]]));
			const loaded = activeScenario(loadScenarioSet(path));
			expect(loaded.start.axes).toEqual({ X: 7 });
			expect(loaded.paths.has("stale")).toBe(false);
		});
	});
});
