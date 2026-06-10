<template>
	<v-card flat>
		<v-card-text>
			<div class="d-flex align-center mb-4">
				<v-icon size="large" class="me-3">mdi-view-dashboard-edit</v-icon>
				<div>
					<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.settings.heading") }}</div>
					<div class="text-body-small text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.settings.subheading") }}
					</div>
				</div>
			</div>

			<v-alert :type="active ? 'success' : 'info'" variant="tonal" density="comfortable" class="mb-4">
				{{ active
					? $t("plugins.flexibleLayouts.settings.statusActive")
					: $t("plugins.flexibleLayouts.settings.statusInactive") }}
			</v-alert>

			<v-btn :color="active ? undefined : 'primary'" :variant="active ? 'tonal' : 'flat'"
				   :prepend-icon="active ? 'mdi-view-dashboard-outline' : 'mdi-view-dashboard-edit'"
				   @click="onToggleLayout">
				{{ active
					? $t("plugins.flexibleLayouts.settings.switchToDefault")
					: $t("plugins.flexibleLayouts.settings.switchToFlex") }}
			</v-btn>

			<v-divider class="my-4" />

			<div class="d-flex flex-wrap ga-2">
				<v-btn variant="tonal" prepend-icon="mdi-file-tree" @click="openGated('pageManager')">
					{{ $t("plugins.flexibleLayouts.pages.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-palette" @click="openGated('theme')">
					{{ $t("plugins.flexibleLayouts.theme.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-share-variant" @click="openGated('io')">
					{{ $t("plugins.flexibleLayouts.io.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-layers-triple" @click="openGated('profiles')">
					{{ $t("plugins.flexibleLayouts.profiles.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-help-circle" @click="dialogs.help = true">
					{{ $t("plugins.flexibleLayouts.help.title") }}
				</v-btn>
			</div>

			<v-divider class="my-4" />
			<LockSettings />

			<v-divider class="my-4" />
			<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.diagnostics.title") }}</div>
			<p class="text-body-small text-medium-emphasis mt-0 mb-2">
				{{ $t("plugins.flexibleLayouts.diagnostics.hint") }}
			</p>
			<div class="d-flex flex-wrap ga-2">
				<v-btn variant="tonal" prepend-icon="mdi-download" @click="downloadDiagnostics">
					{{ $t("plugins.flexibleLayouts.diagnostics.download") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-content-copy" @click="copyDiagnostics">
					{{ $t("plugins.flexibleLayouts.diagnostics.copy") }}
				</v-btn>
			</div>

			<p class="text-body-small text-medium-emphasis mt-4 mb-0">
				{{ $t("plugins.flexibleLayouts.settings.escapeHint") }}
				<code>/BuiltInLayout</code>
			</p>
		</v-card-text>

		<PageManager v-model="dialogs.pageManager" @open-import="dialogs.io = true" />
		<ThemeEditor v-model="dialogs.theme" />
		<ImportExportDialog v-model="dialogs.io" />
		<ProfilesDialog v-model="dialogs.profiles" />
		<HelpDialog v-model="dialogs.help" />
		<PasswordDialog />
	</v-card>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import { buildReport, copyReport, downloadReport } from "dwc-plugin-runtime";

import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { activateFlLayout, deactivateFlLayout, isFlLayoutActive } from "../model/layoutState";
import { useLayoutStore } from "../model/store";
import ImportExportDialog from "../editor/ImportExportDialog.vue";
import ThemeEditor from "../editor/ThemeEditor.vue";
import ProfilesDialog from "../editor/ProfilesDialog.vue";
import HelpDialog from "../editor/HelpDialog.vue";
import LockSettings from "../editor/LockSettings.vue";
import PageManager from "../editor/PageManager.vue";
import PasswordDialog from "../editor/PasswordDialog.vue";
import { isLocked, requestUnlock } from "../model/lock";

const machineStore = useMachineStore();
const uiStore = useUiStore();

const active = computed(() => isFlLayoutActive());

// Diagnostics: bundle versions + recent errors + a privacy-scrubbed object model + the live layout
// document (the most useful FL-specific artifact — lets a bug be reproduced from the exact layout).
function diagnosticReport() {
	return buildReport({
		pluginId: PLUGIN_MANIFEST_ID,
		model: machineStore.model,
		state: { document: useLayoutStore().document.value },
	});
}
function downloadDiagnostics(): void {
	downloadReport(diagnosticReport());
}
async function copyDiagnostics(): Promise<void> {
	const ok = await copyReport(diagnosticReport());
	uiStore.makeNotification(
		ok ? LogLevel.success : LogLevel.warning,
		"Flexible Layouts",
		i18n.global.t(ok ? "plugins.flexibleLayouts.diagnostics.copied" : "plugins.flexibleLayouts.diagnostics.copyFailed"),
	);
}
const dialogs = reactive({
	pageManager: false,
	theme: false,
	io: false,
	profiles: false,
	help: false,
});

// Page management, theming, import/export and profiles all mutate the layout, so they sit behind
// the optional password lock just like entering edit mode. The PasswordDialog mounted below
// surfaces the prompt from either shell.
async function openGated(key: "pageManager" | "theme" | "io" | "profiles"): Promise<void> {
	if (isLocked() && !(await requestUnlock())) {
		return;
	}
	dialogs[key] = true;
}

function onToggleLayout() {
	if (isFlLayoutActive()) {
		deactivateFlLayout();
	} else {
		activateFlLayout();
	}
}
</script>
