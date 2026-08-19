<template>
	<v-dialog :model-value="modelValue" max-width="480" :attach="attach" @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title>{{ $t("plugins.flexibleLayouts.firmwareUpdate.confirmFilesTitle") }}</v-card-title>
			<v-card-text>
				<p class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.firmwareUpdate.confirmFilesBody") }}</p>
				<v-checkbox v-for="f in files" :key="f" v-model="selected" :value="f" :label="f" density="compact" hide-details />
				<p v-if="!selected.length" class="text-caption text-warning mt-2">
					{{ $t("plugins.flexibleLayouts.firmwareUpdate.confirmFilesNone") }}
				</p>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="warning" :disabled="!selected.length" @click="proceed">
					{{ $t("plugins.flexibleLayouts.firmwareUpdate.continue") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

// `attach` is a plain pass-through to v-dialog's own prop - see GcodeFilePickerDialog.vue's own
// doc comment on the same prop for why it exists (a Vuetify overlay testing gotcha, unset in real use).
const props = defineProps<{ modelValue: boolean; files: Array<string>; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; confirm: [Array<string>] }>();

const selected = ref<Array<string>>([...props.files]);
// Every file starts ticked whenever the dialog (re)opens with a new file list - re-seeding only on
// `files` changing (not on every render) so a mid-review tick/untick isn't clobbered by an unrelated
// parent re-render.
watch(() => props.files, (files) => { selected.value = [...files]; }, { immediate: true });

function proceed(): void {
	emit("confirm", selected.value);
	emit("update:modelValue", false);
}
</script>
