<template>
	<div class="fill-height d-flex align-center">
		<v-btn :prepend-icon="editMode ? 'mdi-check' : (editLocked ? 'mdi-lock' : 'mdi-pencil-ruler')"
			   :color="editMode ? 'primary' : undefined" :variant="editMode ? 'flat' : 'tonal'" rounded="md" size="small"
			   @click="attemptToggleEdit">
			{{ editMode ? $t("plugins.flexibleLayouts.shell.done") : $t("plugins.flexibleLayouts.shell.edit") }}
		</v-btn>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";
import { can } from "../model/access";
import { attemptToggleEdit, editMode } from "../model/editorState";

defineProps<{ widget: Extract<Widget, { type: "editModeToggle" }> }>();

const editLocked = computed(() => !can("editLayout"));
</script>
