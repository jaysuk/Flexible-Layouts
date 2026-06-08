/**
 * Mock Duet REST server for FlexibleLayouts E2E — a thin CLI wrapper around the kit's tested
 * `createMockDuet` (dwc-plugin-test-kit/mock-duet). Started by playwright.config's `webServer`.
 *
 *   node mock-duet/server.mjs            # listens on :8080
 *   MOCK_PORT=9000 node mock-duet/server.mjs
 */
import { createMockDuet, DEFAULT_MOCK_MODEL } from "dwc-plugin-test-kit/mock-duet";

const port = Number(process.env.MOCK_PORT ?? 8080);

// Homed axes so the Jog widget's controls are enabled and movement G-code can be asserted.
const model = {
	...DEFAULT_MOCK_MODEL,
	move: {
		...DEFAULT_MOCK_MODEL.move,
		axes: DEFAULT_MOCK_MODEL.move.axes.map((a) => ({ ...a, homed: true })),
	},
};

createMockDuet({ port, model }).then((d) => console.log(`mock-duet listening on ${d.url}`));
