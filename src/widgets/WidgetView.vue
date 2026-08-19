<template>
	<BuiltInPanelWidget v-if="widget.type === 'builtinPanel'" :component="widget.component" />
	<CommandButtonWidget v-else-if="widget.type === 'codeButton'" :widget="widget"
						 :override-color="overrideColor" :disabled="disabled" />
	<ValueWidget v-else-if="widget.type === 'value'" :widget="widget" :override-color="overrideColor" />
	<LabelWidget v-else-if="widget.type === 'label'" :widget="widget" :override-color="overrideColor" />
	<InputWidget v-else-if="widget.type === 'input'" :widget="widget" :disabled="disabled" />
	<ChartWidget v-else-if="widget.type === 'chart'" :widget="widget" />
	<JogWidget v-else-if="widget.type === 'jog'" :widget="widget" :disabled="disabled" />
	<OctopusJogWidget v-else-if="widget.type === 'octopusJog'" :widget="widget" :disabled="disabled" />
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
	<ConsoleInputWidget v-else-if="widget.type === 'consoleInput'" :widget="widget" :disabled="disabled" />
	<HeaterWidget v-else-if="widget.type === 'heater'" :widget="widget" :disabled="disabled" />
	<ClockWidget v-else-if="widget.type === 'clock'" :widget="widget" />
	<ThumbnailWidget v-else-if="widget.type === 'thumbnail'" :widget="widget" />
	<TableWidget v-else-if="widget.type === 'table'" :widget="widget" />
	<ExtruderWidget v-else-if="widget.type === 'extruder'" :widget="widget" :disabled="disabled" />
	<WcsWidget v-else-if="widget.type === 'wcs'" :widget="widget" :disabled="disabled" />
	<WcsTableWidget v-else-if="widget.type === 'wcsTable'" :widget="widget" :disabled="disabled" />
	<ProbeWidget v-else-if="widget.type === 'probe'" :widget="widget" :disabled="disabled" />
	<BedMeshWidget v-else-if="widget.type === 'bedMesh'" :widget="widget" :disabled="disabled" />
	<BedTramWidget v-else-if="widget.type === 'bedTram'" :widget="widget" :disabled="disabled" />
	<XyzProbeWidget v-else-if="widget.type === 'xyzProbe'" :widget="widget" :disabled="disabled" />
	<ProbeRoutinesWidget v-else-if="widget.type === 'probeRoutines'" :widget="widget" :disabled="disabled" />
	<SurfacingWidget v-else-if="widget.type === 'surfacing'" :widget="widget" :disabled="disabled" />
	<MachineHealthWidget v-else-if="widget.type === 'machineHealth'" :widget="widget" />
	<MaintenanceWidget v-else-if="widget.type === 'maintenanceWidget'" :widget="widget" />
	<PreflightWidget v-else-if="widget.type === 'preflight'" :widget="widget" />
	<ToolpathWidget v-else-if="widget.type === 'toolpath'" :widget="widget" />
	<FirmwareUpdateWidget v-else-if="widget.type === 'firmwareUpdate'" :widget="widget" />
	<ToolSelectWidget v-else-if="widget.type === 'toolSelect'" :widget="widget" :disabled="disabled" />
	<ToolAlignWidget v-else-if="widget.type === 'toolAlign'" :widget="widget" :disabled="disabled" />
	<FanWidget v-else-if="widget.type === 'fan'" :widget="widget" :disabled="disabled" />
	<FilesWidget v-else-if="widget.type === 'files'" :widget="widget" :disabled="disabled" />
	<GaugeClusterWidget v-else-if="widget.type === 'gaugeCluster'" :widget="widget" />
	<IndicatorsWidget v-else-if="widget.type === 'indicators'" :widget="widget" />
	<SparklineWidget v-else-if="widget.type === 'sparkline'" :widget="widget" />
	<NoteWidget v-else-if="widget.type === 'note'" :widget="widget" />
	<HotspotWidget v-else-if="widget.type === 'hotspot'" :widget="widget" :disabled="disabled" />
	<HttpWidget v-else-if="widget.type === 'http'" :widget="widget" />
	<EventLogWidget v-else-if="widget.type === 'eventLog'" :widget="widget" />
	<DroWidget v-else-if="widget.type === 'dro'" :widget="widget" />
	<SpindleWidget v-else-if="widget.type === 'spindle'" :widget="widget" :disabled="disabled" />
	<MessageBoxWidget v-else-if="widget.type === 'messageBox'" :widget="widget" />
	<ProfileSwitchWidget v-else-if="widget.type === 'profileSwitch'" :widget="widget" />
	<ThemeToggleWidget v-else-if="widget.type === 'themeToggle'" :widget="widget" />
	<CodeInputWidget v-else-if="widget.type === 'codeInput'" :widget="widget" />
	<EditModeToggleWidget v-else-if="widget.type === 'editModeToggle'" :widget="widget" />
	<UploadButtonWidget v-else-if="widget.type === 'uploadButton'" :widget="widget" />
	<AccessChipWidget v-else-if="widget.type === 'accessChip'" :widget="widget" />
	<GroupWidget v-else-if="widget.type === 'group'" :widget="widget" />
	<PluginPageWidget v-else-if="widget.type === 'pluginPage'" :widget="widget" />
	<EmbeddableWidget v-else-if="widget.type === 'embeddable'" :widget="widget" />
	<WebWidget v-else-if="widget.type === 'web'" :widget="widget" />
	<!-- Unknown/removed widget type from an older saved layout: show a placeholder, never crash. -->
	<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
		{{ $t("plugins.flexibleLayouts.widget.unknownWidget", { type: (widget as { type?: string }).type }) }}
	</v-alert>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, provide, watch } from "vue";

import type { Widget } from "../model/document";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import { acquireVerboseQueries, pathNeedsVerboseQueries, releaseVerboseQueries } from "../model/verboseFields";
import AlertWidget from "./AlertWidget.vue";
import BuiltInPanelWidget from "./BuiltInPanelWidget.vue";
import ChartWidget from "./ChartWidget.vue";
import ClockWidget from "./ClockWidget.vue";
import CommandButtonWidget from "./CommandButtonWidget.vue";
import ConsoleWidget from "./ConsoleWidget.vue";
import ConsoleInputWidget from "./ConsoleInputWidget.vue";
import DroWidget from "./DroWidget.vue";
import EmbeddableWidget from "./EmbeddableWidget.vue";
import EventLogWidget from "./EventLogWidget.vue";
import ExtruderWidget from "./ExtruderWidget.vue";
import FanWidget from "./FanWidget.vue";
import FilesWidget from "./FilesWidget.vue";
import GaugeClusterWidget from "./GaugeClusterWidget.vue";
import GlobalsWidget from "./GlobalsWidget.vue";
import GroupWidget from "./GroupWidget.vue";
import HeaterWidget from "./HeaterWidget.vue";
import HotspotWidget from "./HotspotWidget.vue";
import HttpWidget from "./HttpWidget.vue";
import IndicatorsWidget from "./IndicatorsWidget.vue";
import InputWidget from "./InputWidget.vue";
import JogWidget from "./JogWidget.vue";
import OctopusJogWidget from "./OctopusJogWidget.vue";
import LabelWidget from "./LabelWidget.vue";
import MacrosWidget from "./MacrosWidget.vue";
import MessageBoxWidget from "./MessageBoxWidget.vue";
import NeopixelWidget from "./NeopixelWidget.vue";
import NoteWidget from "./NoteWidget.vue";
import PluginPageWidget from "./PluginPageWidget.vue";
import ProfileSwitchWidget from "./ProfileSwitchWidget.vue";
import ProgressWidget from "./ProgressWidget.vue";
import SliderWidget from "./SliderWidget.vue";
import SparklineWidget from "./SparklineWidget.vue";
import SpindleWidget from "./SpindleWidget.vue";
import StatusWidget from "./StatusWidget.vue";
import StepperWidget from "./StepperWidget.vue";
import TableWidget from "./TableWidget.vue";
import ThemeToggleWidget from "./ThemeToggleWidget.vue";
import CodeInputWidget from "./CodeInputWidget.vue";
import EditModeToggleWidget from "./EditModeToggleWidget.vue";
import UploadButtonWidget from "./UploadButtonWidget.vue";
import AccessChipWidget from "./AccessChipWidget.vue";
import ThumbnailWidget from "./ThumbnailWidget.vue";
import ToggleWidget from "./ToggleWidget.vue";
import ToolAlignWidget from "./ToolAlignWidget.vue";
import ToolSelectWidget from "./ToolSelectWidget.vue";
import ValueWidget from "./ValueWidget.vue";
import WcsWidget from "./WcsWidget.vue";
import WcsTableWidget from "./WcsTableWidget.vue";
import ProbeWidget from "./ProbeWidget.vue";
import BedMeshWidget from "./BedMeshWidget.vue";
import BedTramWidget from "./BedTramWidget.vue";
import XyzProbeWidget from "./XyzProbeWidget.vue";
import ProbeRoutinesWidget from "./ProbeRoutinesWidget.vue";
import SurfacingWidget from "./SurfacingWidget.vue";
import MachineHealthWidget from "./MachineHealthWidget.vue";
import MaintenanceWidget from "./MaintenanceWidget.vue";
import PreflightWidget from "./PreflightWidget.vue";
import ToolpathWidget from "./ToolpathWidget.vue";
import FirmwareUpdateWidget from "./FirmwareUpdateWidget.vue";
import WebcamWidget from "./WebcamWidget.vue";
import WebWidget from "./WebWidget.vue";

// itemId is set only when this WidgetView renders ONE child of a group's free-position layout
// (GroupWidget.vue), which has no per-child provide() scope of its own (Vue's provide() can't
// differentiate v-for iterations - see util/widgetPatch.ts's doc comment). When set, this
// WidgetView instance becomes that child's own provide() boundary: it re-provides the patcher as
// an emit up to its parent (GroupWidget), which resolves it into "child <id>'s patch" and forwards
// that to the group's own ambient patcher. The normal top-level case (itemId unset) does nothing
// extra here - FlexGridItem.vue already provided a correctly-scoped patcher above this component.
const props = defineProps<{ widget: Widget; overrideColor?: string; disabled?: boolean; itemId?: string }>();
const emit = defineEmits<{ patchWidget: [id: string, patch: Record<string, unknown>] }>();
if (props.itemId !== undefined) {
	const itemId = props.itemId;
	provide(WIDGET_PATCH_KEY, (patch) => emit("patchWidget", itemId, patch));
}

// Not every Widget variant has an omPath (most don't), hence the duck-typed read - matches how
// ValueWidget.vue itself reads props.widget.omPath.
const omPath = computed(() => (props.widget as { omPath?: string }).omPath);
let holdingVerboseQueries = false;
watch(omPath, (path) => {
	const needed = pathNeedsVerboseQueries(path);
	if (needed && !holdingVerboseQueries) {
		acquireVerboseQueries();
		holdingVerboseQueries = true;
	} else if (!needed && holdingVerboseQueries) {
		releaseVerboseQueries();
		holdingVerboseQueries = false;
	}
}, { immediate: true });
onBeforeUnmount(() => {
	if (holdingVerboseQueries) {
		releaseVerboseQueries();
		holdingVerboseQueries = false;
	}
});
</script>
