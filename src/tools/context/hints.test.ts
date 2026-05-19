import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGenerateActionHints, createGetElementsForPlatform } from "./hints.js";
import { setCachedElements, getCachedElements } from "./shared-state.js";
import type { DeviceManager } from "../../device-manager.js";

// Minimal valid Android UI hierarchy XML for parseUiHierarchy.
const androidXml = (texts: string[]) => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
${texts
  .map(
    (t, i) =>
      `<node index="${i}" text="${t}" resource-id="" class="android.widget.Button" package="com.example" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,${i * 60}][200,${i * 60 + 50}]" />`,
  )
  .join("\n")}
</hierarchy>`;

const iosTreeJson = (labels: string[]) =>
  JSON.stringify({
    type: "Window",
    rect: { x: 0, y: 0, width: 400, height: 800 },
    children: labels.map((l, i) => ({
      type: "Button",
      label: l,
      enabled: true,
      rect: { x: 0, y: i * 60, width: 200, height: 50 },
    })),
  });

function makeMockDM(overrides: Partial<DeviceManager> = {}): DeviceManager {
  const dm = {
    getCurrentPlatform: vi.fn(() => "android"),
    getUiHierarchy: vi.fn(async () => "{}"),
    getUiHierarchyAsync: vi.fn(async () => "<hierarchy></hierarchy>"),
    ...overrides,
  } as unknown as DeviceManager;
  return dm;
}

describe("createGenerateActionHints", () => {
  beforeEach(() => {
    // Clean up any cached elements between tests so before/after diffs are deterministic.
    setCachedElements("android", []);
    setCachedElements("ios", []);
    setCachedElements("desktop", []);
  });

  it("uses the platform argument when provided, ignoring deviceManager.getCurrentPlatform", async () => {
    const dm = makeMockDM({
      getCurrentPlatform: vi.fn(() => "android"),
      getUiHierarchy: vi.fn(async () => iosTreeJson(["Login"])),
    });
    const generate = createGenerateActionHints(dm);

    const out = await generate("ios");

    expect(dm.getCurrentPlatform).not.toHaveBeenCalled();
    expect(dm.getUiHierarchy).toHaveBeenCalledWith("ios");
    expect(out).toContain("--- Hints ---");
  });

  it("falls back to deviceManager.getCurrentPlatform when no platform passed", async () => {
    const dm = makeMockDM({
      getCurrentPlatform: vi.fn(() => "ios"),
      getUiHierarchy: vi.fn(async () => iosTreeJson([])),
    });
    const generate = createGenerateActionHints(dm);

    await generate(undefined);

    expect(dm.getCurrentPlatform).toHaveBeenCalled();
    expect(dm.getUiHierarchy).toHaveBeenCalledWith("ios");
  });

  it("defaults to android when getCurrentPlatform returns null and no platform passed", async () => {
    const dm = makeMockDM({
      getCurrentPlatform: vi.fn(() => null as any),
      getUiHierarchyAsync: vi.fn(async () => androidXml([])),
    });
    const generate = createGenerateActionHints(dm);

    await generate(undefined);

    expect(dm.getUiHierarchyAsync).toHaveBeenCalledWith("android");
  });

  it("returns 'No UI elements detected' when before and after are both empty", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml([])),
    });
    const generate = createGenerateActionHints(dm);

    const out = await generate("android");

    expect(out).toContain("No UI elements detected");
  });

  it("reports element count change in 'Elements: X -> Y' format", async () => {
    setCachedElements("android", []);
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml(["A", "B", "C"])),
    });
    const generate = createGenerateActionHints(dm);

    const out = await generate("android");

    expect(out).toMatch(/Elements: 0 -> 3/);
  });

  it("reports 'New:' entries when elements appear", async () => {
    // Prime cache with 'Login' button so 'Home' appears as new.
    setCachedElements("android", []);
    const dm1 = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml(["Login"])),
    });
    await createGenerateActionHints(dm1)("android");

    const dm2 = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml(["Login", "Home"])),
    });
    const out = await createGenerateActionHints(dm2)("android");

    expect(out).toMatch(/New:/);
    expect(out).toContain("Home");
  });

  it("returns an error hint string (does not throw) when getUiHierarchyAsync rejects", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => {
        throw new Error("device offline");
      }),
    });
    const generate = createGenerateActionHints(dm);

    const out = await generate("android");

    expect(out).toContain("Unable to fetch UI state for hints");
    expect(out).toContain("device offline");
  });

  it("returns a generic 'unknown error' message when thrown error has no message", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => {
        throw {}; // no .message
      }),
    });
    const generate = createGenerateActionHints(dm);

    const out = await generate("android");

    expect(out).toContain("Unable to fetch UI state for hints: unknown error");
  });

  it("updates the cached elements for the platform after a successful fetch", async () => {
    setCachedElements("android", []);
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml(["X", "Y"])),
    });

    await createGenerateActionHints(dm)("android");

    expect(getCachedElements("android")).toHaveLength(2);
  });

  it("does not update cache when the fetch fails", async () => {
    setCachedElements("android", []);
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await createGenerateActionHints(dm)("android");

    expect(getCachedElements("android")).toEqual([]);
  });

  it("uses getUiHierarchy (sync method) for iOS, parsing JSON tree", async () => {
    const dm = makeMockDM({
      getUiHierarchy: vi.fn(async () => iosTreeJson(["Login"])),
    });

    await createGenerateActionHints(dm)("ios");

    expect(dm.getUiHierarchy).toHaveBeenCalledWith("ios");
    expect(getCachedElements("ios").length).toBeGreaterThan(0);
  });

  it("returns error hint when iOS JSON is malformed", async () => {
    const dm = makeMockDM({
      getUiHierarchy: vi.fn(async () => "not-json"),
    });

    const out = await createGenerateActionHints(dm)("ios");

    expect(out).toContain("Unable to fetch UI state for hints");
  });

  it("ignores unknown platforms (returns 'No UI elements detected' with empty before)", async () => {
    setCachedElements("aurora" as any, []);
    const dm = makeMockDM();

    const out = await createGenerateActionHints(dm)("aurora");

    expect(out).toContain("No UI elements detected");
    expect(dm.getUiHierarchy).not.toHaveBeenCalled();
    expect(dm.getUiHierarchyAsync).not.toHaveBeenCalled();
  });
});

describe("createGetElementsForPlatform", () => {
  beforeEach(() => {
    setCachedElements("android", []);
    setCachedElements("ios", []);
    setCachedElements("desktop", []);
  });

  it("returns parsed android elements and writes them to cache", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml(["A", "B"])),
    });

    const els = await createGetElementsForPlatform(dm)("android");

    expect(els).toHaveLength(2);
    expect(getCachedElements("android")).toEqual(els);
    expect(dm.getUiHierarchyAsync).toHaveBeenCalledWith("android");
  });

  it("treats an empty platform string as android", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => androidXml(["A"])),
    });

    await createGetElementsForPlatform(dm)("");

    expect(dm.getUiHierarchyAsync).toHaveBeenCalledWith("android");
    expect(getCachedElements("android")).toHaveLength(1);
  });

  it("returns iOS elements when called with 'ios'", async () => {
    const dm = makeMockDM({
      getUiHierarchy: vi.fn(async () => iosTreeJson(["Login", "Register"])),
    });

    const els = await createGetElementsForPlatform(dm)("ios");

    expect(els.length).toBeGreaterThan(0);
    expect(dm.getUiHierarchy).toHaveBeenCalledWith("ios");
    expect(getCachedElements("ios")).toEqual(els);
  });

  it("returns desktop elements when called with 'desktop'", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => ""),
    });

    const els = await createGetElementsForPlatform(dm)("desktop");

    expect(Array.isArray(els)).toBe(true);
    expect(dm.getUiHierarchyAsync).toHaveBeenCalledWith("desktop");
  });

  it("returns an empty array for an unknown platform without calling the device manager", async () => {
    const dm = makeMockDM();

    const els = await createGetElementsForPlatform(dm)("aurora");

    expect(els).toEqual([]);
    expect(dm.getUiHierarchy).not.toHaveBeenCalled();
    expect(dm.getUiHierarchyAsync).not.toHaveBeenCalled();
  });

  it("propagates errors from the device manager (does not swallow)", async () => {
    const dm = makeMockDM({
      getUiHierarchyAsync: vi.fn(async () => {
        throw new Error("adb failed");
      }),
    });

    await expect(createGetElementsForPlatform(dm)("android")).rejects.toThrow("adb failed");
  });
});
