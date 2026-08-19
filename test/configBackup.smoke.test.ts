import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
import { mountInDwc, setConnected } from "dwc-plugin-test-kit";

// CloudPanel checks whether the standalone duet-config-backup-plugin is loaded (to offer a same-
// browser credential import) - the test kit's stub for `@/plugins` doesn't export isPluginLoaded at
// all (same gap sdBackup.history.test.ts hits for unregisterTheme), so extend it locally.
vi.mock("@/plugins", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	isPluginLoaded: () => false,
}));

import ConfigBackupPage from "../src/configBackup/ConfigBackupPage.vue";
import BackupCreatePanel from "../src/configBackup/BackupCreatePanel.vue";
import RestorePanel from "../src/configBackup/RestorePanel.vue";
import CloudPanel from "../src/configBackup/CloudPanel.vue";
import BackupFileTree from "../src/configBackup/BackupFileTree.vue";
import RedactionSummary from "../src/configBackup/RedactionSummary.vue";
import MachineDiffDialog from "../src/configBackup/MachineDiffDialog.vue";
import RedactionRepairStep from "../src/configBackup/RedactionRepairStep.vue";
import MachineList from "../src/configBackup/MachineList.vue";
import CloudBackupBrowser from "../src/configBackup/CloudBackupBrowser.vue";
import PassphraseDialog from "../src/configBackup/PassphraseDialog.vue";
import ConfigBackupHelpDialog from "../src/configBackup/ConfigBackupHelpDialog.vue";

/**
 * Mirrors widgets.smoke.test.ts: mount every new config-backup panel connected + disconnected and
 * assert it renders without throwing. Panels needing props get minimal-but-realistic ones.
 */
const bareComponents = [ConfigBackupPage, BackupCreatePanel, RestorePanel, CloudPanel] as const;

describe("config backup panels mount without throwing", () => {
	for (const Component of bareComponents) {
		it(`mounts: ${Component.__name ?? Component.name}`, () => {
			const wrapper = mountInDwc(Component);
			expect(wrapper.exists()).toBe(true);
			wrapper.unmount();
		});

		it(`mounts while disconnected: ${Component.__name ?? Component.name}`, () => {
			setConnected(false);
			const wrapper = mountInDwc(Component);
			expect(wrapper.exists()).toBe(true);
			wrapper.unmount();
		});
	}

	it("mounts BackupFileTree with a small file list", () => {
		const wrapper = mountInDwc(BackupFileTree, {
			props: {
				files: [
					{ path: "files/sys/config.g", source: "0:/sys/config.g", kind: "system", size: 100, sha256: "abc", lastModified: null, binary: false, redacted: false },
				],
				modelValue: new Set(["files/sys/config.g"]),
			},
		});
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts RedactionSummary with entries", () => {
		const wrapper = mountInDwc(RedactionSummary, {
			props: {
				entries: [{ id: 0, path: "files/sys/config.g", tier: 1, kind: "gcode-command", code: "M551", params: ["P"], label: "Machine password", restoreHint: "credential" }],
				redacted: true,
			},
		});
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts MachineDiffDialog", () => {
		const wrapper = mountInDwc(MachineDiffDialog, {
			props: {
				modelValue: true,
				diff: { sameMachine: true, rows: [{ label: "Hostname", backupValue: "a", liveValue: "a", severity: "info" }], missingDriverRefs: [] },
				backupHostname: "voron24",
			},
		});
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts RedactionRepairStep with an empty site list", () => {
		const wrapper = mountInDwc(RedactionRepairStep, {
			props: { sites: [], liveFileTexts: new Map(), modelValue: new Map() },
		});
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts MachineList with items", () => {
		const wrapper = mountInDwc(MachineList, {
			props: {
				machines: [{ key: "guid-1", label: "voron24", sublabel: "3 backups" }],
				loading: false,
				selected: null,
				thisMachineKey: "guid-1",
			},
		});
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts CloudBackupBrowser with items", () => {
		const wrapper = mountInDwc(CloudBackupBrowser, {
			props: { items: [{ key: "1", label: "backup-1.zip", sublabel: "2026-01-01" }], loading: false },
		});
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts PassphraseDialog in set mode", () => {
		const wrapper = mountInDwc(PassphraseDialog, { props: { modelValue: true, mode: "set" } });
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts PassphraseDialog in unlock mode", () => {
		const wrapper = mountInDwc(PassphraseDialog, { props: { modelValue: true, mode: "unlock" } });
		expect(wrapper.exists()).toBe(true);
	});

	it("mounts ConfigBackupHelpDialog open", () => {
		const wrapper = mountInDwc(ConfigBackupHelpDialog, { props: { modelValue: true } });
		expect(wrapper.exists()).toBe(true);
	});
});

/**
 * The setup walkthrough for every cloud destination lives in the help dialog, but its only entry
 * point used to be a single "?" icon in the page header - nowhere near the fields being filled in,
 * and giving no hint the instructions existed. Each destination now links to its own section.
 */
describe("cloud destination setup links", () => {
	const DESTINATIONS = ["duet", "github", "drive", "dropbox", "webdav"];

	// Read the sources rather than the mounted DOM: Vuetify teleports v-dialog content out of the
	// wrapper entirely, and v-expansion-panel-text bodies are rendered lazily (so the links don't
	// exist until a human expands that panel). Neither shows up in wrapper.html(), which would make a
	// DOM-based version of this test pass vacuously. The failure actually worth catching is a link
	// pointing at a section id that has no matching anchor - it would silently just not scroll - and
	// that is a pure source-level contract between these two files.
	function read(relative: string): string {
		return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
	}

	const emittedSections = [...read("../src/configBackup/CloudPanel.vue")
		.matchAll(/emit\('help',\s*'([a-z]+)'\)/g)].map((m) => m[1]);
	const anchoredSections = [...read("../src/configBackup/ConfigBackupHelpDialog.vue")
		.matchAll(/data-help-section="([a-z]+)"/g)].map((m) => m[1]);

	it("every cloud destination offers a link to its own setup instructions", () => {
		expect(emittedSections).toEqual(DESTINATIONS);
	});

	it("every section a destination links to actually exists in the help dialog", () => {
		for (const id of emittedSections) {
			expect(anchoredSections, `CloudPanel links to "${id}" but the help dialog has no such anchor`)
				.toContain(id);
		}
	});

	it("the help dialog anchors every destination, so none is left unreachable by a link", () => {
		expect([...anchoredSections].sort()).toEqual([...DESTINATIONS].sort());
	});
});
