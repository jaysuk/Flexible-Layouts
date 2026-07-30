import { describe, expect, it } from "vitest";
import { mountInDwc, setConnected } from "dwc-plugin-test-kit";

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
