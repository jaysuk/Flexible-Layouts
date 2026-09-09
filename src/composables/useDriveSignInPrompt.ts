/**
 * The Google Drive device-flow sign-in prompt's shared state - a module-level reactive singleton,
 * mirroring DWC's own `useConfirmDialog.ts` pattern (a plain `reactive` object any code can push into,
 * consumed by a single always-mounted dialog component - see GoogleDriveSignInDialog.vue). Needed
 * because `runBackup.ts`'s `signInWithDeviceFlow()` is a plain async function, not a component, so it
 * has no dialog of its own to show - it just updates this singleton and the mounted dialog reflects it.
 *
 * Fixes a real reported bug: the original implementation surfaced the device code via `uiStore.log()` -
 * DWC's toast notification, which auto-dismisses. A user who read the code, switched to another tab to
 * enter it at Google's verification page, and came back to Flexible Layouts found the toast already
 * gone (only recoverable via DWC's Console page history). The code needs to stay on screen for exactly
 * as long as the user needs it, which a toast's timeout can never guarantee - hence a real, `persistent`
 * `v-dialog` (no backdrop-click/escape dismiss) that closes ONLY when the user clicks the button in it,
 * never on a timer.
 */
import { reactive } from "vue";

export type DriveSignInStatus = "waiting" | "authorized" | "denied" | "expired" | "error";

interface DriveSignInPromptState {
	open: boolean;
	userCode: string;
	verificationUrl: string;
	status: DriveSignInStatus;
	/** Only meaningful for status "error" - the specific message from pollDeviceToken. */
	message: string;
}

const state = reactive<DriveSignInPromptState>({
	open: false, userCode: "", verificationUrl: "", status: "waiting", message: "",
});

/** Opens the prompt with a fresh code. Always starts at "waiting" - callers update the status as the
 *  poll loop progresses via `updateDriveSignInStatus`, they never re-open. */
export function openDriveSignInPrompt(userCode: string, verificationUrl: string): void {
	state.open = true;
	state.userCode = userCode;
	state.verificationUrl = verificationUrl;
	state.status = "waiting";
	state.message = "";
}

/** Updates the SAME open dialog instance live as sign-in progresses, rather than replacing it - so a
 *  prompt the user is already looking at reflects the real outcome instead of going stale. Safe to call
 *  even if the user already dismissed it (closeDriveSignInPrompt) - it just updates state nothing is
 *  currently rendering; sign-in itself keeps polling regardless of the dialog's visibility (§ below). */
export function updateDriveSignInStatus(status: DriveSignInStatus, message = ""): void {
	state.status = status;
	state.message = message;
}

/** The ONLY way the dialog closes - called exclusively from the user clicking the button in
 *  GoogleDriveSignInDialog.vue. Deliberately dismiss-only, not cancel: clicking it while still
 *  "waiting" just hides the reminder (the user may have already authorized in the other tab) - the
 *  poll loop in runBackup.ts keeps running independently of whether this dialog is open, exactly like
 *  the old inline flow's blocking `await` did. */
export function closeDriveSignInPrompt(): void {
	state.open = false;
}

export function useDriveSignInPromptState(): DriveSignInPromptState {
	return state;
}

/** Test-only: resets the module-level singleton between tests, same convention as this repo's other
 *  resettable singletons (e.g. maintenance/historySettings.ts's own resetForTests). */
export function resetForTests(): void {
	state.open = false;
	state.userCode = "";
	state.verificationUrl = "";
	state.status = "waiting";
	state.message = "";
}
