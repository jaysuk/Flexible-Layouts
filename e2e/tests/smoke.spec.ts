import { expect, test } from "@playwright/test";

const MOCK = "http://localhost:8080";

// E2E smoke for FlexibleLayouts running inside a real DWC (BASE_URL) connected to the mock Duet.
// The first test is plugin-agnostic and runs as soon as DWC is served; the rest are FlexibleLayouts
// flows — adjust selectors to your DWC build, then unskip. See e2e/README.md.

test("DWC loads with FlexibleLayouts installed and no console errors", async ({ page }) => {
	const errors: Array<string> = [];
	page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
	page.on("pageerror", (e) => errors.push(String(e)));

	await page.goto("/");
	await page.waitForLoadState("networkidle");

	await expect(page.locator(".v-application")).toBeVisible();
	expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
	await expect(page).toHaveScreenshot("dwc-loaded.png", { maxDiffPixelRatio: 0.02 });
});

// FlexibleLayouts registers a Settings tab — a cheap proof the plugin loaded and registered.
test.skip("the Flexible Layouts settings tab is registered", async ({ page }) => {
	await page.goto("/#/Settings");
	await page.waitForLoadState("networkidle");
	await expect(page.getByText("Flexible Layouts")).toBeVisible();
});

// End-to-end G-code: activate the custom layout, add a Jog widget, home — assert G28 reached the board
// via the mock's /__sent. TODO: fill in the add-widget + click selectors for your DWC build.
test.skip("a homed Jog widget sends G28 to the board", async ({ page, request }) => {
	await request.delete(`${MOCK}/__sent`);

	await page.goto("/");
	await page.waitForLoadState("networkidle");

	// TODO: activate Flexible Layouts (/BuiltInLayout toggle or Settings → Flexible Layouts),
	// add a Jog widget, then click its home control:
	// await page.getByRole("button", { name: "Home all" }).click();

	const { sent } = await (await request.get(`${MOCK}/__sent`)).json();
	expect(sent).toContain("G28");
});
