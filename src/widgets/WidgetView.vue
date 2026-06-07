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
	<SliderWidget v-else-if="widget.type === 'slider'" :widget="widget" :disabled="disabled" />
	<ToggleWidget v-else-if="widget.type === 'toggle'" :widget="widget" :disabled="disabled" />
	<StepperWidget v-else-if="widget.type === 'stepper'" :widget="widget" :disabled="disabled" />
	<ProgressWidget v-else-if="widget.type === 'progress'" :widget="widget" />
	<StatusWidget v-else-if="widget.type === 'status'" :widget="widget" />
	<AlertWidget v-else-if="widget.type === 'alert'" :widget="widget" />
	<WebcamWidget v-else-if="widget.type === 'webcam'" :widget="widget" />
	<MacrosWidget v-else-if="widget.type === 'macros'" :widget="widget" :disabled="disabled" />
	<ConsoleWidget v-else-if="widget.type === 'console'" :widget="widget" :disabled="disabled" />
	<HeaterWidget v-else-if="widget.type === 'heater'" :widget="widget" :disabled="disabled" />
	<ClockWidget v-else-if="widget.type === 'clock'" :widget="widget" />
	<TableWidget v-else-if="widget.type === 'table'" :widget="widget" />
	<GroupWidget v-else-if="widget.type === 'group'" :widget="widget" />
	<PluginPageWidget v-else-if="widget.type === 'pluginPage'" :widget="widget" />
	<WebWidget v-else-if="widget.type === 'web'" :widget="widget" />
</template>

<script setup lang="ts">
import type { Widget } from "../model/document";
import AlertWidget from "./AlertWidget.vue";
import BuiltInPanelWidget from "./BuiltInPanelWidget.vue";
import ChartWidget from "./ChartWidget.vue";
import ClockWidget from "./ClockWidget.vue";
import CommandButtonWidget from "./CommandButtonWidget.vue";
import ConsoleWidget from "./ConsoleWidget.vue";
import GlobalsWidget from "./GlobalsWidget.vue";
import GroupWidget from "./GroupWidget.vue";
import HeaterWidget from "./HeaterWidget.vue";
import InputWidget from "./InputWidget.vue";
import JogWidget from "./JogWidget.vue";
import LabelWidget from "./LabelWidget.vue";
import MacrosWidget from "./MacrosWidget.vue";
import NeopixelWidget from "./NeopixelWidget.vue";
import PluginPageWidget from "./PluginPageWidget.vue";
import ProgressWidget from "./ProgressWidget.vue";
import SliderWidget from "./SliderWidget.vue";
import StatusWidget from "./StatusWidget.vue";
import StepperWidget from "./StepperWidget.vue";
import TableWidget from "./TableWidget.vue";
import ToggleWidget from "./ToggleWidget.vue";
import ValueWidget from "./ValueWidget.vue";
import WebcamWidget from "./WebcamWidget.vue";
import WebWidget from "./WebWidget.vue";

defineProps<{ widget: Widget; overrideColor?: string; disabled?: boolean }>();
</script>
