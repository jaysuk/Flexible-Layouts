<template>
	<v-dialog :model-value="modelValue" max-width="520" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card v-if="draft">
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-cog</v-icon>
				{{ $t("plugins.flexibleLayouts.properties.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<!-- Live preview of the widget as configured -->
				<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.properties.preview") }}</div>
				<v-sheet border rounded class="flex-preview mb-3">
					<WidgetView :widget="(draft as Widget)" />
				</v-sheet>

				<!-- Position & size (for precise alignment) -->
				<v-expansion-panels class="mb-3" variant="accordion">
					<v-expansion-panel :title="$t('plugins.flexibleLayouts.properties.geometry')">
						<v-expansion-panel-text>
							<v-row dense>
								<v-col cols="3"><v-text-field v-model.number="geom.x" type="number" density="compact" variant="outlined" hide-details label="X" /></v-col>
								<v-col cols="3"><v-text-field v-model.number="geom.y" type="number" density="compact" variant="outlined" hide-details label="Y" /></v-col>
								<v-col cols="3"><v-text-field v-model.number="geom.w" type="number" density="compact" variant="outlined" hide-details label="W" /></v-col>
								<v-col cols="3"><v-text-field v-model.number="geom.h" type="number" density="compact" variant="outlined" hide-details label="H" /></v-col>
							</v-row>
						</v-expansion-panel-text>
					</v-expansion-panel>
				</v-expansion-panels>

				<!-- Command button -->
				<template v-if="draft.type === 'codeButton'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-select v-model="draft.action" :items="actionOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.action')" />
					<v-textarea v-if="(draft.action ?? 'gcode') === 'gcode'" v-model="draft.code" class="mb-2"
								density="compact" variant="outlined" hide-details rows="3" auto-grow
								:label="$t('plugins.flexibleLayouts.properties.code')"
								:hint="$t('plugins.flexibleLayouts.properties.codeHint')" persistent-hint />
					<v-text-field v-else v-model="draft.url" class="mb-2" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.properties.url')"
								  placeholder="https://…" />
					<div class="text-caption text-medium-emphasis mb-1">
						{{ $t("plugins.flexibleLayouts.pages.icon") }}
					</div>
					<IconPicker v-model="draft.icon" class="mb-2" />
					<v-select v-model="draft.color" :items="colorOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
					<v-switch v-model="draft.confirm" color="primary" hide-details density="compact"
							  :label="$t('plugins.flexibleLayouts.properties.confirm')" />
				</template>

				<!-- Object-model value -->
				<template v-else-if="draft.type === 'value'">
					<v-select :model-value="null" :items="presetItems" class="mb-2" density="compact"
							  variant="outlined" hide-details clearable
							  :label="$t('plugins.flexibleLayouts.properties.quickPick')"
							  @update:model-value="(v: unknown) => applyPreset(v as string | null)" />
					<OmPathField v-model="draft.omPath" class="mb-2"
								 :label="$t('plugins.flexibleLayouts.properties.omPath')" />
					<div class="text-caption mt-2 mb-2">
						{{ $t("plugins.flexibleLayouts.properties.preview") }}:
						<span class="font-weight-medium">{{ preview }}</span>
					</div>
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-select v-model="draft.display" :items="displayOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.display')" />
					<v-row dense>
						<v-col cols="6">
							<v-text-field v-model="draft.unit" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.unit')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model.number="draft.precision" type="number" density="compact"
										  variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.precision')" />
						</v-col>
					</v-row>
					<v-row v-if="draft.display === 'gauge'" dense class="mt-1">
						<v-col cols="6">
							<v-text-field v-model.number="draft.min" type="number" density="compact"
										  variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.min')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model.number="draft.max" type="number" density="compact"
										  variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.max')" />
						</v-col>
					</v-row>
					<v-select v-model="draft.color" :items="colorOptions" class="mt-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />

					<v-expansion-panels class="mt-3" variant="accordion">
						<v-expansion-panel :title="$t('plugins.flexibleLayouts.properties.formatting')">
							<v-expansion-panel-text>
								<v-row dense>
									<v-col cols="6">
										<v-text-field v-model.number="draft.scale" type="number" density="compact"
													  variant="outlined" hide-details
													  :label="$t('plugins.flexibleLayouts.properties.scale')" />
									</v-col>
									<v-col cols="6">
										<v-text-field v-model.number="draft.offset" type="number" density="compact"
													  variant="outlined" hide-details
													  :label="$t('plugins.flexibleLayouts.properties.offset')" />
									</v-col>
									<v-col cols="6">
										<v-text-field v-model="draft.boolOn" density="compact" variant="outlined"
													  hide-details :label="$t('plugins.flexibleLayouts.properties.boolOn')" />
									</v-col>
									<v-col cols="6">
										<v-text-field v-model="draft.boolOff" density="compact" variant="outlined"
													  hide-details :label="$t('plugins.flexibleLayouts.properties.boolOff')" />
									</v-col>
								</v-row>
								<div class="d-flex align-center mt-2 mb-1">
									<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.properties.valueMap") }}</span>
									<v-spacer />
									<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addMapping">
										{{ $t("plugins.flexibleLayouts.conditions.add") }}
									</v-btn>
								</div>
								<div v-for="(m, mi) in (draft.map ?? [])" :key="mi" class="d-flex ga-2 mb-1 align-center">
									<v-text-field v-model="m.value" density="compact" variant="outlined" hide-details
												  :label="$t('plugins.flexibleLayouts.properties.mapValue')" />
									<v-text-field v-model="m.text" density="compact" variant="outlined" hide-details
												  :label="$t('plugins.flexibleLayouts.properties.mapText')" />
									<v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="draft.map.splice(mi, 1)" />
								</div>
							</v-expansion-panel-text>
						</v-expansion-panel>
					</v-expansion-panels>
				</template>

				<!-- Text / image / spacer -->
				<template v-else-if="draft.type === 'label'">
					<v-select v-model="draft.variant" :items="variantOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.variant')" />
					<v-textarea v-if="draft.variant === 'text' || draft.variant === 'heading'"
								v-model="draft.content" class="mb-2" density="compact" variant="outlined"
								hide-details rows="2" auto-grow
								:label="$t('plugins.flexibleLayouts.properties.text')" />
					<v-text-field v-else-if="draft.variant === 'image'" v-model="draft.content" class="mb-2"
								  density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.imageUrl')" />
					<v-select v-if="draft.variant !== 'spacer'" v-model="draft.align" :items="alignOptions"
							  class="mb-2" density="compact" variant="outlined" hide-details
							  :label="$t('plugins.flexibleLayouts.properties.align')" />
					<v-select v-if="draft.variant === 'text' || draft.variant === 'heading'"
							  v-model="draft.color" :items="colorOptions" density="compact" variant="outlined"
							  hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
				</template>

				<!-- Input / variable -->
				<template v-else-if="draft.type === 'input'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-select v-model="draft.mode" :items="inputModeOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.inputMode')" />
					<v-text-field v-if="draft.mode === 'command'" v-model="draft.commandTemplate" class="mb-2"
								  density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.commandTemplate')"
								  :hint="$t('plugins.flexibleLayouts.properties.commandTemplateHint')" persistent-hint />
					<v-text-field v-else v-model="draft.globalName" class="mb-2" density="compact" variant="outlined"
								  hide-details prefix="global."
								  :label="$t('plugins.flexibleLayouts.properties.globalName')" />
					<v-select v-model="draft.inputKind" :items="inputKindOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.inputKind')" />
					<v-select v-model="draft.color" :items="colorOptions" density="compact" variant="outlined"
							  hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
				</template>

				<!-- Live chart -->
				<template v-else-if="draft.type === 'chart'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<div class="d-flex align-center mb-1">
						<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.properties.series") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addSeries">
							{{ $t("plugins.flexibleLayouts.conditions.add") }}
						</v-btn>
					</div>
					<v-sheet v-for="(s, i) in draft.series" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2 align-center">
							<OmPathField v-model="s.omPath" class="flex-grow-1"
										 :label="$t('plugins.flexibleLayouts.properties.omPath')" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.series.splice(i, 1)" />
						</div>
						<div class="d-flex ga-2 mt-2">
							<v-text-field v-model="s.label" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.label')" />
							<v-select v-model="s.color" :items="colorOptions" density="compact" variant="outlined"
									  hide-details style="max-width: 180px"
									  :label="$t('plugins.flexibleLayouts.properties.color')" />
						</div>
					</v-sheet>
					<v-row dense>
						<v-col cols="6">
							<v-text-field v-model.number="draft.windowSeconds" type="number" density="compact"
										  variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.windowSeconds')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model.number="draft.intervalMs" type="number" density="compact"
										  variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.intervalMs')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model.number="draft.min" type="number" density="compact" variant="outlined"
										  hide-details :label="$t('plugins.flexibleLayouts.properties.min')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model.number="draft.max" type="number" density="compact" variant="outlined"
										  hide-details :label="$t('plugins.flexibleLayouts.properties.max')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model="draft.xLabel" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.xLabel')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model="draft.yLabel" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.properties.yLabel')" />
						</v-col>
					</v-row>
					<div class="text-caption text-medium-emphasis mt-1">
						{{ $t("plugins.flexibleLayouts.properties.autoScaleHint") }}
					</div>
				</template>

				<!-- Web embed -->
				<template v-else-if="draft.type === 'web'">
					<v-text-field v-model="draft.url" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.url')" placeholder="https://…"
								  :hint="$t('plugins.flexibleLayouts.properties.webHint')" persistent-hint />
				</template>

				<!-- Pronterface-style jog control -->
				<template v-else-if="draft.type === 'jog'">
					<div class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.jog.configHint") }}
					</div>
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details
								  clearable :label="$t('plugins.flexibleLayouts.jog.titleField')" />
					<v-row dense>
						<v-col cols="4">
							<v-text-field v-model="draft.xAxis" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.jog.xAxis')" />
						</v-col>
						<v-col cols="4">
							<v-text-field v-model="draft.yAxis" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.jog.yAxis')" />
						</v-col>
						<v-col cols="4">
							<v-text-field v-model="draft.zAxis" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.jog.zAxis')" />
						</v-col>
					</v-row>
					<v-text-field v-model="xyStepsText" class="mt-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.xySteps')"
								  :hint="$t('plugins.flexibleLayouts.jog.stepsHint')" persistent-hint />
					<v-text-field v-model="zStepsText" class="mt-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.zSteps')" />
					<v-row dense class="mt-1">
						<v-col cols="6">
							<v-text-field v-model.number="draft.xyFeedrate" type="number" density="compact"
										  variant="outlined" hide-details suffix="mm/min"
										  :label="$t('plugins.flexibleLayouts.jog.xyFeed')" />
						</v-col>
						<v-col cols="6">
							<v-text-field v-model.number="draft.zFeedrate" type="number" density="compact"
										  variant="outlined" hide-details suffix="mm/min"
										  :label="$t('plugins.flexibleLayouts.jog.zFeed')" />
						</v-col>
					</v-row>
					<v-select v-model="draft.color" :items="colorOptions" class="mt-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
					<div class="d-flex flex-wrap ga-x-4">
						<v-switch v-model="draft.showZ" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.showZ')" />
						<v-switch v-model="draft.showHome" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.showHome')" />
						<v-switch v-model="draft.showFeedrate" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.showFeedrate')" />
						<v-switch v-model="draft.showMotorsOff" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.showMotorsOff')" />
						<v-switch v-model="draft.invertX" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.invertX')" />
						<v-switch v-model="draft.invertY" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.invertY')" />
						<v-switch v-model="draft.invertZ" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.jog.invertZ')" />
					</div>
				</template>

				<!-- Built-in panel: optional title override -->
				<template v-else-if="draft.type === 'builtinPanel'">
					<div class="text-body-2 text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.properties.builtinNote", { name: draft.component }) }}
					</div>
				</template>

				<!-- Conditional behaviour (applies to any widget type) -->
				<v-divider class="my-4" />
				<div class="d-flex align-center mb-1">
					<v-icon size="small" class="me-1">mdi-state-machine</v-icon>
					<span class="text-title-small">{{ $t("plugins.flexibleLayouts.conditions.title") }}</span>
					<v-spacer />
					<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addRule">
						{{ $t("plugins.flexibleLayouts.conditions.add") }}
					</v-btn>
				</div>
				<div class="text-caption text-medium-emphasis mb-2">
					{{ $t("plugins.flexibleLayouts.conditions.help") }}
				</div>

				<v-sheet v-for="(rule, i) in conditions" :key="i" border rounded class="pa-2 mb-2">
					<div class="d-flex ga-2 align-center">
						<OmPathField v-model="rule.omPath" class="flex-grow-1"
									 :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
						<v-btn icon="mdi-delete" size="small" variant="text" color="error"
							   @click="removeRule(i)" />
					</div>
					<div class="d-flex ga-2 mt-2">
						<v-select v-model="rule.operator" :items="operatorOptions" density="compact"
								  variant="outlined" hide-details style="max-width: 170px"
								  :label="$t('plugins.flexibleLayouts.conditions.operator')" />
						<v-text-field v-if="needsValue(rule.operator)" v-model="rule.value" density="compact"
									  variant="outlined" hide-details
									  :label="$t('plugins.flexibleLayouts.conditions.value')" />
					</div>
					<div class="d-flex ga-3 mt-2 align-center flex-wrap">
						<v-select v-model="rule.color" :items="colorOptions" density="compact" variant="outlined"
								  hide-details clearable style="max-width: 190px"
								  :label="$t('plugins.flexibleLayouts.conditions.thenColor')" />
						<v-switch v-model="rule.hide" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.conditions.thenHide')" />
						<v-switch v-model="rule.disable" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.conditions.thenDisable')" />
					</div>
				</v-sheet>

				<!-- Per-panel colour overrides -->
				<v-divider class="my-4" />
				<div class="d-flex align-center mb-2">
					<v-icon size="small" class="me-1">mdi-palette</v-icon>
					<span class="text-title-small">{{ $t("plugins.flexibleLayouts.panelColors.title") }}</span>
				</div>
				<div v-for="field in colorFields" :key="field.key" class="d-flex align-center mb-2 ga-3">
					<input type="color" class="flex-color-input" :value="colors[field.key] || '#888888'"
						   @input="setPanelColor(field.key, ($event.target as HTMLInputElement).value)" />
					<span class="text-body-2 flex-grow-1">{{ $t(`plugins.flexibleLayouts.${field.labelKey}`) }}</span>
					<v-btn v-if="colors[field.key]" icon="mdi-close" size="x-small" variant="text"
						   @click="clearPanelColor(field.key)" />
				</div>

				<!-- Typography + fit -->
				<v-divider class="my-4" />
				<div class="d-flex align-center mb-2">
					<v-icon size="small" class="me-1">mdi-format-size</v-icon>
					<span class="text-title-small">{{ $t("plugins.flexibleLayouts.typography.title") }}</span>
				</div>
				<v-row dense>
					<v-col cols="6">
						<v-text-field v-model.number="typography.fontSize" type="number" density="compact"
									  variant="outlined" hide-details clearable
									  :label="$t('plugins.flexibleLayouts.typography.fontSize')" suffix="px" />
					</v-col>
					<v-col cols="6">
						<v-select v-model="typography.fontFamily" :items="fontOptions" density="compact"
								  variant="outlined" hide-details clearable
								  :label="$t('plugins.flexibleLayouts.typography.fontFamily')" />
					</v-col>
				</v-row>
				<v-switch v-model="fit" color="primary" density="compact" hide-details class="mt-1"
						  :label="$t('plugins.flexibleLayouts.typography.fit')" />
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.typography.fitHint") }}</div>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="primary" @click="save">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

import type { ConditionOperator, ConditionRule, GridItemModel, PanelColors, Typography, Widget } from "../model/document";
import { OM_VALUE_PRESETS, type OmPreset, resolveOmPath } from "../util/omPath";
import IconPicker from "./IconPicker.vue";
import OmPathField from "./OmPathField.vue";
import WidgetView from "../widgets/WidgetView.vue";

const props = defineProps<{ modelValue: boolean; item: GridItemModel | null }>();
const emit = defineEmits<{
	"update:modelValue": [boolean];
	save: [{ widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; geometry: { x: number; y: number; w: number; h: number } }];
}>();

const machineStore = useMachineStore();

// A loosely-typed working copy avoids fighting the discriminated union in the template; the value
// is cast back to Widget on save. Re-cloned every time the dialog opens.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draft = ref<any>(null);
const conditions = ref<Array<ConditionRule>>([]);
const colors = ref<PanelColors>({});
const typography = ref<Typography>({});
const fit = ref<boolean | undefined>(undefined);
const geom = ref({ x: 0, y: 0, w: 2, h: 2 });
watch(
	() => props.modelValue,
	(open) => {
		if (open && props.item) {
			draft.value = JSON.parse(JSON.stringify(props.item.widget));
			conditions.value = JSON.parse(JSON.stringify(props.item.conditions ?? []));
			colors.value = JSON.parse(JSON.stringify(props.item.colors ?? {}));
			typography.value = JSON.parse(JSON.stringify(props.item.typography ?? {}));
			geom.value = { x: props.item.x, y: props.item.y, w: props.item.w, h: props.item.h };
			// Default reflects the runtime default (panels/plugin pages fit by default).
			fit.value = props.item.fit
				?? (props.item.widget.type === "builtinPanel" || props.item.widget.type === "pluginPage");
		}
	},
	{ immediate: true },
);

const fontOptions = [
	{ title: "Default", value: undefined },
	{ title: "Sans-serif", value: "sans-serif" },
	{ title: "Serif", value: "serif" },
	{ title: "Monospace", value: "monospace" },
	{ title: "Roboto", value: "Roboto, sans-serif" },
	{ title: "Arial", value: "Arial, sans-serif" },
	{ title: "Verdana", value: "Verdana, sans-serif" },
	{ title: "Georgia", value: "Georgia, serif" },
	{ title: "Courier New", value: "'Courier New', monospace" },
];

const colorFields: Array<{ key: keyof PanelColors; labelKey: string }> = [
	{ key: "background", labelKey: "panelColors.background" },
	{ key: "header", labelKey: "panelColors.header" },
	{ key: "text", labelKey: "panelColors.text" },
];
function setPanelColor(key: keyof PanelColors, value: string) {
	colors.value[key] = value;
}
function clearPanelColor(key: keyof PanelColors) {
	delete colors.value[key];
}

// Comma-separated editors for the jog step rings (right-click on the widget also edits them).
function parseSteps(text: string): Array<number> {
	return text.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0);
}
const xyStepsText = computed({
	get: () => (draft.value?.xySteps ?? []).join(", "),
	set: (text: string) => { if (draft.value) { draft.value.xySteps = parseSteps(text); } },
});
const zStepsText = computed({
	get: () => (draft.value?.zSteps ?? []).join(", "),
	set: (text: string) => { if (draft.value) { draft.value.zSteps = parseSteps(text); } },
});

const t = (k: string) => i18n.global.t(`plugins.flexibleLayouts.${k}`);

const operatorOptions = computed<Array<{ title: string; value: ConditionOperator }>>(() => [
	{ title: t("conditions.eq"), value: "eq" },
	{ title: t("conditions.ne"), value: "ne" },
	{ title: t("conditions.gt"), value: "gt" },
	{ title: t("conditions.lt"), value: "lt" },
	{ title: t("conditions.gte"), value: "gte" },
	{ title: t("conditions.lte"), value: "lte" },
	{ title: t("conditions.contains"), value: "contains" },
	{ title: t("conditions.truthy"), value: "truthy" },
	{ title: t("conditions.falsy"), value: "falsy" },
]);

function addRule() {
	conditions.value.push({ omPath: "", operator: "eq", value: "" });
}
function addSeries() {
	if (draft.value?.type === "chart") {
		draft.value.series.push({ omPath: "", label: "", color: "secondary" });
	}
}
function addMapping() {
	if (draft.value?.type === "value") {
		if (!draft.value.map) {
			draft.value.map = [];
		}
		draft.value.map.push({ value: "", text: "" });
	}
}
function removeRule(index: number) {
	conditions.value.splice(index, 1);
}
function needsValue(op: ConditionOperator): boolean {
	return op !== "truthy" && op !== "falsy";
}

const colorOptions = computed(() => [
	{ title: t("colors.default"), value: undefined },
	{ title: t("colors.primary"), value: "primary" },
	{ title: t("colors.secondary"), value: "secondary" },
	{ title: t("colors.success"), value: "success" },
	{ title: t("colors.info"), value: "info" },
	{ title: t("colors.warning"), value: "warning" },
	{ title: t("colors.error"), value: "error" },
]);

const displayOptions = computed(() => [
	{ title: t("properties.displayNumber"), value: "number" },
	{ title: t("properties.displayLabel"), value: "label" },
	{ title: t("properties.displayGauge"), value: "gauge" },
]);

const variantOptions = computed(() => [
	{ title: t("properties.variantHeading"), value: "heading" },
	{ title: t("properties.variantText"), value: "text" },
	{ title: t("properties.variantImage"), value: "image" },
	{ title: t("properties.variantSpacer"), value: "spacer" },
]);

const alignOptions = computed(() => [
	{ title: t("properties.alignStart"), value: "start" },
	{ title: t("properties.alignCenter"), value: "center" },
	{ title: t("properties.alignEnd"), value: "end" },
]);

const inputModeOptions = computed(() => [
	{ title: t("properties.inputModeCommand"), value: "command" },
	{ title: t("properties.inputModeGlobal"), value: "global" },
]);

const inputKindOptions = computed(() => [
	{ title: t("properties.inputNumber"), value: "number" },
	{ title: t("properties.inputText"), value: "text" },
]);

const actionOptions = computed(() => [
	{ title: t("properties.actionGcode"), value: "gcode" },
	{ title: t("properties.actionHttp"), value: "http" },
	{ title: t("properties.actionUrl"), value: "url" },
]);

const presetItems = computed(() =>
	OM_VALUE_PRESETS.map((p) => ({ title: t(`omPresets.${p.labelKey}`), value: p.path, raw: p })));

function applyPreset(path: string | null) {
	if (!path || !draft.value) {
		return;
	}
	const preset = OM_VALUE_PRESETS.find((p) => p.path === path) as OmPreset | undefined;
	if (!preset) {
		return;
	}
	draft.value.omPath = preset.path;
	draft.value.unit = preset.unit;
	if (!draft.value.label) {
		draft.value.label = t(`omPresets.${preset.labelKey}`);
	}
}

const preview = computed(() => {
	if (!draft.value || draft.value.type !== "value" || !draft.value.omPath) {
		return "—";
	}
	const v = resolveOmPath(machineStore.model, draft.value.omPath);
	return v === undefined || v === null ? "—" : String(v);
});

function save() {
	if (draft.value) {
		emit("save", {
			widget: draft.value as Widget,
			conditions: conditions.value.filter((r) => r.omPath.trim().length > 0),
			colors: colors.value,
			typography: typography.value,
			fit: fit.value,
			geometry: {
				x: Math.max(0, Math.round(geom.value.x) || 0),
				y: Math.max(0, Math.round(geom.value.y) || 0),
				w: Math.max(1, Math.round(geom.value.w) || 1),
				h: Math.max(1, Math.round(geom.value.h) || 1),
			},
		});
	}
	emit("update:modelValue", false);
}
</script>

<style scoped>
.flex-preview {
	height: 130px;
	overflow: auto;
	background: rgba(var(--v-theme-on-surface), 0.03);
}
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
