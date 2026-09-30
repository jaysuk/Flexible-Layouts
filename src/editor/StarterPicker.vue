<template>
	<v-dialog :model-value="modelValue" max-width="760" scrollable :attach="props.attach" :aria-label="$t('plugins.flexibleLayouts.starters.title')"
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-view-dashboard-edit-outline</v-icon>
				{{ $t("plugins.flexibleLayouts.starters.title") }}
				<v-spacer />
				<v-btn :aria-label="$t('plugins.flexibleLayouts.a11y.close')" icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<p class="text-body-2 text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.starters.help") }}</p>

				<div class="starter-grid">
					<v-card v-for="s in starters" :key="s.id" variant="outlined" class="starter-card" :data-starter="s.id">
						<div class="starter-preview" aria-hidden="true">
							<div v-for="t in s.tiles" :key="t.key" class="starter-tile" :style="t.style">
								<v-icon size="x-small">{{ t.icon }}</v-icon>
							</div>
						</div>
						<div class="pa-3">
							<div class="d-flex align-center ga-2 mb-1">
								<v-icon size="small">{{ s.icon }}</v-icon>
								<span class="text-title-small flex-grow-1">{{ $t(`plugins.flexibleLayouts.${s.titleKey}`) }}</span>
								<v-chip v-if="s.recommended" size="x-small" color="primary" variant="tonal">
									{{ $t("plugins.flexibleLayouts.starters.recommended") }}
								</v-chip>
							</div>
							<div class="text-caption text-medium-emphasis mb-2">{{ $t(`plugins.flexibleLayouts.${s.descKey}`) }}</div>
							<v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" class="starter-add" @click="add(s.id)">
								{{ $t("plugins.flexibleLayouts.starters.add") }}
							</v-btn>
						</div>
					</v-card>
				</div>

				<v-checkbox v-model="asProfile" density="compact" hide-details class="mt-3"
							:label="$t('plugins.flexibleLayouts.starters.asProfile')" />
				<div class="text-caption text-medium-emphasis ms-8">{{ $t("plugins.flexibleLayouts.starters.asProfileHint") }}</div>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import { createStarterPage, createStarterProfile, currentStarterMode, orderedStarters } from "../model/starterLayouts";
import { describeWidget } from "../widgets/registry";

// `attach` is a plain pass-through to v-dialog's own prop, left unset in real use; tests pass `attach: true` to
// keep the dialog in the local DOM tree where the wrapper can see it (see GcodeFilePickerDialog.vue).
const props = defineProps<{ modelValue: boolean; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; created: [string] }>();

const router = useRouter();
const asProfile = ref(false);

/**
 * Each starter as a schematic: one tile per item, placed from the item's real grid geometry, so the card shows the
 * page's actual shape. (A schematic and not mounted widgets - a preview must not start pollers, webcams and
 * timers for five pages at once just to be looked at.)
 */
const starters = computed(() => orderedStarters(currentStarterMode()).map((s) => {
	const items = s.build();
	const rows = Math.max(1, ...items.map((it) => it.y + it.h));
	return {
		...s,
		tiles: items.map((it) => ({
			key: it.i,
			icon: describeWidget(it.widget).icon,
			style: {
				left: `${(it.x / 12) * 100}%`,
				top: `${(it.y / rows) * 100}%`,
				width: `${(it.w / 12) * 100}%`,
				height: `${(it.h / rows) * 100}%`,
			},
		})),
	};
}));

function close() {
	emit("update:modelValue", false);
}

function add(id: string) {
	const path = asProfile.value ? createStarterProfile(id) : createStarterPage(id);
	emit("created", path);
	close();
	void router.push(path);
}
</script>

<style scoped>
.starter-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 12px;
}
.starter-preview {
	position: relative;
	height: 130px;
	background: rgba(var(--v-theme-on-surface), 0.04);
	border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.starter-tile {
	position: absolute;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1px;
	background: rgba(var(--v-theme-primary), 0.16);
	border: 1px solid rgba(var(--v-theme-primary), 0.5);
	border-radius: 2px;
	overflow: hidden;
}
</style>
