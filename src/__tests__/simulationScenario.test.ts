import { describe, expect, it, vi } from "vitest";

// Same in-memory localStorage stand-in simulatedValues.test.ts documents (happy-dom's is a stub here).
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

import {
	emptySimulationInputs, withInputValue, withStartAxis, type SimulationInputs,
} from "dwc-gcode-core/stepper/simulation";

import { loadMessageBoxAnswers, saveMessageBoxAnswers } from "../model/gcode/messageBoxAnswers";
import { loadSimulatedOverrides, saveSimulatedOverrides } from "../model/gcode/simulatedValues";
import { loadSimulationScenario, saveSimulationScenario } from "../model/gcode/simulationScenario";

// The scenario model itself (round-trip, validation, every edit helper) is tested at its source,
// dwc-gcode-core/test/simulation.test.ts - this file covers only what this module adds: per-path
// storage and migration of the two entries it replaced.
function sample(): SimulationInputs {
	let s = withStartAxis(emptySimulationInputs(), "X", 100);
	s = withStartAxis(s, "U", 5);
	s = withInputValue(s, "objectModel", "sensors.gpIn[0].value", 1);
	s = withInputValue(s, "global", "flag", true);
	return s;
}

describe("simulation scenario persistence", () => {
	it("round-trips a whole scenario through localStorage, keyed by file path", () => {
		const path = "0:/macros/scenario-roundtrip.g";
		saveSimulationScenario(path, sample());
		expect(loadSimulationScenario(path)).toEqual(sample());
	});

	it("keeps a separate scenario per file", () => {
		saveSimulationScenario("0:/macros/a.g", withStartAxis(emptySimulationInputs(), "X", 1));
		saveSimulationScenario("0:/macros/b.g", withStartAxis(emptySimulationInputs(), "X", 2));
		expect(loadSimulationScenario("0:/macros/a.g").start.axes).toEqual({ X: 1 });
		expect(loadSimulationScenario("0:/macros/b.g").start.axes).toEqual({ X: 2 });
	});

	it("loads an empty scenario for a file nothing was saved for", () => {
		expect(loadSimulationScenario("0:/macros/never-saved.g")).toEqual(emptySimulationInputs());
	});

	it("clears the entry when the scenario is emptied, rather than leaving a stale one", () => {
		const path = "0:/macros/scenario-clear.g";
		saveSimulationScenario(path, sample());
		saveSimulationScenario(path, emptySimulationInputs());
		expect(loadSimulationScenario(path)).toEqual(emptySimulationInputs());
		expect([...memoryStorage.keys()].some((k) => k.endsWith(path))).toBe(false);
	});

	it("shrugs off a corrupt entry", () => {
		const path = "0:/macros/scenario-corrupt.g";
		memoryStorage.set("flexibleLayouts.stepperScenario." + path, "{not json");
		expect(loadSimulationScenario(path)).toEqual(emptySimulationInputs());
		memoryStorage.set("flexibleLayouts.stepperScenario." + path, JSON.stringify({ kind: "something else" }));
		expect(loadSimulationScenario(path)).toEqual(emptySimulationInputs());
	});

	describe("migration from the two entries it replaced", () => {
		it("picks up object-model values and message-box answers a person already entered", () => {
			const path = "0:/macros/scenario-legacy.g";
			saveSimulatedOverrides(path, new Map([["sensors.gpIn[0].value", 1]]));
			saveMessageBoxAnswers(path, new Map([["k", { input: 3, cancelled: false }]]));
			const loaded = loadSimulationScenario(path);
			expect(loaded.paths.get("sensors.gpIn[0].value")).toBe(1);
			expect(loaded.messageBoxAnswers.get("k")).toEqual({ input: 3, cancelled: false });
		});

		it("the first save clears the legacy entries, so an emptied scenario stays empty", () => {
			const path = "0:/macros/scenario-legacy-clear.g";
			saveSimulatedOverrides(path, new Map([["x", 1]]));
			saveSimulationScenario(path, withStartAxis(emptySimulationInputs(), "X", 5));
			expect(loadSimulatedOverrides(path).size).toBe(0);
			expect(loadMessageBoxAnswers(path).size).toBe(0);
			saveSimulationScenario(path, emptySimulationInputs());
			expect(loadSimulationScenario(path)).toEqual(emptySimulationInputs()); // not resurrected
		});

		it("a saved scenario wins over any legacy entry left behind", () => {
			const path = "0:/macros/scenario-precedence.g";
			saveSimulationScenario(path, withStartAxis(emptySimulationInputs(), "X", 7));
			saveSimulatedOverrides(path, new Map([["stale", 1]]));
			const loaded = loadSimulationScenario(path);
			expect(loaded.start.axes).toEqual({ X: 7 });
			expect(loaded.paths.has("stale")).toBe(false);
		});
	});
});
