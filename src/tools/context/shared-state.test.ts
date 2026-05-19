import { beforeEach, describe, expect, it } from "vitest";
import type { UiElement } from "../../adb/ui-parser.js";
import {
  getCachedElements,
  setCachedElements,
  invalidateUiTreeCache,
  lastScreenshotMap,
  lastUiTreeMap,
  screenshotScaleMap,
} from "./shared-state.js";

function makeElement(index: number, text: string): UiElement {
  return {
    index,
    resourceId: "",
    className: "android.widget.Button",
    packageName: "com.example",
    text,
    contentDesc: "",
    checkable: false,
    checked: false,
    clickable: true,
    enabled: true,
    focusable: true,
    focused: false,
    scrollable: false,
    longClickable: false,
    password: false,
    selected: false,
    bounds: { x1: 0, y1: 0, x2: 100, y2: 50 },
    centerX: 50,
    centerY: 25,
    width: 100,
    height: 50,
  };
}

describe("shared-state cached elements", () => {
  beforeEach(() => {
    setCachedElements("android", []);
    setCachedElements("ios", []);
    setCachedElements("desktop", []);
  });

  it("returns empty array for unknown platform", () => {
    expect(getCachedElements("never-seen")).toEqual([]);
  });

  it("stores and retrieves elements per platform", () => {
    const a = [makeElement(0, "android-btn")];
    const i = [makeElement(0, "ios-btn"), makeElement(1, "ios-btn-2")];

    setCachedElements("android", a);
    setCachedElements("ios", i);

    expect(getCachedElements("android")).toEqual(a);
    expect(getCachedElements("ios")).toEqual(i);
    expect(getCachedElements("android")).toHaveLength(1);
    expect(getCachedElements("ios")).toHaveLength(2);
  });

  it("overwrites previously cached elements for the same platform", () => {
    setCachedElements("android", [makeElement(0, "first")]);
    setCachedElements("android", [makeElement(0, "second"), makeElement(1, "third")]);

    const cached = getCachedElements("android");
    expect(cached).toHaveLength(2);
    expect(cached[0].text).toBe("second");
  });

  it("returns the same array reference (not a copy)", () => {
    const elements = [makeElement(0, "ref")];
    setCachedElements("android", elements);
    expect(getCachedElements("android")).toBe(elements);
  });
});

describe("invalidateUiTreeCache", () => {
  beforeEach(() => {
    lastUiTreeMap.clear();
  });

  it("clears all entries when called with no platform", () => {
    lastUiTreeMap.set("android", { text: "x", timestamp: 1 });
    lastUiTreeMap.set("ios", { text: "y", timestamp: 2 });
    lastUiTreeMap.set("desktop", { text: "z", timestamp: 3 });

    invalidateUiTreeCache();

    expect(lastUiTreeMap.size).toBe(0);
  });

  it("clears only entries whose key starts with the given platform", () => {
    lastUiTreeMap.set("android", { text: "a", timestamp: 1 });
    lastUiTreeMap.set("android:device1", { text: "a1", timestamp: 2 });
    lastUiTreeMap.set("ios", { text: "i", timestamp: 3 });

    invalidateUiTreeCache("android");

    expect(lastUiTreeMap.has("android")).toBe(false);
    expect(lastUiTreeMap.has("android:device1")).toBe(false);
    expect(lastUiTreeMap.has("ios")).toBe(true);
  });

  it("is a no-op when platform has no matching keys", () => {
    lastUiTreeMap.set("ios", { text: "i", timestamp: 1 });

    invalidateUiTreeCache("android");

    expect(lastUiTreeMap.has("ios")).toBe(true);
    expect(lastUiTreeMap.size).toBe(1);
  });
});

describe("exported caches", () => {
  it("lastScreenshotMap, lastUiTreeMap, screenshotScaleMap are independent Map instances", () => {
    expect(lastScreenshotMap).toBeInstanceOf(Map);
    expect(lastUiTreeMap).toBeInstanceOf(Map);
    expect(screenshotScaleMap).toBeInstanceOf(Map);
    expect(lastScreenshotMap).not.toBe(lastUiTreeMap);
    expect(lastUiTreeMap).not.toBe(screenshotScaleMap);
  });

  it("screenshotScaleMap holds scale factors per platform", () => {
    screenshotScaleMap.set("android", { scaleX: 0.5, scaleY: 0.5 });
    expect(screenshotScaleMap.get("android")).toEqual({ scaleX: 0.5, scaleY: 0.5 });
    screenshotScaleMap.delete("android");
  });
});
