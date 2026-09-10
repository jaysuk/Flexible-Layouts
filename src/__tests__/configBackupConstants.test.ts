import { describe, expect, it } from "vitest";

import { CLOUD_SOURCE_IDS, DESTINATION_IDS } from "../model/configBackup/constants";

describe("config backup destination / source ordering", () => {
	// Regression: the Restore tab's source picker had "drive" appended to the end of a hand-maintained
	// list, so it read local/duet/github/dropbox/webdav/drive while the Create tab read
	// local/duet/github/drive/dropbox/webdav - the two pickers showed the services in different orders.
	// CLOUD_SOURCE_IDS is now derived from DESTINATION_IDS so they can't drift again.
	it("the Restore source order matches the Create destination order, minus 'local'", () => {
		expect(CLOUD_SOURCE_IDS).toEqual(DESTINATION_IDS.filter((id) => id !== "local"));
	});

	it("CLOUD_SOURCE_IDS never contains 'local' (Restore handles a local zip as its own option)", () => {
		expect(CLOUD_SOURCE_IDS).not.toContain("local");
	});
});
