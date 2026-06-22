<template>
	<v-dialog :model-value="modelValue" max-width="560" @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-sd</v-icon>
				{{ $t("plugins.flexibleLayouts.sdImage.title") }}
			</v-card-title>

			<!-- Breadcrumb / navigation -->
			<div class="d-flex align-center px-4 pb-2 ga-2">
				<v-btn icon="mdi-arrow-up" size="small" variant="text" :disabled="!canGoUp || loading"
					   :title="$t('plugins.flexibleLayouts.sdImage.up')" @click="goUp" />
				<div class="text-body-2 text-truncate flex-grow-1" :title="currentDir">{{ currentDir }}</div>
				<v-btn icon="mdi-refresh" size="small" variant="text" :disabled="loading" @click="load" />
			</div>
			<v-divider />

			<v-card-text style="min-height: 240px;">
				<div v-if="!connected" class="text-medium-emphasis text-center py-8">
					{{ $t("plugins.flexibleLayouts.sdImage.offline") }}
				</div>
				<div v-else-if="loading" class="d-flex justify-center py-8">
					<v-progress-circular indeterminate color="primary" />
				</div>
				<template v-else>
					<v-list density="compact" class="py-0">
						<v-list-item v-for="d in dirs" :key="'d-' + d" prepend-icon="mdi-folder"
									 :title="d" @click="enter(d)" />
					</v-list>
					<div v-if="images.length" class="image-grid mt-2">
						<button v-for="f in images" :key="'f-' + f.name" type="button" class="image-cell"
								:title="f.name" @click="choose(f.name)">
							<img v-if="f.thumb" :src="f.thumb" class="image-thumb" alt="" />
							<v-icon v-else size="36" class="image-thumb-fallback">mdi-file-image</v-icon>
							<span class="image-name text-truncate">{{ f.name }}</span>
						</button>
					</div>
					<div v-if="!dirs.length && !images.length" class="text-medium-emphasis text-center py-8">
						{{ $t("plugins.flexibleLayouts.sdImage.empty") }}
					</div>
				</template>
			</v-card-text>

			<v-divider />
			<v-card-actions>
				<v-btn variant="text" prepend-icon="mdi-upload" :disabled="!connected || uploading || loading"
					   :loading="uploading" @click="fileInput?.click()">
					{{ $t("plugins.flexibleLayouts.sdImage.upload") }}
				</v-btn>
				<input ref="fileInput" type="file" accept="image/*" class="d-none" @change="onUpload" />
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.close") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import i18n from "@/i18n";
import { LogLevel, useUiStore } from "@/stores/ui";
import { useMachineStore } from "@/stores/machine";

const props = defineProps<{ modelValue: boolean; startDir?: string }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; pick: [string] }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

const currentDir = ref(props.startDir || "0:/");
const dirs = ref<Array<string>>([]);
const images = ref<Array<{ name: string; thumb?: string }>>([]);
const loading = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const connected = computed(() => machineStore.isConnected);

const canGoUp = computed(() => currentDir.value.replace(/\/+$/, "").length > "0:".length);

function joinPath(dir: string, name: string): string {
	return dir.replace(/\/+$/, "") + "/" + name;
}

/** Object URLs created for thumbnails, revoked when the list is rebuilt or the dialog closes. */
let thumbUrls: Array<string> = [];
function revokeThumbs(): void {
	for (const u of thumbUrls) {
		URL.revokeObjectURL(u);
	}
	thumbUrls = [];
}

async function load(): Promise<void> {
	revokeThumbs();
	dirs.value = [];
	images.value = [];
	if (!connected.value) {
		return;
	}
	loading.value = true;
	const dir = currentDir.value;
	try {
		const list = await machineStore.getFileList(dir);
		dirs.value = list.filter((f) => f.isDirectory).map((f) => f.name).sort((a, b) => a.localeCompare(b));
		images.value = list
			.filter((f) => !f.isDirectory && IMAGE_RE.test(f.name))
			.map((f) => ({ name: f.name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		// Directory missing / unreadable - show empty.
	} finally {
		// Guard against a navigation that happened while awaiting.
		if (currentDir.value === dir) {
			loading.value = false;
			void loadThumbs();
		}
	}
}

/** Lazily fetch small previews so the grid isn't blank; failures just leave the file icon. */
async function loadThumbs(): Promise<void> {
	const dir = currentDir.value;
	for (const img of images.value) {
		if (currentDir.value !== dir) {
			return;
		}
		try {
			const blob = await machineStore.download({ filename: joinPath(dir, img.name), type: "blob" }, false, false, false) as Blob;
			const url = URL.createObjectURL(blob);
			thumbUrls.push(url);
			img.thumb = url;
		} catch {
			/* leave the fallback icon */
		}
	}
}

function enter(name: string): void {
	currentDir.value = joinPath(currentDir.value, name);
}
function goUp(): void {
	currentDir.value = currentDir.value.replace(/\/+$/, "").replace(/\/[^/]+$/, "") || "0:/";
}
function choose(name: string): void {
	emit("pick", joinPath(currentDir.value, name));
	emit("update:modelValue", false);
}

async function onUpload(e: Event): Promise<void> {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = ""; // allow re-selecting the same file later
	if (!file) {
		return;
	}
	uploading.value = true;
	const target = joinPath(currentDir.value, file.name);
	try {
		await machineStore.upload({ filename: target, content: file }, false, false, false);
		await load();
		// Select it straight away - that's almost always what an upload is for.
		emit("pick", target);
		emit("update:modelValue", false);
	} catch {
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.sdImage.title"),
			i18n.global.t("plugins.flexibleLayouts.sdImage.uploadFailed"));
	} finally {
		uploading.value = false;
	}
}

watch(() => props.modelValue, (open) => {
	if (open) {
		currentDir.value = props.startDir || "0:/";
		void load();
	} else {
		revokeThumbs();
	}
});
watch(currentDir, () => { if (props.modelValue) void load(); });
</script>

<style scoped>
.image-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
	gap: 8px;
}
.image-cell {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 6px;
	border: 1px solid rgba(var(--v-border-color), 0.3);
	border-radius: 6px;
	background: none;
	cursor: pointer;
	overflow: hidden;
}
.image-cell:hover {
	border-color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.08);
}
.image-thumb {
	width: 100%;
	height: 70px;
	object-fit: contain;
}
.image-thumb-fallback {
	height: 70px;
}
.image-name {
	font-size: 11px;
	max-width: 100%;
}
</style>
