<template>
	<div class="d-flex align-center ga-1">
		<v-text-field :model-value="modelValue" density="compact" variant="outlined" hide-details
					  class="flex-grow-1" :label="label" :placeholder="placeholder"
					  @update:model-value="emit('update:modelValue', $event)" />
		<v-btn icon="mdi-file-tree" size="small" variant="tonal"
			   :title="$t('plugins.flexibleLayouts.omPicker.browse')" @click="pickerOpen = true" />
		<OmPathPicker v-model="pickerOpen" :path="modelValue" @select="onSelect" />
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";

import OmPathPicker from "./OmPathPicker.vue";

defineProps<{ modelValue: string; label?: string; placeholder?: string }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const pickerOpen = ref(false);

function onSelect(path: string) {
	emit("update:modelValue", path);
}
</script>
