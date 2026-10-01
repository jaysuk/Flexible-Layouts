import { beforeEach, describe, expect, it } from "vitest";
import { loadObjectModel, setModel } from "dwc-plugin-test-kit";

import { useSettingsStore } from "@/stores/settings";

import {
	acknowledgeReview, decideCheck, ignoreChange, mainBoardFirmwareVersion, normaliseFirmwareVersion, readFirmwareChangeState,
	restoreChange, writeFirmwareChangeState,
} from "../src/model/firmware/changeState";
import { currentImpactRange, setPreflightTarget } from "../src/model/firmware/impactRange";
import { registerDocument } from "../src/model/store";

function plugins(): Record<string, Record<string, unknown>> {
	return useSettingsStore().plugins as Record<string, Record<string, unknown>>;
}

beforeEach(() => {
	delete plugins().flexibleLayouts;
	setPreflightTarget(null);
	setModel(loadObjectModel());
});

const base = { enabled: true, baseline: null as string | null };

describe("decideCheck", () => {
	it("records a baseline the first time, and says nothing", () => {
		expect(decideCheck({ ...base }, "3.7.0-rc.2")).toBe("record-baseline");
	});

	it("does nothing on the same version, whatever the suffix", () => {
		expect(decideCheck({ ...base, baseline: "3.7.0-rc.2" }, "3.7.0-rc.2")).toBe("none");
		expect(decideCheck({ ...base, baseline: "3.7.0-rc.2" }, "3.7.0-rc.2(CAN0)")).toBe("none");
	});

	it("scans on an upgrade, a downgrade and a +N build", () => {
		expect(decideCheck({ ...base, baseline: "3.6.3" }, "3.7.0-rc.2")).toBe("scan");
		expect(decideCheck({ ...base, baseline: "3.7.0-rc.2" }, "3.6.3")).toBe("scan");
		expect(decideCheck({ ...base, baseline: "3.7.0-rc.1" }, "3.7.0-rc.1+2")).toBe("scan");
	});

	it("does nothing when disabled, even with no baseline", () => {
		expect(decideCheck({ enabled: false, baseline: null }, "3.7.0-rc.2")).toBe("none");
		expect(decideCheck({ enabled: false, baseline: "3.6.3" }, "3.7.0-rc.2")).toBe("none");
	});

	it("does nothing while the running version is unknown - never guesses one", () => {
		expect(decideCheck({ ...base, baseline: "3.6.3" }, null)).toBe("none");
		expect(decideCheck({ ...base }, null)).toBe("none");
	});
});

describe("normaliseFirmwareVersion / mainBoardFirmwareVersion", () => {
	it("drops a board's suffix and a leading v, and refuses what it cannot read", () => {
		expect(normaliseFirmwareVersion("3.7.0-rc.2(CAN0)")).toBe("3.7.0-rc.2");
		expect(normaliseFirmwareVersion("3.6.0-beta.3(no 3rd order motion)")).toBe("3.6.0-beta.3");
		expect(normaliseFirmwareVersion("v3.6.3")).toBe("3.6.3");
		expect(normaliseFirmwareVersion("3.7.0-rc.1+2")).toBe("3.7.0-rc.1+2");
		for (const bad of ["", "unknown", "rc2", undefined, null, 3]) expect(normaliseFirmwareVersion(bad), String(bad)).toBeNull();
	});

	it("reads only the main board, not an expansion board", () => {
		expect(mainBoardFirmwareVersion({ boards: [{ firmwareVersion: "3.7.0-rc.2" }, { firmwareVersion: "3.4.0" }] })).toBe("3.7.0-rc.2");
		expect(mainBoardFirmwareVersion({ boards: [] })).toBeNull();
		expect(mainBoardFirmwareVersion({})).toBeNull();
		expect(mainBoardFirmwareVersion(undefined)).toBeNull();
	});
});

describe("stored state", () => {
	it("has defaults, and lives beside the layout profiles on the board", () => {
		expect(readFirmwareChangeState()).toEqual({ enabled: true, editorWarnings: true, baseline: null, acknowledged: [] });
		writeFirmwareChangeState({ baseline: "3.6.3" });
		expect(plugins().flexibleLayouts.firmwareChanges).toMatchObject({ baseline: "3.6.3" });
	});

	it("acknowledging a review moves the baseline; ignoring is idempotent and reversible", () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		acknowledgeReview("3.7.0-rc.2(CAN0)");
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2");
		ignoreChange("m408-removed");
		ignoreChange("m408-removed");
		expect(readFirmwareChangeState().acknowledged).toEqual(["m408-removed"]);
		restoreChange("m408-removed");
		expect(readFirmwareChangeState().acknowledged).toEqual([]);
	});

	it("survives a damaged blob", () => {
		plugins().flexibleLayouts = { firmwareChanges: { enabled: "yes", baseline: 42, acknowledged: "nope", notifiedKey: 7 } };
		expect(readFirmwareChangeState()).toEqual({ enabled: true, editorWarnings: true, baseline: null, acknowledged: [] });
		plugins().flexibleLayouts = { firmwareChanges: { baseline: "garbage", acknowledged: ["a", 3, "b"] } };
		expect(readFirmwareChangeState()).toMatchObject({ baseline: null, acknowledged: ["a", "b"] });
	});

	it("never touches the layout document: no profile changes, and the state is not part of any profile", () => {
		registerDocument();
		const before = JSON.stringify(plugins().flexibleLayouts.profiles);
		writeFirmwareChangeState({ baseline: "3.6.3", acknowledged: ["x"] });
		ignoreChange("y");
		acknowledgeReview("3.7.0-rc.2");
		expect(JSON.stringify(plugins().flexibleLayouts.profiles)).toBe(before);
		expect(JSON.stringify(plugins().flexibleLayouts.profiles)).not.toContain("firmwareChanges");
	});
});

describe("currentImpactRange (what the editor squiggles are drawn for)", () => {
	function run(version: string): void {
		setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: version }] });
	}

	it("is the unreviewed change: baseline to running", () => {
		run("3.7.0-rc.2");
		writeFirmwareChangeState({ baseline: "3.6.3" });
		expect(currentImpactRange()).toEqual({ from: "3.6.3", to: "3.7.0-rc.2" });
	});

	it("is off with nothing to compare, an equal version, or either switch off", () => {
		run("3.7.0-rc.2");
		expect(currentImpactRange()).toBeNull(); // no baseline
		writeFirmwareChangeState({ baseline: "3.7.0-rc.2" });
		expect(currentImpactRange()).toBeNull(); // equal
		writeFirmwareChangeState({ baseline: "3.6.3", enabled: false });
		expect(currentImpactRange()).toBeNull();
		writeFirmwareChangeState({ enabled: true, editorWarnings: false });
		expect(currentImpactRange()).toBeNull();
	});

	it("follows the release the update widget selected, from the running version", () => {
		run("3.6.3");
		writeFirmwareChangeState({ baseline: "3.6.3" });
		expect(currentImpactRange()).toBeNull();
		setPreflightTarget("v3.7.0-rc.2");
		expect(currentImpactRange()).toEqual({ from: "3.6.3", to: "3.7.0-rc.2" });
		setPreflightTarget("not a version");
		expect(currentImpactRange()).toBeNull();
	});
});
