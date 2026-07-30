<template>
	<div>
		<v-progress-circular v-if="loading" indeterminate size="24" class="mb-2" />
		<div v-else-if="items.length === 0" class="text-caption text-medium-emphasis">
			{{ $t("plugins.flexibleLayouts.configBackup.cloud.noBackups") }}
		</div>
		<v-list v-else density="compact">
			<v-list-item v-for="item in items" :key="item.key">
				<v-list-item-title>{{ item.label }}</v-list-item-title>
				<v-list-item-subtitle v-if="item.sublabel">{{ item.sublabel }}</v-list-item-subtitle>
				<template #append>
					<v-btn v-if="showDownload" size="small" variant="text" icon="mdi-download"
						   :title="$t('plugins.flexibleLayouts.configBackup.cloud.downloadButton')" @click="emit('download', item.key)" />
					<v-btn size="small" variant="text" icon="mdi-restore" :title="$t('plugins.flexibleLayouts.configBackup.cloud.restoreButton')"
						   @click="emit('restore', item.key)" />
					<v-btn v-if="item.viewUrl" size="small" variant="text" icon="mdi-open-in-new" :href="item.viewUrl" target="_blank" rel="noopener"
						   :title="$t('plugins.flexibleLayouts.configBackup.cloud.viewButton')" />
					<v-btn v-if="showDelete" size="small" variant="text" icon="mdi-delete-outline" color="error"
						   :title="$t('plugins.flexibleLayouts.configBackup.cloud.deleteButton')" @click="emit('delete', item.key)" />
				</template>
			</v-list-item>
		</v-list>
	</div>
</template>

<script setup lang="ts">
export interface BackupBrowserItem { key: string; label: string; sublabel?: string; viewUrl?: string }

withDefaults(defineProps<{
	items: Array<BackupBrowserItem>;
	loading: boolean;
	/** Not every destination supports these - GitHub history has no per-commit delete, and its "download"
	 * is offered as the external "View on GitHub" link instead. */
	showDownload?: boolean;
	showDelete?: boolean;
}>(), { showDownload: true, showDelete: true });
const emit = defineEmits<{ download: [string]; restore: [string]; delete: [string] }>();
</script>
