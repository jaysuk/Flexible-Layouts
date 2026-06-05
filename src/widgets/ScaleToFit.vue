<template>
	<div ref="container" class="flex-fit-container">
		<div ref="content" class="flex-fit-content" :style="contentStyle">
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

// Uniformly scales its slotted content DOWN (never up) so it fits the available box without inner
// scrollbars - the fix for cramped panels showing their own scrollbars/sliders. Because CSS
// transforms don't affect layout, the content's scrollWidth/Height stay at the natural size
// regardless of the applied scale, so re-measuring can't feed back into a loop.
const container = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const scale = ref(1);

let ro: ResizeObserver | null = null;

function recompute() {
	const c = container.value;
	const k = content.value;
	if (!c || !k) {
		return;
	}
	const naturalW = k.scrollWidth;
	const naturalH = k.scrollHeight;
	const availW = c.clientWidth;
	const availH = c.clientHeight;
	if (naturalW <= 0 || naturalH <= 0 || availW <= 0 || availH <= 0) {
		return;
	}
	const next = Math.min(availW / naturalW, availH / naturalH, 1);
	// Only commit meaningful changes to avoid churn.
	if (Math.abs(next - scale.value) > 0.005) {
		scale.value = next;
	}
}

const contentStyle = computed(() => ({
	transform: `scale(${scale.value})`,
	transformOrigin: "top center",
	width: "100%",
}));

onMounted(() => {
	recompute();
	ro = new ResizeObserver(() => recompute());
	if (container.value) ro.observe(container.value);
	if (content.value) ro.observe(content.value);
});

onBeforeUnmount(() => {
	ro?.disconnect();
	ro = null;
});
</script>

<style scoped>
.flex-fit-container {
	width: 100%;
	height: 100%;
	overflow: hidden;
}
.flex-fit-content {
	width: 100%;
}
</style>
