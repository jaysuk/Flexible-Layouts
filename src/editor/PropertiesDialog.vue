<template>
	<v-dialog :model-value="modelValue" max-width="520" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card v-if="draft">
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">{{ described.icon }}</v-icon>
				{{ $t("plugins.flexibleLayouts.properties.title") }}
				<span class="text-medium-emphasis text-truncate ms-2">— {{ described.title }}</span>
				<v-chip size="x-small" label class="ms-2 flex-type-chip" :title="$t('plugins.flexibleLayouts.properties.widgetType')">{{ typeLabel }}</v-chip>
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<!-- Live preview of the widget as configured -->
				<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.properties.preview") }}</div>
				<v-sheet border rounded class="flex-preview mb-3" :style="previewStyle">
					<WidgetView :key="previewKey" :widget="(draft as Widget)" />
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
					<v-row dense class="mb-2">
						<v-col cols="6"><IconPicker v-model="draft.icon" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.iconSize" type="number" :min="0" density="compact"
									  variant="outlined" hide-details clearable suffix="px"
									  :label="$t('plugins.flexibleLayouts.properties.iconSize')"
									  :placeholder="$t('plugins.flexibleLayouts.properties.iconSizeAuto')" /></v-col>
					</v-row>
					<v-select v-if="draft.icon" v-model="iconPos" :items="iconPositionOptions" class="mb-2"
							  density="compact" variant="outlined" hide-details
							  :label="$t('plugins.flexibleLayouts.properties.iconPosition')" />
					<ColorSelect v-model="draft.color" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
					<v-switch v-model="draft.confirm" color="primary" hide-details density="compact"
							  :label="$t('plugins.flexibleLayouts.properties.confirm')" />
					<v-text-field v-model.number="draft.debounceMs" type="number" :min="0" density="compact"
								  variant="outlined" hide-details clearable class="mt-2" suffix="ms"
								  :label="$t('plugins.flexibleLayouts.properties.debounce')"
								  :hint="$t('plugins.flexibleLayouts.properties.debounceHint')" persistent-hint />
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
					<ColorSelect v-model="draft.color" class="mt-2" density="compact"
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
									<v-col cols="12">
										<v-text-field v-model="draft.expression" density="compact" variant="outlined"
													  hide-details clearable placeholder="x / 60"
													  :label="$t('plugins.flexibleLayouts.properties.expression')" />
										<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.properties.expressionHint") }}</div>
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
					<ColorSelect v-if="draft.variant === 'text' || draft.variant === 'heading'"
							  v-model="draft.color" density="compact" variant="outlined"
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
					<ColorSelect v-model="draft.color" density="compact" variant="outlined"
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
							<ColorSelect v-model="s.color" density="compact" variant="outlined"
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
								  :label="$t('plugins.flexibleLayouts.properties.url')" placeholder="https://…" />
					<v-alert type="info" variant="tonal" density="compact" class="mt-2">
						<div class="text-caption" v-html="urlFormatsHtml" />
						<div class="text-caption mt-1">{{ $t("plugins.flexibleLayouts.properties.webEmbedNote") }}</div>
					</v-alert>
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
					<ColorSelect v-model="draft.color" class="mt-2" density="compact"
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

				<!-- NeoPixel / LED strip -->
				<template v-else-if="draft.type === 'neopixel'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details
								  clearable :label="$t('plugins.flexibleLayouts.neopixel.titleField')" />
					<v-select v-model="draft.stripMode" :items="stripModeOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.neopixel.stripMode')" />
					<v-select v-if="draft.stripMode === 'fixed'" v-model.number="draft.stripIndex" :items="stripIndexItems"
							  class="mb-2" density="compact" variant="outlined" hide-details
							  :label="$t('plugins.flexibleLayouts.neopixel.stripIndex')" />
					<v-row dense>
						<v-col cols="6">
							<v-text-field v-model.number="draft.ledCount" type="number" :min="1" density="compact"
										  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.neopixel.count')" />
						</v-col>
						<v-col cols="6">
							<ColorSelect v-model="draft.color" density="compact" variant="outlined"
									  hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
						</v-col>
					</v-row>
					<div class="d-flex flex-wrap ga-x-4 mt-1">
						<v-switch v-model="draft.showPerLed" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.neopixel.showPerLed')" />
						<v-switch v-model="draft.showCount" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.neopixel.showCount')" />
					</div>
				</template>

				<!-- Globals -->
				<template v-else-if="draft.type === 'globals'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details
								  clearable :label="$t('plugins.flexibleLayouts.globals.titleField')" />
					<v-select v-model="draft.mode" :items="globalsModeOptions" class="mb-2" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.globals.mode')" />
					<v-combobox v-if="draft.mode === 'list'" v-model="draft.names" :items="liveGlobalNames" multiple
								chips closable-chips clearable density="compact" variant="outlined" hide-details
								class="mb-2" :label="$t('plugins.flexibleLayouts.globals.names')"
								:hint="$t('plugins.flexibleLayouts.globals.namesHint')" persistent-hint />
					<div class="d-flex flex-wrap ga-x-4 mt-1">
						<v-switch v-model="draft.allowEdit" color="primary" density="compact" hide-details
								  :label="$t('plugins.flexibleLayouts.globals.allowEdit')" />
						<v-switch v-if="draft.mode !== 'list'" v-model="draft.showSearch" color="primary" density="compact"
								  hide-details :label="$t('plugins.flexibleLayouts.globals.showSearch')" />
					</div>
				</template>

				<!-- Slider -->
				<template v-else-if="draft.type === 'slider'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-text-field v-model="draft.command" class="mb-2" density="compact" variant="outlined" hide-details
								  label="Command" placeholder="M106 P0 S{value}"
								  :hint="$t('plugins.flexibleLayouts.properties.codeHint')" />
					<OmPathField v-model="draft.omPath" class="mb-2"
								 :label="$t('plugins.flexibleLayouts.slider.omPath')" />
					<v-row dense>
						<v-col cols="4"><v-text-field v-model.number="draft.min" type="number" density="compact" variant="outlined" hide-details label="Min" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.max" type="number" density="compact" variant="outlined" hide-details label="Max" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.step" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.slider.step')" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="4"><v-text-field v-model.number="draft.scale" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.slider.scale')" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.offset" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.slider.offset')" /></v-col>
						<v-col cols="4"><v-text-field v-model="draft.unit" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.unit')" /></v-col>
					</v-row>
					<ColorSelect v-model="draft.color" class="mt-2" density="compact" variant="outlined"
							  hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
					<v-switch v-model="draft.live" color="primary" density="compact" hide-details class="mt-1"
							  :label="$t('plugins.flexibleLayouts.slider.live')" />
				</template>

				<!-- Toggle -->
				<template v-else-if="draft.type === 'toggle'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-text-field v-model="draft.onCommand" class="mb-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.toggle.onCommand')" placeholder="M80" />
					<v-text-field v-model="draft.offCommand" class="mb-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.toggle.offCommand')" placeholder="M81" />
					<OmPathField v-model="draft.omPath" class="mb-2"
								 :label="$t('plugins.flexibleLayouts.toggle.omPath')" />
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.variant" :items="toggleVariantOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.toggle.variant')" /></v-col>
						<v-col cols="6"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Stepper -->
				<template v-else-if="draft.type === 'stepper'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-select v-model="draft.mode" :items="stepperModeOptions" class="mb-2" density="compact" variant="outlined"
							  hide-details :label="$t('plugins.flexibleLayouts.stepper.mode')" />
					<v-text-field v-model="draft.command" class="mb-2" density="compact" variant="outlined" hide-details
								  label="Command" placeholder="M290 Z{value}"
								  :hint="$t('plugins.flexibleLayouts.stepper.commandHint')" persistent-hint />
					<OmPathField v-model="draft.omPath" class="mb-2"
								 :label="$t('plugins.flexibleLayouts.stepper.omPath')" />
					<v-row dense>
						<v-col cols="3"><v-text-field v-model.number="draft.step" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.slider.step')" /></v-col>
						<v-col cols="3"><v-text-field v-model.number="draft.min" type="number" density="compact" variant="outlined" hide-details label="Min" /></v-col>
						<v-col cols="3"><v-text-field v-model.number="draft.max" type="number" density="compact" variant="outlined" hide-details label="Max" /></v-col>
						<v-col cols="3"><v-text-field v-model.number="draft.precision" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.stepper.precision')" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="6"><v-text-field v-model="draft.unit" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.unit')" /></v-col>
						<v-col cols="6"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Progress bar -->
				<template v-else-if="draft.type === 'progress'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.properties.label')" />
					<OmPathField v-model="draft.omPath" class="mb-2" :label="$t('plugins.flexibleLayouts.progress.omPath')" />
					<OmPathField v-model="draft.maxPath" class="mb-2" :label="$t('plugins.flexibleLayouts.progress.maxPath')" />
					<v-row dense>
						<v-col cols="4"><v-text-field v-model.number="draft.min" type="number" density="compact" variant="outlined" hide-details label="Min" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.max" type="number" density="compact" variant="outlined" hide-details label="Max" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.scale" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.slider.scale')" /></v-col>
					</v-row>
					<div class="d-flex flex-wrap ga-x-4 mt-1 align-center">
						<v-switch v-model="draft.showValue" color="primary" density="compact" hide-details :label="$t('plugins.flexibleLayouts.progress.showValue')" />
						<ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details style="max-width:11rem" :label="$t('plugins.flexibleLayouts.properties.color')" />
					</div>
				</template>

				<!-- Status indicator -->
				<template v-else-if="draft.type === 'status'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<OmPathField v-model="draft.omPath" class="mb-2" :label="$t('plugins.flexibleLayouts.status.omPath')" />
					<div class="d-flex align-center mb-1">
						<span class="text-title-small">{{ $t("plugins.flexibleLayouts.status.states") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addStatusState">{{ $t("plugins.flexibleLayouts.conditions.add") }}</v-btn>
					</div>
					<v-sheet v-for="(s, i) in draft.states" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2">
							<v-select v-model="s.operator" :items="operatorOptions" density="compact" variant="outlined" hide-details style="max-width:130px" :label="$t('plugins.flexibleLayouts.conditions.operator')" />
							<v-text-field v-if="needsValue(s.operator)" v-model="s.value" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.conditions.value')" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.states.splice(i, 1)" />
						</div>
						<div class="d-flex ga-2 mt-2">
							<v-text-field v-model="s.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
							<v-text-field v-model="s.icon" density="compact" variant="outlined" hide-details label="mdi-…" style="max-width:9rem" />
							<ColorSelect v-model="s.color" density="compact" variant="outlined" hide-details style="max-width:9rem" :label="$t('plugins.flexibleLayouts.properties.color')" />
						</div>
					</v-sheet>
					<v-row dense>
						<v-col cols="6"><v-text-field v-model="draft.defaultLabel" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.status.defaultLabel')" /></v-col>
						<v-col cols="6"><ColorSelect v-model="draft.defaultColor" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.status.defaultColor')" /></v-col>
					</v-row>
				</template>

				<!-- Alert banner -->
				<template v-else-if="draft.type === 'alert'">
					<v-text-field v-model="draft.message" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.alert.message')" />
					<OmPathField v-model="draft.omPath" class="mb-2" :label="$t('plugins.flexibleLayouts.alert.omPath')" />
					<div class="d-flex ga-2 mb-2">
						<v-select v-model="draft.operator" :items="operatorOptions" density="compact" variant="outlined" hide-details style="max-width:150px" :label="$t('plugins.flexibleLayouts.conditions.operator')" />
						<v-text-field v-if="needsValue(draft.operator)" v-model="draft.value" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.conditions.value')" />
					</div>
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.severity" :items="severityOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.alert.severity')" /></v-col>
						<v-col cols="6"><v-text-field v-model="draft.icon" density="compact" variant="outlined" hide-details label="mdi-…" /></v-col>
					</v-row>
				</template>

				<!-- Webcam -->
				<template v-else-if="draft.type === 'webcam'">
					<v-text-field v-model="draft.url" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.webcam.url')" placeholder="http://…/webcam/?action=snapshot" />
					<v-row dense>
						<v-col cols="4"><v-text-field v-model.number="draft.refreshMs" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.webcam.refreshMs')" /></v-col>
						<v-col cols="4"><v-select v-model="draft.fit" :items="fitOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.webcam.fit')" /></v-col>
						<v-col cols="4" class="d-flex align-center"><v-switch v-model="draft.fullscreen" color="primary" density="compact" hide-details :label="$t('plugins.flexibleLayouts.webcam.fullscreen')" /></v-col>
					</v-row>
				</template>

				<!-- Tool alignment -->
				<template v-else-if="draft.type === 'toolAlign'">
					<v-text-field v-model="draft.url" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.webcam.url')" placeholder="http://…/webcam/?action=stream" />
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="draft.refreshMs" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.webcam.refreshMs')" /></v-col>
						<v-col cols="6"><v-select v-model="draft.fit" :items="fitOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.webcam.fit')" /></v-col>
					</v-row>
					<div class="text-caption text-medium-emphasis mb-1 mt-2">{{ $t("plugins.flexibleLayouts.toolAlign.overlayHeading") }}</div>
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.overlay" :items="overlayOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.toolAlign.overlay')" /></v-col>
						<v-col cols="6"><v-text-field v-model="draft.overlayColor" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.toolAlign.overlayColor')" placeholder="#39FF14" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.overlayX" type="number" density="compact" variant="outlined" hide-details suffix="%" :label="$t('plugins.flexibleLayouts.toolAlign.centreX')" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.overlayY" type="number" density="compact" variant="outlined" hide-details suffix="%" :label="$t('plugins.flexibleLayouts.toolAlign.centreY')" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.overlaySize" type="number" density="compact" variant="outlined" hide-details suffix="px" :label="$t('plugins.flexibleLayouts.toolAlign.ringSize')" /></v-col>
					</v-row>
					<div class="text-caption text-medium-emphasis mb-1 mt-2">{{ $t("plugins.flexibleLayouts.toolAlign.jogHeading") }}</div>
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="draft.jogStep" type="number" step="0.01" density="compact" variant="outlined" hide-details suffix="mm" :label="$t('plugins.flexibleLayouts.toolAlign.jogStep')" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.jogFeed" type="number" density="compact" variant="outlined" hide-details suffix="mm/min" :label="$t('plugins.flexibleLayouts.toolAlign.jogFeed')" /></v-col>
					</v-row>

					<div class="text-caption text-medium-emphasis mb-1 mt-2">{{ $t("plugins.flexibleLayouts.toolAlign.zHeading") }}</div>
					<v-switch v-model="draft.enableZ" color="primary" density="compact" hide-details
							  :label="$t('plugins.flexibleLayouts.toolAlign.enableZ')" />
					<v-text-field v-if="draft.enableZ" v-model="draft.zProbeCommand" class="mt-1" density="compact" variant="outlined"
								  hide-details clearable :label="$t('plugins.flexibleLayouts.toolAlign.zProbeCommand')"
								  placeholder="G30 S-1" :hint="$t('plugins.flexibleLayouts.toolAlign.zProbeHint')" persistent-hint />

					<div class="text-caption text-medium-emphasis mb-1 mt-3">{{ $t("plugins.flexibleLayouts.toolAlign.cameraHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.toolAlign.cameraConfigHint") }}</div>
					<v-row dense>
						<v-col cols="4"><v-text-field v-model.number="draft.cameraX" type="number" density="compact" variant="outlined" hide-details clearable label="X" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.cameraY" type="number" density="compact" variant="outlined" hide-details clearable label="Y" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.cameraZ" type="number" density="compact" variant="outlined" hide-details clearable label="Z" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.travelFeed" type="number" density="compact" variant="outlined" hide-details suffix="mm/min" :label="$t('plugins.flexibleLayouts.toolAlign.travelFeed')" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.safeZ" type="number" density="compact" variant="outlined" hide-details clearable suffix="mm" :label="$t('plugins.flexibleLayouts.toolAlign.safeZ')" /></v-col>
					</v-row>
					<v-switch v-model="draft.useG53" color="primary" density="compact" hide-details
							  :label="$t('plugins.flexibleLayouts.toolAlign.useG53')" />
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.toolAlign.useG53Hint") }}</div>

					<div class="text-caption text-medium-emphasis mb-1 mt-3">{{ $t("plugins.flexibleLayouts.toolAlign.hooksHeading") }}</div>
					<v-text-field v-model="draft.startCommand" class="mb-2" density="compact" variant="outlined" hide-details clearable
								  :label="$t('plugins.flexibleLayouts.toolAlign.startCommand')" placeholder="G28" />
					<v-text-field v-model="draft.finishCommand" class="mb-2" density="compact" variant="outlined" hide-details clearable
								  :label="$t('plugins.flexibleLayouts.toolAlign.finishCommand')" placeholder="T-1" />
					<v-text-field v-model="draft.saveCommand" density="compact" variant="outlined" hide-details clearable
								  :label="$t('plugins.flexibleLayouts.toolAlign.saveCommand')" placeholder="M500"
								  :hint="$t('plugins.flexibleLayouts.toolAlign.saveHint')" persistent-hint />
				</template>

				<!-- Macro grid -->
				<template v-else-if="draft.type === 'macros'">
					<v-text-field v-model="draft.folder" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.macros.folder')" placeholder="0:/macros" />
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="draft.columns" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.macros.columns')" /></v-col>
						<v-col cols="6"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Mini console -->
				<template v-else-if="draft.type === 'console'">
					<v-row dense>
						<v-col cols="4"><v-text-field v-model.number="draft.rows" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.console.rows')" /></v-col>
						<v-col cols="8"><v-text-field v-model="draft.placeholder" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.console.placeholderLabel')" /></v-col>
					</v-row>
				</template>

				<!-- Heater -->
				<template v-else-if="draft.type === 'heater'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<OmPathField v-model="draft.omPath" class="mb-2" :label="$t('plugins.flexibleLayouts.heater.omPath')" />
					<v-text-field v-model="draft.setCommand" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.heater.setCommand')" placeholder="M140 S{value}" />
					<v-text-field v-model="draft.offCommand" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.heater.offCommand')" placeholder="M140 S-273.15" />
					<v-row dense>
						<v-col cols="8"><v-text-field v-model="heaterPresetsText" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.heater.presets')" :hint="$t('plugins.flexibleLayouts.jog.stepsHint')" /></v-col>
						<v-col cols="4"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Clock -->
				<template v-else-if="draft.type === 'clock'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.mode" :items="clockModeOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.clock.mode')" /></v-col>
						<v-col cols="6"><v-select v-if="draft.mode === 'time'" v-model="draft.format" :items="clockFormatOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.clock.format')" /></v-col>
					</v-row>
				</template>

				<!-- Job thumbnail -->
				<template v-else-if="draft.type === 'thumbnail'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.jog.titleField')" />
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.source" :items="thumbnailSourceOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.thumbnail.source')" /></v-col>
						<v-col cols="6"><v-select v-model="draft.fit" :items="thumbnailFitOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.thumbnail.fit')" /></v-col>
					</v-row>
					<v-text-field v-if="draft.source === 'file'" v-model="draft.path" class="mt-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.thumbnail.path')" placeholder="0:/gcodes/benchy.gcode" />
				</template>

				<!-- Multi-value table -->
				<template v-else-if="draft.type === 'table'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.jog.titleField')" />
					<div class="d-flex align-center mb-1">
						<span class="text-title-small">{{ $t("plugins.flexibleLayouts.table.rows") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addTableRow">{{ $t("plugins.flexibleLayouts.conditions.add") }}</v-btn>
					</div>
					<v-sheet v-for="(r, i) in draft.rows" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2">
							<v-text-field v-model="r.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" style="max-width:9rem" />
							<OmPathField v-model="r.omPath" class="flex-grow-1" :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.rows.splice(i, 1)" />
						</div>
						<div class="d-flex ga-2 mt-2">
							<v-text-field v-model="r.unit" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.unit')" style="max-width:8rem" />
							<v-text-field v-model.number="r.precision" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.stepper.precision')" style="max-width:8rem" />
						</div>
					</v-sheet>
				</template>

				<!-- Extruder -->
				<template v-else-if="draft.type === 'extruder'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-text-field v-model="extruderAmountsText" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.extruder.amounts')" :hint="$t('plugins.flexibleLayouts.jog.stepsHint')" />
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.mode" :items="extruderModeOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.extruder.speedBy')" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.tool" type="number" density="compact" variant="outlined" hide-details clearable :label="$t('plugins.flexibleLayouts.extruder.tool')" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="4"><v-text-field v-model.number="draft.feedrate" type="number" density="compact" variant="outlined" hide-details suffix="mm/min" :label="$t('plugins.flexibleLayouts.extruder.speed')" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.flowRate" type="number" step="0.1" density="compact" variant="outlined" hide-details suffix="mm³/s" :label="$t('plugins.flexibleLayouts.extruder.flow')" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.filamentDiameter" type="number" step="0.05" density="compact" variant="outlined" hide-details suffix="mm" :label="$t('plugins.flexibleLayouts.extruder.filamentDiameter')" /></v-col>
					</v-row>
					<ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details class="mt-1" :label="$t('plugins.flexibleLayouts.properties.color')" />
				</template>

				<!-- WCS -->
				<template v-else-if="draft.type === 'wcs'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-row dense>
						<v-col cols="6"><v-text-field v-model="wcsAxesText" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.wcs.axes')" /></v-col>
						<v-col cols="6"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Tool selector -->
				<template v-else-if="draft.type === 'toolSelect'">
					<v-row dense>
						<v-col cols="8"><v-text-field v-model="draft.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" /></v-col>
						<v-col cols="4"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Fan -->
				<template v-else-if="draft.type === 'fan'">
					<v-row dense>
						<v-col cols="5"><v-text-field v-model="draft.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" /></v-col>
						<v-col cols="3"><v-text-field v-model.number="draft.fanIndex" type="number" :min="0" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.fan.index')" /></v-col>
						<v-col cols="4"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Job control -->
				<template v-else-if="draft.type === 'jobControl'">
					<div class="d-flex flex-wrap ga-x-4 align-center">
						<v-switch v-model="draft.showProgress" color="primary" density="compact" hide-details :label="$t('plugins.flexibleLayouts.progress.showValue')" />
						<ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details style="max-width:11rem" :label="$t('plugins.flexibleLayouts.properties.color')" />
					</div>
				</template>

				<!-- Files -->
				<template v-else-if="draft.type === 'files'">
					<v-text-field v-model="draft.folder" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.files.folder')" placeholder="0:/gcodes" />
					<v-text-field v-model="draft.startCommand" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.files.startCommand')" placeholder='M32 "{path}"' />
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="draft.columns" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.macros.columns')" /></v-col>
						<v-col cols="6"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
					<v-switch v-model="draft.thumbnails" color="primary" density="compact" hide-details class="mt-1" :label="$t('plugins.flexibleLayouts.files.thumbnails')" />
				</template>

				<!-- Gauge cluster -->
				<template v-else-if="draft.type === 'gaugeCluster'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.jog.titleField')" />
					<div class="d-flex align-center mb-1">
						<span class="text-title-small">{{ $t("plugins.flexibleLayouts.gaugeCluster.gauges") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addGauge">{{ $t("plugins.flexibleLayouts.conditions.add") }}</v-btn>
					</div>
					<v-sheet v-for="(g, i) in draft.gauges" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2">
							<v-text-field v-model="g.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" style="max-width:8rem" />
							<OmPathField v-model="g.omPath" class="flex-grow-1" :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.gauges.splice(i, 1)" />
						</div>
						<div class="d-flex ga-2 mt-2">
							<v-text-field v-model.number="g.min" type="number" density="compact" variant="outlined" hide-details label="Min" style="max-width:5rem" />
							<v-text-field v-model.number="g.max" type="number" density="compact" variant="outlined" hide-details label="Max" style="max-width:5rem" />
							<v-text-field v-model="g.unit" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.unit')" style="max-width:5rem" />
							<ColorSelect v-model="g.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" />
						</div>
					</v-sheet>
				</template>

				<!-- Embeddable plugin widget: render the plugin's published config schema (if any) -->
				<template v-else-if="draft.type === 'embeddable'">
					<PluginWidgetConfigForm v-if="embeddableSchema" :schema="embeddableSchema"
						:model-value="draft.config || {}" @update:model-value="(v) => (draft.config = v)" />
					<div v-else class="text-medium-emphasis text-body-2">
						{{ $t("plugins.flexibleLayouts.properties.embeddableNoSchema") }}
					</div>
				</template>

				<!-- Indicators -->
				<template v-else-if="draft.type === 'indicators'">
					<v-row dense class="mb-1">
						<v-col cols="8"><v-text-field v-model="draft.title" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.jog.titleField')" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="draft.columns" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.macros.columns')" /></v-col>
					</v-row>
					<div class="d-flex align-center mb-1">
						<span class="text-title-small">{{ $t("plugins.flexibleLayouts.indicators.items") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addIndicator">{{ $t("plugins.flexibleLayouts.conditions.add") }}</v-btn>
					</div>
					<v-sheet v-for="(it, i) in draft.items" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2">
							<v-text-field v-model="it.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" style="max-width:8rem" />
							<OmPathField v-model="it.omPath" class="flex-grow-1" :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.items.splice(i, 1)" />
						</div>
						<div class="d-flex ga-2 mt-2">
							<ColorSelect v-model="it.trueColor" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.indicators.onColor')" />
							<ColorSelect v-model="it.falseColor" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.indicators.offColor')" />
						</div>
					</v-sheet>
				</template>

				<!-- Sparkline -->
				<template v-else-if="draft.type === 'sparkline'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.jog.titleField')" />
					<div class="d-flex align-center mb-1">
						<span class="text-title-small">{{ $t("plugins.flexibleLayouts.sparkline.series") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addSparkSeries">{{ $t("plugins.flexibleLayouts.conditions.add") }}</v-btn>
					</div>
					<v-sheet v-for="(s, i) in draft.series" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2">
							<OmPathField v-model="s.omPath" class="flex-grow-1" :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
							<ColorSelect v-model="s.color" density="compact" variant="outlined" hide-details style="max-width:8rem" :label="$t('plugins.flexibleLayouts.properties.color')" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.series.splice(i, 1)" />
						</div>
					</v-sheet>
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="draft.windowSeconds" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.windowSeconds')" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.intervalMs" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.intervalMs')" /></v-col>
					</v-row>
				</template>

				<!-- Note -->
				<template v-else-if="draft.type === 'note'">
					<v-textarea v-model="draft.content" density="compact" variant="outlined" auto-grow rows="6"
								:label="$t('plugins.flexibleLayouts.note.content')" :hint="$t('plugins.flexibleLayouts.note.hint')" persistent-hint />
				</template>

				<!-- HTTP / REST -->
				<template v-else-if="draft.type === 'http'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-text-field v-model="draft.url" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.http.url')" placeholder="https://…" />
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="draft.pollMs" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.http.pollMs')" /></v-col>
						<v-col cols="6"><v-text-field v-model="draft.jsonPath" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.http.jsonPath')" placeholder="data.value" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="6"><v-text-field v-model="draft.prefix" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.http.prefix')" /></v-col>
						<v-col cols="6"><v-text-field v-model="draft.suffix" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.http.suffix')" /></v-col>
					</v-row>
					<v-alert type="info" variant="tonal" density="compact" class="mt-2">
						<div class="text-caption" v-html="urlFormatsHtml" />
						<div class="text-caption mt-1">{{ $t("plugins.flexibleLayouts.properties.httpCorsNote") }}</div>
					</v-alert>
				</template>

				<!-- Event log -->
				<template v-else-if="draft.type === 'eventLog'">
					<v-text-field v-model.number="draft.rows" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.console.rows')" />
				</template>

				<!-- Hotspot image -->
				<template v-else-if="draft.type === 'hotspot'">
					<v-text-field v-model="draft.url" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.hotspot.url')" placeholder="https://…" />
					<div class="d-flex align-center mb-1">
						<span class="text-title-small">{{ $t("plugins.flexibleLayouts.hotspot.regions") }}</span>
						<v-spacer />
						<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addRegion">{{ $t("plugins.flexibleLayouts.conditions.add") }}</v-btn>
					</div>
					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.hotspot.hint") }}</div>
					<v-sheet v-for="(r, i) in draft.regions" :key="i" border rounded class="pa-2 mb-2">
						<div class="d-flex ga-2">
							<v-text-field v-model="r.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" style="max-width:8rem" />
							<v-text-field v-model="r.command" density="compact" variant="outlined" hide-details label="Command" class="flex-grow-1" />
							<v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="draft.regions.splice(i, 1)" />
						</div>
						<div class="d-flex ga-2 mt-2">
							<v-text-field v-model.number="r.x" type="number" density="compact" variant="outlined" hide-details label="X%" style="max-width:5rem" />
							<v-text-field v-model.number="r.y" type="number" density="compact" variant="outlined" hide-details label="Y%" style="max-width:5rem" />
							<v-text-field v-model.number="r.w" type="number" density="compact" variant="outlined" hide-details label="W%" style="max-width:5rem" />
							<v-text-field v-model.number="r.h" type="number" density="compact" variant="outlined" hide-details label="H%" style="max-width:5rem" />
						</div>
					</v-sheet>
				</template>

				<!-- DRO -->
				<template v-else-if="draft.type === 'dro'">
					<v-text-field v-model="draft.title" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.jog.titleField')" />
					<v-text-field v-model="droAxesText" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.dro.axes')" :hint="$t('plugins.flexibleLayouts.dro.axesHint')" persistent-hint />
					<v-row dense>
						<v-col cols="6"><v-select v-model="draft.coord" :items="droCoordOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.dro.coord')" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="draft.precision" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.stepper.precision')" /></v-col>
					</v-row>
				</template>

				<!-- Spindle -->
				<template v-else-if="draft.type === 'spindle'">
					<v-text-field v-model="draft.label" class="mb-2" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" />
					<v-row dense>
						<v-col cols="3"><v-text-field v-model.number="draft.spindleIndex" type="number" :min="0" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.spindle.index')" /></v-col>
						<v-col cols="3"><v-text-field v-model.number="draft.min" type="number" density="compact" variant="outlined" hide-details label="Min RPM" /></v-col>
						<v-col cols="3"><v-text-field v-model.number="draft.max" type="number" density="compact" variant="outlined" hide-details label="Max RPM" /></v-col>
						<v-col cols="3"><ColorSelect v-model="draft.color" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.color')" /></v-col>
					</v-row>
				</template>

				<!-- Message box -->
				<template v-else-if="draft.type === 'messageBox'">
					<div class="text-body-2 text-medium-emphasis">{{ $t("plugins.flexibleLayouts.messageBox.note") }}</div>
				</template>

				<!-- Profile switcher -->
				<template v-else-if="draft.type === 'profileSwitch'">
					<v-row dense>
						<v-col cols="7"><v-text-field v-model="draft.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" /></v-col>
						<v-col cols="5"><v-select v-model="draft.variant" :items="selectButtonsOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.toggle.variant')" /></v-col>
					</v-row>
				</template>

				<!-- Theme toggle -->
				<template v-else-if="draft.type === 'themeToggle'">
					<v-row dense>
						<v-col cols="7"><v-text-field v-model="draft.label" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.properties.label')" /></v-col>
						<v-col cols="5"><v-select v-model="draft.variant" :items="toggleVariantOptions" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.toggle.variant')" /></v-col>
					</v-row>
				</template>

				<!-- Built-in panel: optional title override -->
				<template v-else-if="draft.type === 'builtinPanel'">
					<div class="text-body-2 text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.properties.builtinNote", { name: draft.component }) }}
					</div>
				</template>

				<!-- Input modifier (value-entry widgets): transform the entered value before it is sent.
					 The input-side mirror of the value widget's display formatting. -->
				<template v-if="showInputModifier && draft.modifier">
					<v-expansion-panels class="mt-3" variant="accordion">
						<v-expansion-panel :title="$t('plugins.flexibleLayouts.inputModifier.title')">
							<v-expansion-panel-text>
								<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.inputModifier.help") }}</div>
								<v-row dense>
									<v-col cols="6">
										<v-text-field v-model.number="draft.modifier.scale" type="number" density="compact"
													  variant="outlined" hide-details clearable
													  :label="$t('plugins.flexibleLayouts.properties.scale')" />
									</v-col>
									<v-col cols="6">
										<v-text-field v-model.number="draft.modifier.offset" type="number" density="compact"
													  variant="outlined" hide-details clearable
													  :label="$t('plugins.flexibleLayouts.properties.offset')" />
									</v-col>
									<v-col cols="12">
										<v-text-field v-model="draft.modifier.expression" density="compact" variant="outlined"
													  hide-details clearable placeholder="x * 60"
													  :label="$t('plugins.flexibleLayouts.properties.expression')" />
										<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.inputModifier.expressionHint") }}</div>
									</v-col>
								</v-row>
								<div class="d-flex align-center mt-2 mb-1">
									<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.inputModifier.map") }}</span>
									<v-spacer />
									<v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addInputMap">
										{{ $t("plugins.flexibleLayouts.conditions.add") }}
									</v-btn>
								</div>
								<div v-for="(m, mi) in (draft.modifier.map ?? [])" :key="mi" class="d-flex ga-2 mb-1 align-center">
									<v-text-field v-model="m.from" density="compact" variant="outlined" hide-details
												  :label="$t('plugins.flexibleLayouts.inputModifier.from')" />
									<v-text-field v-model="m.to" density="compact" variant="outlined" hide-details
												  :label="$t('plugins.flexibleLayouts.inputModifier.to')" />
									<v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="draft.modifier.map.splice(mi, 1)" />
								</div>
							</v-expansion-panel-text>
						</v-expansion-panel>
					</v-expansion-panels>
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
						<ColorSelect v-model="rule.color" density="compact" variant="outlined"
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
				<v-switch v-model="typography.responsive" color="primary" density="compact" hide-details class="mt-1"
						  :label="$t('plugins.flexibleLayouts.typography.responsive')" />
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.typography.responsiveHint") }}</div>
				<div class="text-caption text-medium-emphasis mb-1 mt-2">{{ $t("plugins.flexibleLayouts.typography.labelFont") }}</div>
				<v-row dense>
					<v-col cols="6"><v-text-field v-model.number="typography.labelFontSize" type="number" density="compact" variant="outlined" hide-details clearable :label="$t('plugins.flexibleLayouts.typography.fontSize')" suffix="px" /></v-col>
					<v-col cols="6"><v-select v-model="typography.labelFontFamily" :items="fontOptions" density="compact" variant="outlined" hide-details clearable :label="$t('plugins.flexibleLayouts.typography.fontFamily')" /></v-col>
				</v-row>
				<v-switch v-model="fit" color="primary" density="compact" hide-details class="mt-1"
						  :label="$t('plugins.flexibleLayouts.typography.fit')" />
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.typography.fitHint") }}</div>
				<v-switch v-model="autoHeight" color="primary" density="compact" hide-details class="mt-1"
						  :label="$t('plugins.flexibleLayouts.typography.autoHeight')" />
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.typography.autoHeightHint") }}</div>
				<v-text-field v-model="tooltip" class="mt-3" density="compact" variant="outlined" hide-details clearable
							  :label="$t('plugins.flexibleLayouts.properties.tooltip')" />
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.properties.tooltipHint") }}</div>

				<v-switch v-model="lockWhilePrinting" color="primary" density="compact" hide-details class="mt-2"
						  :label="$t('plugins.flexibleLayouts.printLock.widgetLabel')" />
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.printLock.widgetHint") }}</div>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="card-actions" @click="save">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { getWidgetConfig, PluginWidgetConfigForm } from "dwc-plugin-runtime";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

import type { ConditionOperator, ConditionRule, GridItemModel, PanelColors, Typography, Widget } from "../model/document";
import { hasInputModifier } from "../util/inputModifier";
import { OM_VALUE_PRESETS, type OmPreset, resolveOmPath } from "../util/omPath";
import { defaultLockForWidget } from "../util/printLock";
import { describeWidget } from "../widgets/registry";
import ColorSelect from "./ColorSelect.vue";
import IconPicker from "./IconPicker.vue";
import OmPathField from "./OmPathField.vue";
import WidgetView from "../widgets/WidgetView.vue";

const props = defineProps<{ modelValue: boolean; item: GridItemModel | null }>();
const emit = defineEmits<{
	"update:modelValue": [boolean];
	save: [{ widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; autoHeight: boolean | undefined; tooltip: string | undefined; lockWhilePrinting: boolean | undefined; geometry: { x: number; y: number; w: number; h: number } }];
}>();

const machineStore = useMachineStore();

// A loosely-typed working copy avoids fighting the discriminated union in the template; the value
// is cast back to Widget on save. Re-cloned every time the dialog opens.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draft = ref<any>(null);

// Config schema a plugin published for an embedded widget (dwc-plugin-runtime widget-config registry).
// When present, the properties dialog renders the shared schema-driven form so the user can configure
// the third-party widget per instance.
const embeddableSchema = computed(() =>
	draft.value?.type === "embeddable" ? (getWidgetConfig(draft.value.id)?.schema ?? null) : null);
// Name + icon of the panel being edited, shown in the dialog header.
const described = computed(() => draft.value ? describeWidget(draft.value as Widget) : { title: "", icon: "mdi-cog" });

// Raw widget type shown as a chip in the header — handy for support/troubleshooting from screenshots.
const typeLabel = computed(() => {
	const w = draft.value;
	if (!w) return "";
	if (w.type === "builtinPanel") return `builtinPanel · ${w.component}`;
	if (w.type === "pluginPage") return `pluginPage · ${w.source ?? "page"}`;
	if (w.type === "embeddable") return `embeddable · ${w.id}`;
	return w.type as string;
});

// Icon position for the command button (shows "top" by default until explicitly changed).
const iconPos = computed<string>({
	get: () => draft.value?.iconPosition ?? "top",
	set: (v) => { if (draft.value) { draft.value.iconPosition = v; } },
});

// Shared "how URLs are interpreted" help for the web + http widgets.
const urlFormatsHtml = computed(() =>
	`<strong>${t("properties.urlFormatsTitle")}</strong><br>`
	+ `<code>https://host</code> — ${t("properties.urlFull")}<br>`
	+ `<code>host</code> — ${t("properties.urlBare")}<br>`
	+ `<code>//host</code> — ${t("properties.urlProtoRel")}<br>`
	+ `<code>/path</code> — ${t("properties.urlRootRel")}`);
const conditions = ref<Array<ConditionRule>>([]);
const colors = ref<PanelColors>({});
const typography = ref<Typography>({});
const fit = ref<boolean | undefined>(undefined);
const autoHeight = ref<boolean | undefined>(undefined);
const tooltip = ref<string>("");
const lockWhilePrinting = ref<boolean>(false);
const geom = ref({ x: 0, y: 0, w: 2, h: 2 });
watch(
	() => props.modelValue,
	(open) => {
		if (open && props.item) {
			draft.value = JSON.parse(JSON.stringify(props.item.widget));
			// Value-entry widgets get a (possibly empty) modifier object so the editor can bind to it;
			// an unused one is stripped again on save.
			if (MODIFIER_TYPES.has(draft.value.type) && !draft.value.modifier) {
				draft.value.modifier = {};
			}
			conditions.value = JSON.parse(JSON.stringify(props.item.conditions ?? []));
			colors.value = JSON.parse(JSON.stringify(props.item.colors ?? {}));
			typography.value = JSON.parse(JSON.stringify(props.item.typography ?? {}));
			geom.value = { x: props.item.x, y: props.item.y, w: props.item.w, h: props.item.h };
			// Match the runtime default: scale-to-fit is OFF unless explicitly enabled (so opening +
			// saving a panel's properties doesn't silently turn fit on and change how it renders).
			fit.value = props.item.fit ?? false;
			autoHeight.value = props.item.autoHeight ?? false;
			tooltip.value = props.item.tooltip ?? "";
			// Default reflects the widget-type policy (motion/tool widgets default on) until set explicitly.
			lockWhilePrinting.value = props.item.lockWhilePrinting ?? defaultLockForWidget(props.item.widget);
		}
	},
	{ immediate: true },
);

// Remount the preview whenever the widget config changes, so widgets that read their props once (into
// local refs) still reflect edits live — not only the ones using reactive computeds.
const previewKey = computed(() => (draft.value ? JSON.stringify(draft.value) : ""));

// Reflect the edited panel colours + typography in the preview container (these are applied by the
// grid wrapper at runtime, not by WidgetView itself), so colour/font changes show without saving.
const previewStyle = computed(() => {
	const s: Record<string, string> = {};
	if (typography.value.fontSize) s.fontSize = `${typography.value.fontSize}px`;
	if (typography.value.fontFamily) s.fontFamily = typography.value.fontFamily;
	if (colors.value.background) s.background = colors.value.background;
	if (colors.value.text) s.color = colors.value.text;
	return s;
});

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

// Only the free-entry Input box offers the modifier — slider/stepper already expose scale/offset for
// their tracked value, so a second transform there would just be confusing.
const MODIFIER_TYPES = new Set(["input"]);
const showInputModifier = computed(() => !!draft.value && MODIFIER_TYPES.has(draft.value.type));
function addInputMap() {
	if (draft.value) {
		(draft.value.modifier ??= {}).map ??= [];
		draft.value.modifier.map.push({ from: "", to: "" });
	}
}
function removeRule(index: number) {
	conditions.value.splice(index, 1);
}
function needsValue(op: ConditionOperator): boolean {
	return op !== "truthy" && op !== "falsy";
}

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

// NeoPixel config options
const stripModeOptions = computed(() => [
	{ title: t("neopixel.modeAuto"), value: "auto" },
	{ title: t("neopixel.modeChoose"), value: "choose" },
	{ title: t("neopixel.modeFixed"), value: "fixed" },
]);
const stripIndexItems = computed(() => {
	const arr = (machineStore.model as unknown as { ledStrips?: Array<unknown> }).ledStrips;
	if (!Array.isArray(arr)) return [] as Array<{ title: string; value: number }>;
	return arr.map((s, i) => (s ? { title: `${i}: ${(s as { type?: string }).type ?? "strip"}`, value: i } : null))
		.filter((x): x is { title: string; value: number } => x !== null);
});

// Globals config options
const globalsModeOptions = computed(() => [
	{ title: t("globals.modeAll"), value: "all" },
	{ title: t("globals.modeList"), value: "list" },
]);

// Toggle / stepper config options
const toggleVariantOptions = computed(() => [
	{ title: t("toggle.variantSwitch"), value: "switch" },
	{ title: t("toggle.variantButton"), value: "button" },
]);
const stepperModeOptions = computed(() => [
	{ title: t("stepper.modeRelative"), value: "relative" },
	{ title: t("stepper.modeAbsolute"), value: "absolute" },
]);

// Tier 2/3 config options
const severityOptions = computed(() => [
	{ title: t("alert.sevInfo"), value: "info" },
	{ title: t("alert.sevSuccess"), value: "success" },
	{ title: t("alert.sevWarning"), value: "warning" },
	{ title: t("alert.sevError"), value: "error" },
]);
const fitOptions = computed(() => [
	{ title: t("webcam.fitContain"), value: "contain" },
	{ title: t("webcam.fitCover"), value: "cover" },
]);
const overlayOptions = computed(() => [
	{ title: t("toolAlign.overlayCrosshair"), value: "crosshair" },
	{ title: t("toolAlign.overlayTarget"), value: "target" },
	{ title: t("toolAlign.overlayNone"), value: "none" },
]);
const thumbnailFitOptions = computed(() => [
	{ title: t("thumbnail.fitContain"), value: "contain" },
	{ title: t("thumbnail.fitCover"), value: "cover" },
]);
const thumbnailSourceOptions = computed(() => [
	{ title: t("thumbnail.sourceJob"), value: "job" },
	{ title: t("thumbnail.sourceFile"), value: "file" },
]);
const extruderModeOptions = computed(() => [
	{ title: t("extruder.byLength"), value: "length" },
	{ title: t("extruder.byFlow"), value: "flow" },
]);
const clockModeOptions = computed(() => [
	{ title: t("clock.modeTime"), value: "time" },
	{ title: t("clock.modeUptime"), value: "uptime" },
	{ title: t("clock.modePrintTime"), value: "printTime" },
	{ title: t("clock.modeTimeLeft"), value: "timeLeft" },
]);
const clockFormatOptions = computed(() => [
	{ title: "24h", value: "24" },
	{ title: "12h", value: "12" },
]);
const heaterPresetsText = computed({
	get: () => (draft.value?.presets ?? []).join(", "),
	set: (text: string) => {
		if (draft.value) {
			draft.value.presets = text.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
		}
	},
});
function addStatusState(): void {
	if (draft.value?.type === "status") {
		(draft.value.states ??= []).push({ operator: "eq", value: "", color: "primary", label: "", icon: "" });
	}
}
function addTableRow(): void {
	if (draft.value?.type === "table") {
		(draft.value.rows ??= []).push({ label: "", omPath: "", unit: "", precision: 1 });
	}
}

// Comma-separated editors
const extruderAmountsText = computed({
	get: () => (draft.value?.amounts ?? []).join(", "),
	set: (text: string) => { if (draft.value) { draft.value.amounts = text.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0); } },
});
const wcsAxesText = computed({
	get: () => (draft.value?.axes ?? []).join(", "),
	set: (text: string) => { if (draft.value) { draft.value.axes = text.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean); } },
});
function addGauge(): void {
	if (draft.value?.type === "gaugeCluster") { (draft.value.gauges ??= []).push({ label: "", omPath: "", min: 0, max: 100, unit: "", color: "primary" }); }
}
function addIndicator(): void {
	if (draft.value?.type === "indicators") { (draft.value.items ??= []).push({ label: "", omPath: "", trueColor: "success", falseColor: "grey", trueIcon: "mdi-circle", falseIcon: "mdi-circle-outline" }); }
}
function addSparkSeries(): void {
	if (draft.value?.type === "sparkline") { (draft.value.series ??= []).push({ omPath: "", color: "primary" }); }
}
function addRegion(): void {
	if (draft.value?.type === "hotspot") { (draft.value.regions ??= []).push({ x: 10, y: 10, w: 20, h: 20, command: "", label: "" }); }
}

const droCoordOptions = computed(() => [
	{ title: t("dro.work"), value: "work" },
	{ title: t("dro.machine"), value: "machine" },
]);
const selectButtonsOptions = computed(() => [
	{ title: t("profileSwitch.variantSelect"), value: "select" },
	{ title: t("profileSwitch.variantButtons"), value: "buttons" },
]);
const droAxesText = computed({
	get: () => (draft.value?.axes ?? []).join(", "),
	set: (text: string) => { if (draft.value) { draft.value.axes = text.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean); } },
});
const liveGlobalNames = computed(() => {
	const g = (machineStore.model as unknown as { global?: Map<string, unknown> }).global;
	return g instanceof Map ? Array.from(g.keys()).sort() : [];
});

const iconPositionOptions = computed(() => [
	{ title: t("properties.iconPosTop"), value: "top" },
	{ title: t("properties.iconPosLeft"), value: "left" },
	{ title: t("properties.iconPosRight"), value: "right" },
	{ title: t("properties.iconPosBottom"), value: "bottom" },
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
		// Drop blank map rows, then the whole modifier if it has no effect, so unused config isn't saved.
		if (draft.value.modifier) {
			if (Array.isArray(draft.value.modifier.map)) {
				draft.value.modifier.map = draft.value.modifier.map.filter(
					(m: { from?: string; to?: string }) => (m.from ?? "") !== "" || (m.to ?? "") !== "");
			}
			if (!hasInputModifier(draft.value.modifier)) {
				delete draft.value.modifier;
			}
		}
		emit("save", {
			widget: draft.value as Widget,
			conditions: conditions.value.filter((r) => r.omPath.trim().length > 0),
			colors: colors.value,
			typography: typography.value,
			fit: fit.value,
			autoHeight: autoHeight.value,
			tooltip: tooltip.value.trim() || undefined,
			lockWhilePrinting: lockWhilePrinting.value,
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
