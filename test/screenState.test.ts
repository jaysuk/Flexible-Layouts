import { flushPromises } from "@vue/test-utils";
import { mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessLockedFor, cancelPrompt, hashPassword, relock, setAccess, submitLogin } from "../src/model/access";
import { editMode } from "../src/model/editorState";
import { useLayoutStore } from "../src/model/store";
import {
	applyKioskQuery, enterFullscreen, enterKiosk, exitKiosk, fullscreenSupported, isFullscreen, keepAwakeActive,
	keepAwakeUnavailableReason, keepAwakeWanted, kioskActive, kioskExitNeedsPassword, resetScreenStateForTests, restoreKeepAwake,
	setKeepAwake, toggleFullscreen,
} from "../src/model/screenState";
import FullscreenWidget from "../src/widgets/FullscreenWidget.vue";

// An explicit, inspectable localStorage so per-device persistence is observable.
function fakeStorage() {
	const map = new Map<string, string>();
	return {
		map,
		impl: {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k),
		},
	};
}

let storage: ReturnType<typeof fakeStorage>;
const noAccess = { observerEnabled: false, operatorEnabled: false, adminHash: "", operatorHash: "" };
const locked = () => ({ observerEnabled: true, operatorEnabled: false, adminHash: hashPassword("secret"), operatorHash: "" });

beforeEach(() => {
	storage = fakeStorage();
	vi.stubGlobal("localStorage", storage.impl);
	relock();
	setAccess(noAccess);
	resetScreenStateForTests();
});
afterEach(() => {
	resetScreenStateForTests();
	vi.unstubAllGlobals();
	editMode.value = false;
	// Remove what the stubs put on the real document / navigator.
	for (const key of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"]) {
		delete (document as unknown as Record<string, unknown>)[key];
	}
	delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
	delete (navigator as unknown as Record<string, unknown>).wakeLock;
	relock();
	setAccess(noAccess);
});

function stubFullscreen() {
	const doc = document as unknown as Record<string, unknown>;
	doc.fullscreenEnabled = true;
	doc.fullscreenElement = null;
	(document.documentElement as unknown as Record<string, unknown>).requestFullscreen = vi.fn(async () => {
		doc.fullscreenElement = document.documentElement;
		document.dispatchEvent(new Event("fullscreenchange"));
	});
	doc.exitFullscreen = vi.fn(async () => {
		doc.fullscreenElement = null;
		document.dispatchEvent(new Event("fullscreenchange"));
	});
}

describe("fullscreen", () => {
	it("is unsupported where the browser has no element fullscreen (iPhone Safari), and enter refuses", async () => {
		expect(fullscreenSupported()).toBe(false);
		expect(await enterFullscreen()).toBe(false);
	});

	it("enters and leaves, and tracks changes the page did not start (Esc / F11)", async () => {
		stubFullscreen();
		expect(fullscreenSupported()).toBe(true);
		await toggleFullscreen();
		expect(isFullscreen.value).toBe(true);
		await toggleFullscreen();
		expect(isFullscreen.value).toBe(false);

		await enterFullscreen();
		(document as unknown as Record<string, unknown>).fullscreenElement = null; // user pressed Esc
		document.dispatchEvent(new Event("fullscreenchange"));
		expect(isFullscreen.value).toBe(false);
	});

	it("reports false when the browser refuses the request", async () => {
		stubFullscreen();
		(document.documentElement as unknown as Record<string, unknown>).requestFullscreen = vi.fn(async () => { throw new Error("denied"); });
		expect(await enterFullscreen()).toBe(false);
	});
});

describe("kiosk", () => {
	it("enters, is remembered on this device only, and drops edit mode", () => {
		editMode.value = true;
		enterKiosk();
		expect(kioskActive.value).toBe(true);
		expect(storage.map.get("flexibleLayouts.kiosk")).toBe("1");
		expect(editMode.value).toBe(false);
	});

	it("never touches the shared layout document", async () => {
		const before = JSON.stringify(useLayoutStore().document.value);
		enterKiosk();
		await setKeepAwake(true);
		expect(JSON.stringify(useLayoutStore().document.value)).toBe(before);
	});

	it("survives a reload (read back from storage)", () => {
		enterKiosk();
		resetScreenStateForTests();
		expect(kioskActive.value).toBe(true);
	});

	it("exits freely when no access lock is configured", async () => {
		enterKiosk();
		expect(kioskExitNeedsPassword()).toBe(false);
		expect(await exitKiosk()).toBe(true);
		expect(kioskActive.value).toBe(false);
		expect(storage.map.has("flexibleLayouts.kiosk")).toBe(false);
	});

	describe("with an access lock", () => {
		beforeEach(() => setAccess(locked()));

		it("asks for the Admin password to leave, and stays in kiosk when it is declined", async () => {
			enterKiosk();
			expect(kioskExitNeedsPassword()).toBe(true);
			const pending = exitKiosk();
			await nextTick();
			submitLogin("admin", "wrong");
			cancelPrompt();
			expect(await pending).toBe(false);
			expect(kioskActive.value).toBe(true);
			expect(storage.map.get("flexibleLayouts.kiosk")).toBe("1");
		});

		it("leaves once the right password is given", async () => {
			enterKiosk();
			const pending = exitKiosk();
			await nextTick();
			submitLogin("admin", "secret");
			expect(await pending).toBe(true);
			expect(kioskActive.value).toBe(false);
		});

		it("an Admin session leaves without being asked again", async () => {
			enterKiosk();
			const first = exitKiosk();
			await nextTick();
			submitLogin("admin", "secret");
			await first; // now Admin for this session
			enterKiosk();
			expect(kioskExitNeedsPassword()).toBe(false);
			expect(await exitKiosk()).toBe(true);
		});
	});
});

describe("?kiosk= query", () => {
	it("?kiosk=1 enters, ?kiosk=0 leaves, anything else does nothing", async () => {
		expect(applyKioskQuery("http://duet.local/?kiosk=1")).toBe("enter");
		expect(kioskActive.value).toBe(true);
		expect(applyKioskQuery("http://duet.local/#/Dashboard")).toBeNull();
		expect(kioskActive.value).toBe(true);
		expect(applyKioskQuery("http://duet.local/?kiosk=0")).toBe("exit");
		await flushPromises();
		expect(kioskActive.value).toBe(false);
	});

	it("also reads a query inside the hash", () => {
		expect(applyKioskQuery("http://duet.local/#/Dashboard?kiosk=1")).toBe("enter");
		expect(kioskActive.value).toBe(true);
	});

	it("?kiosk=0 goes through the same password gate", async () => {
		setAccess(locked());
		enterKiosk();
		applyKioskQuery("http://duet.local/?kiosk=0");
		await nextTick();
		expect(kioskActive.value).toBe(true); // waiting on the password
		cancelPrompt();
		await flushPromises();
		expect(kioskActive.value).toBe(true);
	});

	it("survives a malformed address", () => {
		expect(applyKioskQuery("not a url")).toBeNull();
	});
});

describe("keep screen awake", () => {
	function stubWakeLock() {
		const releasers: Array<() => void> = [];
		const request = vi.fn(async () => {
			let onRelease: () => void = () => {};
			const sentinel = {
				release: vi.fn(async () => { onRelease(); }),
				addEventListener: (_: string, cb: () => void) => { onRelease = cb; releasers.push(cb); },
			};
			return sentinel;
		});
		(navigator as unknown as Record<string, unknown>).wakeLock = { request };
		return { request, releasers };
	}

	it("says why it is unavailable: plain http, or no support", () => {
		vi.stubGlobal("isSecureContext", false);
		expect(keepAwakeUnavailableReason()).toBe("insecure");
		vi.stubGlobal("isSecureContext", true);
		expect(keepAwakeUnavailableReason()).toBe("unsupported");
		stubWakeLock();
		expect(keepAwakeUnavailableReason()).toBeNull();
	});

	it("refuses to turn on over plain http", async () => {
		vi.stubGlobal("isSecureContext", false);
		expect(await setKeepAwake(true)).toBe(false);
		expect(keepAwakeWanted.value).toBe(false);
	});

	it("takes a lock, remembers the choice per device, and releases on off", async () => {
		vi.stubGlobal("isSecureContext", true);
		const { request } = stubWakeLock();
		expect(await setKeepAwake(true)).toBe(true);
		expect(request).toHaveBeenCalledWith("screen");
		expect(keepAwakeActive.value).toBe(true);
		expect(storage.map.get("flexibleLayouts.keepAwake")).toBe("1");

		await setKeepAwake(false);
		expect(keepAwakeActive.value).toBe(false);
		expect(storage.map.has("flexibleLayouts.keepAwake")).toBe(false);
	});

	it("re-acquires after the browser drops the lock when the tab is hidden", async () => {
		vi.stubGlobal("isSecureContext", true);
		const { request, releasers } = stubWakeLock();
		await setKeepAwake(true);
		expect(request).toHaveBeenCalledTimes(1);

		releasers[0](); // the browser released it (tab hidden)
		expect(keepAwakeActive.value).toBe(false);
		Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		await flushPromises();
		expect(request).toHaveBeenCalledTimes(2);
		expect(keepAwakeActive.value).toBe(true);
	});

	it("does not re-acquire once turned off", async () => {
		vi.stubGlobal("isSecureContext", true);
		const { request } = stubWakeLock();
		await setKeepAwake(true);
		await setKeepAwake(false);
		document.dispatchEvent(new Event("visibilitychange"));
		await flushPromises();
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("restores a remembered choice at startup", async () => {
		vi.stubGlobal("isSecureContext", true);
		const { request } = stubWakeLock();
		storage.map.set("flexibleLayouts.keepAwake", "1");
		resetScreenStateForTests();
		restoreKeepAwake();
		await flushPromises();
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("survives the browser refusing the lock", async () => {
		vi.stubGlobal("isSecureContext", true);
		(navigator as unknown as Record<string, unknown>).wakeLock = { request: vi.fn(async () => { throw new Error("NotAllowedError"); }) };
		expect(await setKeepAwake(true)).toBe(false);
		expect(keepAwakeActive.value).toBe(false);
	});
});

describe("FullscreenWidget", () => {
	const widget = (extra: Record<string, unknown> = {}) => ({ type: "fullscreen" as const, ...extra });

	it("hides the fullscreen button where unsupported, and explains why keep-awake is disabled over http", () => {
		vi.stubGlobal("isSecureContext", false);
		const w = mountInDwc(FullscreenWidget, { props: { widget: widget() } });
		expect(w.findAll(".fs-btn")).toHaveLength(2); // kiosk + keep-awake, no fullscreen
		expect(w.find(".fs-kiosk").exists()).toBe(true);
		expect(w.find(".fs-awake-btn").attributes("disabled")).toBeDefined();
		expect(w.find(".fs-awake-why").text()).toContain("awakeUnavailable.insecure");
	});

	it("shows the fullscreen button once the browser supports it", () => {
		stubFullscreen();
		const w = mountInDwc(FullscreenWidget, { props: { widget: widget() } });
		expect(w.findAll(".fs-btn")).toHaveLength(3);
	});

	it("each control can be switched off", () => {
		stubFullscreen();
		vi.stubGlobal("isSecureContext", true);
		const w = mountInDwc(FullscreenWidget, { props: { widget: widget({ showFullscreen: false, showKeepAwake: false }) } });
		expect(w.findAll(".fs-btn")).toHaveLength(1);
		expect(w.find(".fs-kiosk").exists()).toBe(true);
	});

	it("the kiosk button enters kiosk and (where supported) fullscreen, and leaves both again", async () => {
		stubFullscreen();
		const w = mountInDwc(FullscreenWidget, { props: { widget: widget({ showKeepAwake: false }) } });
		await w.find(".fs-kiosk").trigger("click");
		await flushPromises();
		expect(kioskActive.value).toBe(true);
		expect(isFullscreen.value).toBe(true);

		await w.find(".fs-kiosk").trigger("click");
		await flushPromises();
		expect(kioskActive.value).toBe(false);
		expect(isFullscreen.value).toBe(false);
	});

	it("kioskFullscreen: false enters kiosk without going fullscreen", async () => {
		stubFullscreen();
		const w = mountInDwc(FullscreenWidget, { props: { widget: widget({ kioskFullscreen: false, showKeepAwake: false }) } });
		await w.find(".fs-kiosk").trigger("click");
		await flushPromises();
		expect(kioskActive.value).toBe(true);
		expect(isFullscreen.value).toBe(false);
	});

	it("stays in kiosk (and fullscreen) when the exit password is declined", async () => {
		stubFullscreen();
		setAccess(locked());
		const w = mountInDwc(FullscreenWidget, { props: { widget: widget({ showKeepAwake: false }) } });
		await w.find(".fs-kiosk").trigger("click");
		await flushPromises();
		expect(isFullscreen.value).toBe(true);

		await w.find(".fs-kiosk").trigger("click");
		await nextTick();
		cancelPrompt();
		await flushPromises();
		expect(kioskActive.value).toBe(true);
		expect(isFullscreen.value).toBe(true);
	});

	it("is not access-locked (it sends nothing), so an Observer wall display can use it", () => {
		setAccess(locked());
		expect(accessLockedFor({ type: "fullscreen" })).toBe(false);
		expect(accessLockedFor({ type: "codeButton" })).toBe(true);
	});
});
