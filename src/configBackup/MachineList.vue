<template>
	<div>
		<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.cloud.machinesHeading") }}</div>
		<v-progress-circular v-if="loading" indeterminate size="24" class="mb-2" />
		<div v-else-if="machines.length === 0" class="text-caption text-medium-emphasis mb-2">
			{{ $t("plugins.flexibleLayouts.configBackup.cloud.selectMachinePrompt") }}
		</div>
		<v-list v-else density="compact">
			<v-list-item v-for="item in machines" :key="item.key" :active="selected === item.key" @click="emit('select', item.key)">
				<v-list-item-title>
					{{ item.label }}
					<v-chip v-if="item.key === thisMachineKey" size="x-small" color="primary" variant="tonal" class="ms-1">
						{{ $t("plugins.flexibleLayouts.configBackup.cloud.thisMachine") }}
					</v-chip>
				</v-list-item-title>
				<v-list-item-subtitle v-if="item.sublabel">{{ item.sublabel }}</v-list-item-subtitle>
			</v-list-item>
		</v-list>
	</div>
</template>

<script setup lang="ts">
export interface MachineListItem { key: string; label: string; sublabel?: string }

defineProps<{
	machines: Array<MachineListItem>;
	loading: boolean;
	selected: string | null;
	thisMachineKey: string;
}>();
const emit = defineEmits<{ select: [string] }>();
</script>
