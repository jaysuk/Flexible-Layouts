<template>
	<div class="fill-height d-flex align-center">
		<v-chip v-if="accessEnabledNow" size="small" variant="tonal" style="cursor: pointer"
				:prepend-icon="levelIcon"
				:title="isElevatedNow ? $t('plugins.flexibleLayouts.access.lockNowHint') : $t('plugins.flexibleLayouts.access.unlockHint')"
				@click="onClick">
			{{ levelLabel }}
		</v-chip>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";

import type { Widget } from "../model/document";
import { currentLevel, defaultLevel, isAccessEnabled, relock, requestElevation } from "../model/access";

defineProps<{ widget: Extract<Widget, { type: "accessChip" }> }>();

const accessEnabledNow = computed(() => isAccessEnabled());
const levelNow = computed(() => currentLevel());
const isElevatedNow = computed(() => levelNow.value !== defaultLevel());
const levelIcon = computed(() => (
	levelNow.value === "admin" ? "mdi-shield-account"
		: levelNow.value === "operator" ? "mdi-account-cog"
			: "mdi-eye-outline"
));
const levelLabel = computed(() => i18n.global.t(`plugins.flexibleLayouts.access.level.${levelNow.value}`));

function onClick(): void {
	if (isElevatedNow.value) {
		relock();
	} else {
		void requestElevation();
	}
}
</script>
