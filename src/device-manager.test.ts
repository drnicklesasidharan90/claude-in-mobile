import { describe, expect, it, vi } from "vitest";
import { DeviceManager, type Device, type Platform } from "./device-manager.js";
import type {
  CorePlatformAdapter,
  AppManagementAdapter,
  PermissionAdapter,
  ShellAdapter,
  SyncScreenshotAdapter,
} from "./adapters/platform-adapter.js";

// A minimal in-memory adapter that records calls. We compose capability mixins
// onto it via factory options so tests can verify the type-guarded paths.
type FakeAdapterOptions = {
  platform: Platform;
  devices?: Device[];
  selectedDeviceId?: string;
  autoDetect?: Device;
  capabilities?: ("app" | "permissions" | "shell" | "syncScreenshot")[];
  listDevicesError?: Error;
};

function makeAdapter(opts: FakeAdapterOptions) {
  const base: CorePlatformAdapter = {
    platform: opts.platform,
    listDevices: vi.fn(() => {
      if (opts.listDevicesError) throw opts.listDevicesError;
      return opts.devices ?? [];
    }),
    selectDevice: vi.fn((id: string) => {
      opts.selectedDeviceId = id;
    }),
    getSelectedDeviceId: vi.fn(() => opts.selectedDeviceId),
    autoDetectDevice: vi.fn(() => opts.autoDetect),
    tap: vi.fn(async () => {}),
    doubleTap: vi.fn(async () => {}),
    longPress: vi.fn(async () => {}),
    swipe: vi.fn(async () => {}),
    swipeDirection: vi.fn(async () => {}),
    inputText: vi.fn(async () => {}),
    pressKey: vi.fn(async () => {}),
    screenshotAsync: vi.fn(async () => ({ data: "AAAA", mimeType: "image/png" })),
    getScreenshotBufferAsync: vi.fn(async () => Buffer.from("img")),
    getUiHierarchy: vi.fn(async () => "<hierarchy/>"),
    getSystemInfo: vi.fn(async () => "info"),
  };

  const caps = new Set(opts.capabilities ?? []);
  if (caps.has("app")) {
    Object.assign(base, {
      launchApp: vi.fn((id: string) => `launched ${id}`),
      stopApp: vi.fn(),
      installApp: vi.fn((p: string) => `installed ${p}`),
    } satisfies AppManagementAdapter);
  }
  if (caps.has("permissions")) {
    Object.assign(base, {
      grantPermission: vi.fn((pkg: string, perm: string) => `granted ${perm} to ${pkg}`),
      revokePermission: vi.fn((pkg: string, perm: string) => `revoked ${perm} from ${pkg}`),
      resetPermissions: vi.fn((pkg: string) => `reset ${pkg}`),
    } satisfies PermissionAdapter);
  }
  if (caps.has("shell")) {
    Object.assign(base, {
      shell: vi.fn((c: string) => `out: ${c}`),
      getLogs: vi.fn(() => "log line"),
      clearLogs: vi.fn(() => "cleared"),
    } satisfies ShellAdapter);
  }
  if (caps.has("syncScreenshot")) {
    Object.assign(base, {
      screenshotRaw: vi.fn(() => "rawpng"),
    } satisfies SyncScreenshotAdapter);
  }

  return base;
}

function makeDM(adapters: Partial<Record<Platform, CorePlatformAdapter>>, activeTarget?: Platform) {
  const map = new Map<Platform, CorePlatformAdapter>();
  for (const [p, a] of Object.entries(adapters)) {
    if (a) map.set(p as Platform, a);
  }
  return new DeviceManager({ adapters: map, activeTarget });
}

const ANDROID_DEVICE: Device = {
  id: "emu-5554",
  name: "Pixel 7",
  platform: "android",
  state: "device",
  isSimulator: false,
};

const IOS_DEVICE: Device = {
  id: "ios-1",
  name: "iPhone 15",
  platform: "ios",
  state: "booted",
  isSimulator: true,
};

describe("getAdapter (auto-detect on missing selection)", () => {
  it("returns the active-target adapter when no platform arg is passed", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "x" });
    const ios = makeAdapter({ platform: "ios", selectedDeviceId: "y" });
    const dm = makeDM({ android, ios }, "ios");

    await dm.tap(10, 20);

    expect(ios.tap).toHaveBeenCalledWith(10, 20, undefined);
    expect(android.tap).not.toHaveBeenCalled();
  });

  it("auto-detects a device when none is selected and propagates to adapter", async () => {
    const android = makeAdapter({
      platform: "android",
      selectedDeviceId: undefined,
      autoDetect: ANDROID_DEVICE,
    });
    const dm = makeDM({ android }, "android");

    await dm.tap(1, 2);

    expect(android.autoDetectDevice).toHaveBeenCalled();
    expect(android.selectDevice).toHaveBeenCalledWith("emu-5554");
    expect(dm.getActiveDevice()).toEqual(ANDROID_DEVICE);
  });

  it("does not auto-detect for desktop or browser even without a selected device", async () => {
    const desktop = makeAdapter({ platform: "desktop", selectedDeviceId: undefined });
    const browser = makeAdapter({ platform: "browser", selectedDeviceId: undefined });
    const dm = makeDM({ desktop, browser }, "desktop");

    await dm.tap(0, 0);
    await dm.tap(0, 0, "browser");

    expect(desktop.autoDetectDevice).not.toHaveBeenCalled();
    expect(browser.autoDetectDevice).not.toHaveBeenCalled();
  });

  it("throws 'Unknown platform' for a platform with no registered adapter", async () => {
    const dm = makeDM({}, "android");
    await expect(dm.tap(0, 0, "ios")).rejects.toThrow(/Unknown platform: ios/);
  });

  it("skips auto-detect when a device is already selected", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "already-here" });
    const dm = makeDM({ android }, "android");

    await dm.tap(0, 0);

    expect(android.autoDetectDevice).not.toHaveBeenCalled();
    expect(android.selectDevice).not.toHaveBeenCalled();
  });
});

describe("target management", () => {
  it("setTarget changes the active target", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "a" });
    const ios = makeAdapter({ platform: "ios", selectedDeviceId: "i" });
    const dm = makeDM({ android, ios }, "android");

    dm.setTarget("ios");
    await dm.tap(5, 5);

    expect(ios.tap).toHaveBeenCalled();
    expect(android.tap).not.toHaveBeenCalled();
    expect(dm.getCurrentPlatform()).toBe("ios");
  });

  it("getTarget returns the device state when a device is active", () => {
    const android = makeAdapter({ platform: "android", devices: [ANDROID_DEVICE] });
    const dm = makeDM({ android }, "android");

    dm.setDevice("emu-5554");
    expect(dm.getTarget()).toEqual({ target: "android", status: "device" });
  });

  it("getTarget reports 'no device' when nothing is selected", () => {
    const android = makeAdapter({ platform: "android" });
    const dm = makeDM({ android }, "android");

    expect(dm.getTarget()).toEqual({ target: "android", status: "no device" });
  });

  it("getTarget reports 'desktop not available' when no desktop adapter present", () => {
    const dm = makeDM({}, "desktop");
    expect(dm.getTarget()).toEqual({ target: "desktop", status: "not available" });
  });
});

describe("setDevice", () => {
  it("selects a device by id and propagates to the platform adapter", () => {
    const android = makeAdapter({ platform: "android", devices: [ANDROID_DEVICE] });
    const dm = makeDM({ android });

    const selected = dm.setDevice("emu-5554");

    expect(selected).toEqual(ANDROID_DEVICE);
    expect(android.selectDevice).toHaveBeenCalledWith("emu-5554");
    expect(dm.getCurrentPlatform()).toBe("android");
    expect(dm.getActiveDevice()).toEqual(ANDROID_DEVICE);
  });

  it("falls back to any booted device on the requested platform when the id is unknown", () => {
    const android = makeAdapter({ platform: "android", devices: [ANDROID_DEVICE] });
    const ios = makeAdapter({ platform: "ios", devices: [IOS_DEVICE] });
    const dm = makeDM({ android, ios });

    const selected = dm.setDevice("nonexistent-id", "ios");

    expect(selected).toEqual(IOS_DEVICE);
    expect(ios.selectDevice).toHaveBeenCalledWith("ios-1");
  });

  it("throws 'Device not found' when nothing matches and no adapter errored", () => {
    const android = makeAdapter({ platform: "android", devices: [] });
    const dm = makeDM({ android });

    expect(() => dm.setDevice("ghost")).toThrow(/Device not found: ghost/);
  });

  it("surfaces a structural adapter error (e.g. ADB_NOT_INSTALLED) instead of 'Device not found'", () => {
    const adbErr = new Error("adb is not installed");
    const android = makeAdapter({ platform: "android", listDevicesError: adbErr });
    const dm = makeDM({ android });

    expect(() => dm.setDevice("emu-5554")).toThrow(/adb is not installed/);
  });

  it("rejects desktop selection when desktop is not running", () => {
    const dm = makeDM({}, "android");
    expect(() => dm.setDevice("desktop")).toThrow(/Desktop app is not running/);
  });
});

describe("getAllDevicesWithErrors", () => {
  it("aggregates devices from every adapter", () => {
    const android = makeAdapter({ platform: "android", devices: [ANDROID_DEVICE] });
    const ios = makeAdapter({ platform: "ios", devices: [IOS_DEVICE] });
    const dm = makeDM({ android, ios });

    const { devices, errors } = dm.getAllDevicesWithErrors();

    expect(devices).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });

  it("captures per-platform errors without dropping devices from healthy adapters", () => {
    const android = makeAdapter({
      platform: "android",
      listDevicesError: new Error("adb fail"),
    });
    const ios = makeAdapter({ platform: "ios", devices: [IOS_DEVICE] });
    const dm = makeDM({ android, ios });

    const { devices, errors } = dm.getAllDevicesWithErrors();

    expect(devices).toEqual([IOS_DEVICE]);
    expect(errors).toHaveLength(1);
    expect(errors[0].platform).toBe("android");
    expect(errors[0].error.message).toBe("adb fail");
  });

  it("wraps non-Error throwables in an Error", () => {
    const android = makeAdapter({ platform: "android" });
    (android.listDevices as any).mockImplementation(() => {
      throw "string-error";
    });
    const dm = makeDM({ android });

    const { errors } = dm.getAllDevicesWithErrors();

    expect(errors[0].error).toBeInstanceOf(Error);
    expect(errors[0].error.message).toBe("string-error");
  });

  it("getDevices(platform) returns only that platform's devices and empty array when missing", () => {
    const android = makeAdapter({ platform: "android", devices: [ANDROID_DEVICE] });
    const dm = makeDM({ android });

    expect(dm.getDevices("android")).toEqual([ANDROID_DEVICE]);
    expect(dm.getDevices("ios")).toEqual([]);
  });
});

describe("capability type-guard errors", () => {
  it("launchApp throws when the adapter has no AppManagement capability", async () => {
    const browser = makeAdapter({ platform: "browser", selectedDeviceId: "b" });
    const dm = makeDM({ browser }, "browser");

    await expect(dm.launchApp("com.example")).rejects.toThrow(/not supported for browser/);
    // browser-specific recovery hint should be present
    await expect(dm.launchApp("com.example")).rejects.toThrow(/browser_open/);
  });

  it("launchApp succeeds when the adapter has AppManagement capability", async () => {
    const android = makeAdapter({
      platform: "android",
      selectedDeviceId: "a",
      capabilities: ["app"],
    });
    const dm = makeDM({ android }, "android");

    const out = await dm.launchApp("com.example");

    expect(out).toBe("launched com.example");
  });

  it("grantPermission throws for adapters without PermissionAdapter capability", () => {
    const desktop = makeAdapter({ platform: "desktop" });
    const dm = makeDM({ desktop }, "desktop");

    expect(() => dm.grantPermission("app", "camera")).toThrow(/not supported for desktop/);
  });

  it("shell throws for adapters without ShellAdapter capability", () => {
    const ios = makeAdapter({ platform: "ios", selectedDeviceId: "i" });
    const dm = makeDM({ ios }, "ios");

    expect(() => dm.shell("ls")).toThrow(/Shell is not supported for ios/);
  });

  it("shell delegates when capability is present", () => {
    const android = makeAdapter({
      platform: "android",
      selectedDeviceId: "a",
      capabilities: ["shell"],
    });
    const dm = makeDM({ android }, "android");

    expect(dm.shell("pwd")).toBe("out: pwd");
  });

  it("screenshotRaw throws for adapters without SyncScreenshot capability", () => {
    const browser = makeAdapter({ platform: "browser" });
    const dm = makeDM({ browser }, "browser");

    expect(() => dm.screenshotRaw()).toThrow(/screenshotRaw is not supported for browser/);
  });

  it("screenshotRaw returns string when capability is present", () => {
    const android = makeAdapter({
      platform: "android",
      selectedDeviceId: "a",
      capabilities: ["syncScreenshot"],
    });
    const dm = makeDM({ android }, "android");

    expect(dm.screenshotRaw()).toBe("rawpng");
  });

  it("getLogs / clearLogs throw without ShellAdapter capability", () => {
    const ios = makeAdapter({ platform: "ios", selectedDeviceId: "i" });
    const dm = makeDM({ ios }, "ios");

    expect(() => dm.getLogs()).toThrow(/Logs are not supported for ios/);
    expect(() => dm.clearLogs()).toThrow(/Logs are not supported for ios/);
  });
});

describe("delegation passes args through to the adapter", () => {
  it("tap forwards x/y and targetPid", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "a" });
    const dm = makeDM({ android }, "android");

    await dm.tap(100, 200, undefined, 4242);

    expect(android.tap).toHaveBeenCalledWith(100, 200, 4242);
  });

  it("swipe forwards all 5 args including default duration", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "a" });
    const dm = makeDM({ android }, "android");

    await dm.swipe(10, 20, 30, 40);

    expect(android.swipe).toHaveBeenCalledWith(10, 20, 30, 40, 300);
  });

  it("inputText forwards text and targetPid", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "a" });
    const dm = makeDM({ android }, "android");

    await dm.inputText("hello", undefined, 99);

    expect(android.inputText).toHaveBeenCalledWith("hello", 99);
  });

  it("screenshotAsync forwards compress + options", async () => {
    const android = makeAdapter({ platform: "android", selectedDeviceId: "a" });
    const dm = makeDM({ android }, "android");

    await dm.screenshotAsync(undefined, false, { quality: 50 } as any);

    expect(android.screenshotAsync).toHaveBeenCalledWith(false, { quality: 50 });
  });
});

describe("raw client accessors", () => {
  it("getAndroidClient / getIosClient / getAuroraClient throw when adapter is wrong type", () => {
    // Our fake adapters are not instances of the concrete AndroidAdapter/etc. classes,
    // so these accessors must throw the configured 'not available' error.
    const android = makeAdapter({ platform: "android" });
    const dm = makeDM({ android });

    expect(() => dm.getAndroidClient()).toThrow(/Android adapter is not available/);
    expect(() => dm.getIosClient()).toThrow(/iOS adapter is not available/);
    expect(() => dm.getAuroraClient()).toThrow(/Aurora adapter is not available/);
    expect(() => dm.getBrowserAdapter()).toThrow(/Browser adapter is not available/);
    expect(() => dm.getDesktopClient()).toThrow(/Desktop adapter is not available/);
  });

  it("launchDesktopApp throws when desktop adapter is missing", async () => {
    const dm = makeDM({}, "android");
    await expect(dm.launchDesktopApp({} as any)).rejects.toThrow(/Desktop adapter is not available/);
  });

  it("isDesktopRunning returns false when desktop adapter is missing", () => {
    const dm = makeDM({}, "android");
    expect(dm.isDesktopRunning()).toBe(false);
  });
});
