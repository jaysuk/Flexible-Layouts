<template>
	<v-dialog :model-value="modelValue" max-width="520" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-layers-triple</v-icon>
				{{ $t("plugins.flexibleLayouts.profiles.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<div class="text-caption text-medium-emphasis mb-3">
					{{ $t("plugins.flexibleLayouts.profiles.help") }}
				</div>

				<v-sheet class="pa-3 mb-4 rounded" border>
					<div class="d-flex ga-2">
						<v-text-field v-model="newName" density="compact" variant="outlined" hide-details
									  :label="$t('plugins.flexibleLayouts.profiles.newName')" />
						<v-btn color="primary" size="small" prepend-icon="mdi-plus" :disabled="!newName.trim()"
							   @click="onCreate">
							{{ $t("plugins.flexibleLayouts.profiles.create") }}
						</v-btn>
					</div>
				</v-sheet>

				<v-list density="compact">
					<v-list-item v-for="p in profiles" :key="p.id"
								 :prepend-icon="p.id === activeId ? 'mdi-check-circle' : 'mdi-circle-outline'"
								 :title="p.name"
								 :class="{ 'text-primary': p.id === activeId }" @click="onSwitch(p.id)">
						<template #append>
							<v-btn icon="mdi-pencil" size="x-small" variant="text" density="comfortable"
								   :title="$t('plugins.flexibleLayouts.pages.rename')" @click.stop="startRename(p)" />
							<v-btn icon="mdi-content-copy" size="x-small" variant="text" density="comfortable"
								   :title="$t('plugins.flexibleLayouts.editor.duplicate')" @click.stop="onDuplicate(p)" />
							<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable" color="error"
								   :disabled="profiles.length <= 1"
								   :title="$t('plugins.flexibleLayouts.profiles.delete')" @click.stop="onDelete(p)" />
						</template>
					</v-list-item>
				</v-list>
			</v-card-text>
		</v-card>

		<v-dialog v-model="deleteOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.profiles.delete") }}</v-card-title>
				<v-card-text>{{ $t("plugins.flexibleLayouts.profiles.deleteConfirm", { name: deleteName }) }}</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="deleteOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="error" @click="confirmDelete">{{ $t("plugins.flexibleLayouts.profiles.delete") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-dialog v-model="renameOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pages.rename") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="renameValue" density="compact" variant="outlined" autofocus
								  :label="$t('plugins.flexibleLayouts.profiles.newName')" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="renameOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="primary" :disabled="!renameValue.trim()" @click="saveRename">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import {
	createProfile,
	duplicateProfile,
	getActiveProfileId,
	listProfiles,
	renameProfile,
} from "../model/store";
import { deleteProfileAndSwitch, switchProfile } from "../model/profiles";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const router = useRouter();

const newName = ref("");
// Re-read reactively each render (the underlying maps are Pinia-reactive).
const profiles = computed(() => { void props.modelValue; return listProfiles(); });
const activeId = computed(() => { void profiles.value; return getActiveProfileId(); });

function onCreate() {
	const name = newName.value.trim();
	if (!name) {
		return;
	}
	const id = createProfile(name);
	newName.value = "";
	onSwitch(id);
}

function onSwitch(id: string) {
	if (id === getActiveProfileId()) {
		return;
	}
	switchProfile(id);
	// Custom pages differ between profiles, so land on the dashboard to avoid a stale route.
	router.push("/").catch(() => { /* already there */ });
}

function onDuplicate(p: { id: string; name: string }) {
	const id = duplicateProfile(p.id, `${p.name} copy`);
	onSwitch(id);
}

const deleteOpen = ref(false);
const deleteId = ref("");
const deleteName = ref("");
function onDelete(p: { id: string; name: string }) {
	deleteId.value = p.id;
	deleteName.value = p.name;
	deleteOpen.value = true;
}
function confirmDelete() {
	deleteProfileAndSwitch(deleteId.value);
	deleteOpen.value = false;
	router.push("/").catch(() => { /* already there */ });
}

// Rename sub-dialog
const renameOpen = ref(false);
const renameId = ref("");
const renameValue = ref("");
function startRename(p: { id: string; name: string }) {
	renameId.value = p.id;
	renameValue.value = p.name;
	renameOpen.value = true;
}
function saveRename() {
	renameProfile(renameId.value, renameValue.value.trim());
	renameOpen.value = false;
}
</script>
