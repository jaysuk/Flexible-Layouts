<template>
	<v-container fluid class="py-4">
		<div class="d-flex align-center mb-4">
			<v-icon size="large" class="me-3">mdi-archive-arrow-down</v-icon>
			<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.configBackup.title") }}</div>
			<v-spacer />
			<!-- The generic entry point clears any previous section so it always opens at the top. -->
			<v-btn icon="mdi-help-circle-outline" variant="text" :title="$t('plugins.flexibleLayouts.help.title')"
				   @click="openHelpAt('')" />
		</div>

		<v-tabs v-model="tab" class="mb-3">
			<v-tab value="create">{{ $t("plugins.flexibleLayouts.configBackup.tabs.create") }}</v-tab>
			<v-tab value="restore">{{ $t("plugins.flexibleLayouts.configBackup.tabs.restore") }}</v-tab>
			<v-tab value="cloud">{{ $t("plugins.flexibleLayouts.configBackup.tabs.cloud") }}</v-tab>
		</v-tabs>

		<v-window v-model="tab">
			<v-window-item value="create"><BackupCreatePanel :active="tab === 'create'" /></v-window-item>
			<v-window-item value="restore"><RestorePanel :active="tab === 'restore'" /></v-window-item>
			<v-window-item value="cloud"><CloudPanel @help="openHelpAt" /></v-window-item>
		</v-window>

		<ConfigBackupHelpDialog v-model="helpOpen" :section="helpSection" />
	</v-container>
</template>

<script setup lang="ts">
import { ref } from "vue";

import BackupCreatePanel from "./BackupCreatePanel.vue";
import RestorePanel from "./RestorePanel.vue";
import CloudPanel from "./CloudPanel.vue";
import ConfigBackupHelpDialog from "./ConfigBackupHelpDialog.vue";

const tab = ref("create");
const helpOpen = ref(false);
/** Which destination's instructions to scroll to, when the dialog was opened from a specific
 *  destination's "Setup instructions" link rather than the generic "?" in the header. */
const helpSection = ref<string | undefined>(undefined);

function openHelpAt(section: string): void {
	helpSection.value = section;
	helpOpen.value = true;
}
</script>
