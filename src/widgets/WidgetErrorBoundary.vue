<template>
  <slot v-if="!error" />
  <slot v-else name="error" :message="message" :reset="reset" />
</template>

<script setup lang="ts">
import { onErrorCaptured, ref, watch } from "vue";

// Contains a render/lifecycle error thrown by ONE widget so it can't take down the whole page.
// `resetKey` clears the error when it changes (e.g. after the widget's config is edited) so a
// fixable widget retries automatically.
const props = defineProps<{ resetKey?: unknown }>();

const error = ref(false);
const message = ref("");

watch(() => props.resetKey, () => { error.value = false; message.value = ""; });

onErrorCaptured((err) => {
  error.value = true;
  message.value = (err as Error)?.message ?? String(err);
  console.error("[FlexibleLayouts] widget error:", err);
  return false; // handled — stop propagation to the page
});

function reset(): void { error.value = false; message.value = ""; }
</script>
