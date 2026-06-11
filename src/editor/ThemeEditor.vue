<template>
	<v-dialog :model-value="modelValue" max-width="480" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-palette</v-icon>
				{{ $t("plugins.flexibleLayouts.theme.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<v-switch v-model="theme.enabled" color="primary" hide-details density="compact"
						  :label="$t('plugins.flexibleLayouts.theme.enable')" @update:model-value="apply" />
				<div class="text-caption text-medium-emphasis mb-3">
					{{ $t("plugins.flexibleLayouts.theme.help") }}
				</div>

				<template v-if="theme.enabled">
					<v-switch v-model="theme.dark" color="primary" hide-details density="compact" class="mb-2"
							  :label="$t('plugins.flexibleLayouts.theme.darkBase')" @update:model-value="apply" />

					<div v-for="token in tokens" :key="token" class="d-flex align-center mb-2 ga-3">
						<input type="color" class="flex-color-input" :value="theme.colors[token] || fallback(token)"
							   @input="setColor(token, ($event.target as HTMLInputElement).value)" />
						<span class="text-body-2 flex-grow-1">{{ $t(`plugins.flexibleLayouts.colors.${token}`) }}</span>
						<v-btn v-if="theme.colors[token]" icon="mdi-close" size="x-small" variant="text"
							   :title="$t('plugins.flexibleLayouts.theme.clear')" @click="clearColor(token)" />
					</div>

					<v-btn variant="text" size="small" color="error" prepend-icon="mdi-restore" class="mt-2"
						   @click="resetAll">
						{{ $t("plugins.flexibleLayouts.theme.reset") }}
					</v-btn>
				</template>

				<!-- Top bar styling (per profile, independent of the theme toggle) -->
				<v-divider class="my-4" />
				<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.theme.headerTitle") }}</div>
				<div class="d-flex align-center mb-2 ga-3">
					<input type="color" class="flex-color-input" :value="header.color || '#1e1e1e'"
						   @input="setHeader('color', ($event.target as HTMLInputElement).value)" />
					<span class="text-body-2 flex-grow-1">{{ $t("plugins.flexibleLayouts.theme.headerColor") }}</span>
					<v-btn v-if="header.color" icon="mdi-close" size="x-small" variant="text"
						   @click="setHeader('color', undefined)" />
				</div>
				<v-text-field :model-value="header.title" density="compact" variant="outlined" hide-details clearable
							  class="mb-2" :label="$t('plugins.flexibleLayouts.theme.headerText')"
							  @update:model-value="setHeader('title', $event)" />
				<v-text-field :model-value="header.logo" density="compact" variant="outlined" hide-details clearable
							  :label="$t('plugins.flexibleLayouts.theme.headerLogo')" placeholder="https://…"
							  @update:model-value="setHeader('logo', $event)" />
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useLayoutStore } from "../model/store";
import { applyTheme, THEME_TOKENS } from "../model/theme";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const store = useLayoutStore();
const theme = computed(() => store.document.value.theme);
const tokens = THEME_TOKENS;

const header = computed(() => {
	const doc = store.document.value;
	if (!doc.header) {
		doc.header = { items: [] };
	}
	return doc.header;
});
function setHeader(key: "color" | "title" | "logo", value: string | undefined | null) {
	header.value[key] = value || undefined;
}

const FALLBACKS: Record<string, string> = {
	primary: "#1976d2",
	secondary: "#424242",
	background: "#fafafa",
	surface: "#ffffff",
	error: "#cf6679",
	info: "#2196f3",
	success: "#4caf50",
	warning: "#fb8c00",
	"dialog-action": "#1E88E5",
};

function fallback(token: string): string {
	return FALLBACKS[token] ?? "#888888";
}

function apply() {
	applyTheme();
}

function setColor(token: string, value: string) {
	theme.value.colors[token] = value;
	apply();
}

function clearColor(token: string) {
	delete theme.value.colors[token];
	apply();
}

function resetAll() {
	theme.value.colors = {};
	apply();
}
</script>

<style scoped>
.flex-color-input {
	width: 40px;
	height: 28px;
	border: 1px solid rgba(var(--v-border-color), 0.4);
	border-radius: 4px;
	background: none;
	cursor: pointer;
	padding: 0;
}
</style>
