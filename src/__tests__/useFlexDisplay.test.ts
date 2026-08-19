import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";

import { useFlexDisplay } from "../composables/useFlexDisplay";

// useMediaQuery (the fallback path) calls onMounted/onUnmounted, so useFlexDisplay() must run inside
// an actual component setup() - a minimal wrapper component is the standard way to test a composable
// that uses lifecycle hooks.
function mountFlexDisplay() {
	let result!: ReturnType<typeof useFlexDisplay>;
	const wrapper = mount(defineComponent({
		setup() {
			result = useFlexDisplay();
			return {};
		},
		template: "<div />",
	}));
	return { wrapper, result };
}

// The test environment has no window.DWC at all (that's DWC's own real browser global, not
// something the test harness sets up) - this is a NEW test-only global, clean it up after every test
// so it can never leak into an unrelated test elsewhere in the suite.
afterEach(() => {
	delete (window as unknown as { DWC?: unknown }).DWC;
});

describe("useFlexDisplay - falls back to matchMedia when window.DWC.Vuetify isn't available", () => {
	it("returns smAndUp/mdAndUp/lgAndUp as reactive booleans", () => {
		const { result } = mountFlexDisplay();
		expect(typeof result.smAndUp.value).toBe("boolean");
		expect(typeof result.mdAndUp.value).toBe("boolean");
		expect(typeof result.lgAndUp.value).toBe("boolean");
	});
});

describe("useFlexDisplay - delegates to window.DWC.Vuetify.useDisplay when present (DWC 3.7.0-beta.3+)", () => {
	it("returns the SAME ref objects useDisplay() provided - not copies, not the matchMedia fallback", () => {
		const smAndUp = ref(true);
		const mdAndUp = ref(false);
		const lgAndUp = ref(false);
		(window as unknown as { DWC: unknown }).DWC = { Vuetify: { useDisplay: () => ({ smAndUp, mdAndUp, lgAndUp }) } };

		const { result } = mountFlexDisplay();
		expect(result.smAndUp).toBe(smAndUp);
		expect(result.mdAndUp).toBe(mdAndUp);
		expect(result.lgAndUp).toBe(lgAndUp);
	});

	it("falls back to the matchMedia implementation when window.DWC.Vuetify.useDisplay isn't actually a function", () => {
		(window as unknown as { DWC: unknown }).DWC = { Vuetify: {} };
		const { result } = mountFlexDisplay();
		expect(typeof result.smAndUp.value).toBe("boolean");
	});

	it("falls back when window.DWC exists but has no Vuetify property at all (any DWC before 3.7.0-beta.3)", () => {
		(window as unknown as { DWC: unknown }).DWC = {};
		const { result } = mountFlexDisplay();
		expect(typeof result.smAndUp.value).toBe("boolean");
	});
});
