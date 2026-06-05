<template>
	<!-- The stock dashboard content. Rendered as a literal tag (not resolveComponent) so it resolves
		 in both load paths - auto-imported in dev, resolved against the global registry in the ZIP.
		 FlexPage shows this whenever the Dashboard page has no custom layout and we're not editing,
		 so activating the custom shell leaves the familiar dashboard intact until the user customises. -->
	<DashboardContent />
</template>

<script setup lang="ts">
</script>
