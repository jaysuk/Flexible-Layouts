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

			<p class="text-body-small text-medium-emphasis mt-4 mb-0">
				{{ $t("plugins.flexibleLayouts.settings.escapeHint") }}
				<code>/BuiltInLayout</code>
			</p>
		</v-card-text>

		<PageManager v-model="dialogs.pageManager" />
		<ThemeEditor v-model="dialogs.theme" />
		<ImportExportDialog v-model="dialogs.io" />
		<ProfilesDialog v-model="dialogs.profiles" />
		<HelpDialog v-model="dialogs.help" />
		<PasswordDialog />
	</v-card>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";

import { useSettingsStore } from "@/stores/settings";

import ImportExportDialog from "../editor/ImportExportDialog.vue";
import ThemeEditor from "../editor/ThemeEditor.vue";
import ProfilesDialog from "../editor/ProfilesDialog.vue";
import HelpDialog from "../editor/HelpDialog.vue";
import LockSettings from "../editor/LockSettings.vue";
import PageManager from "../editor/PageManager.vue";
import PasswordDialog from "../editor/PasswordDialog.vue";
import { isLocked, requestUnlock } from "../model/lock";

const settingsStore = useSettingsStore();

const active = computed(() => settingsStore.useCustomLayout);
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
	settingsStore.useCustomLayout = !settingsStore.useCustomLayout;
	settingsStore.layoutUserSet = true;
}
</script>
