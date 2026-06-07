<template>
	<BuiltInPanelWidget v-if="widget.type === 'builtinPanel'" :component="widget.component" />
	<CommandButtonWidget v-else-if="widget.type === 'codeButton'" :widget="widget"
						 :override-color="overrideColor" :disabled="disabled" />
	<ValueWidget v-else-if="widget.type === 'value'" :widget="widget" :override-color="overrideColor" />
	<LabelWidget v-else-if="widget.type === 'label'" :widget="widget" :override-color="overrideColor" />
	<InputWidget v-else-if="widget.type === 'input'" :widget="widget" :disabled="disabled" />
	<ChartWidget v-else-if="widget.type === 'chart'" :widget="widget" />
	<JogWidget v-else-if="widget.type === 'jog'" :widget="widget" :disabled="disabled" />
	<NeopixelWidget v-else-if="widget.type === 'neopixel'" :widget="widget" :disabled="disabled" />
	<GlobalsWidget v-else-if="widget.type === 'globals'" :widget="widget" :disabled="disabled" />
	<GroupWidget v-else-if="widget.type === 'group'" :widget="widget" />
	<PluginPageWidget v-else-if="widget.type === 'pluginPage'" :widget="widget" />
	<WebWidget v-else-if="widget.type === 'web'" :widget="widget" />
</template>

<script setup lang="ts">
import type { Widget } from "../model/document";
import BuiltInPanelWidget from "./BuiltInPanelWidget.vue";
import ChartWidget from "./ChartWidget.vue";
import CommandButtonWidget from "./CommandButtonWidget.vue";
import GlobalsWidget from "./GlobalsWidget.vue";
import GroupWidget from "./GroupWidget.vue";
import InputWidget from "./InputWidget.vue";
import JogWidget from "./JogWidget.vue";
import LabelWidget from "./LabelWidget.vue";
import NeopixelWidget from "./NeopixelWidget.vue";
import PluginPageWidget from "./PluginPageWidget.vue";
import ValueWidget from "./ValueWidget.vue";
import WebWidget from "./WebWidget.vue";

defineProps<{ widget: Widget; overrideColor?: string; disabled?: boolean }>();
</script>
