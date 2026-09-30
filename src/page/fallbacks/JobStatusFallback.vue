<template>
	<!-- Stock Job > Status page content. Literal tags (not resolveComponent), like DashboardFallback, so
		 they resolve in both load paths. The layout is DWC's own: control/babystep/info on the left,
		 preview + times in the middle, factors + fans on the right; one column on phones. -->
	<div class="fb-job fill-height overflow-y-auto">
		<JobProgress class="px-3 pt-1" />
		<v-row class="mt-0 px-1" :density="mobile ? 'compact' : 'default'">
			<v-col cols="12" md="3" xl="2" class="order-md-1">
				<v-row class="align-content-start" :density="mobile ? 'compact' : 'default'">
					<v-col cols="12"><JobControlPanel /></v-col>
					<v-col cols="12"><BabystepPanel /></v-col>
					<v-col cols="12"><JobInfoPanel /></v-col>
				</v-row>
			</v-col>
			<v-col cols="12" md="5" xl="7" class="d-flex flex-column order-md-2">
				<JobViewPanel v-if="machineStore.model.job.file !== null || !machineStore.isConnected"
							  class="mb-2 mb-lg-6 fb-job-view" />
				<v-row class="flex-grow-0 flex-shrink-0" :density="mobile ? 'compact' : 'default'">
					<v-col cols="12"><JobTimesPanel /></v-col>
				</v-row>
			</v-col>
			<v-col cols="12" md="4" xl="3" class="order-md-3">
				<v-row class="align-content-start" :density="mobile ? 'compact' : 'default'">
					<v-col cols="12"><SpeedFactorPanel /></v-col>
					<v-col cols="12"><FansPanel /></v-col>
					<v-col v-if="uiStore.isFFF" cols="12"><ExtrusionFactorsPanel /></v-col>
				</v-row>
			</v-col>
		</v-row>
	</div>
</template>

<script setup lang="ts">
import { useDisplay } from "vuetify";

import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

const { mobile } = useDisplay();
const machineStore = useMachineStore();
const uiStore = useUiStore();
</script>

<style scoped>
.fb-job { min-height: 0; }
.fb-job-view { min-height: 320px; }
</style>
