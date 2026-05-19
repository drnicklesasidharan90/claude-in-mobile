import { describe, it, expect, vi, beforeEach } from "vitest";
import { interactionTools } from "./interaction-tools.js";
import { ValidationError } from "../errors.js";
import type { ToolContext } from "./context.js";

function findHandler(name: string) {
  const def = interactionTools.find((t) => t.tool.name === name);
  if (!def) throw new Error(`Tool "${name}" not found in interactionTools`);
  return def.handler;
}

function makeMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    deviceManager: {
      getCurrentPlatform: vi.fn(() => "android"),
      tap: vi.fn(async () => {}),
      doubleTap: vi.fn(async () => {}),
      longPress: vi.fn(async () => {}),
      swipe: vi.fn(async () => {}),
      swipeDirection: vi.fn(async () => {}),
      inputText: vi.fn(async () => {}),
      pressKey: vi.fn(async () => {}),
      getIosClient: vi.fn(() => ({
        tapElement: vi.fn(async () => {}),
        getElementRect: vi.fn(async () => null),
      })),
    } as any,
    getCachedElements: vi.fn(() => []),
    setCachedElements: vi.fn(),
    invalidateUiTreeCache: vi.fn(),
    lastScreenshotMap: new Map(),
    lastUiTreeMap: new Map(),
    screenshotScaleMap: new Map(),
    generateActionHints: vi.fn(async () => "\n--- Hints ---\nstub"),
    getElementsForPlatform: vi.fn(async () => []),
    iosTreeToUiElements: vi.fn(() => []),
    formatIOSUITree: vi.fn(() => ""),
    platformParam: { type: "string", enum: ["android", "ios", "desktop", "aurora", "browser"], description: "" },
    handleTool: vi.fn(async () => ({ text: "ok" })),
    ...overrides,
  };
}

describe("input_tap", () => {
  const handler = findHandler("input_tap");

  it("taps at provided x/y coordinates and invalidates UI cache", async () => {
    const ctx = makeMockContext();
    const out = await handler({ x: 100, y: 200, hints: false }, ctx);

    expect(ctx.deviceManager.tap).toHaveBeenCalledWith(100, 200, undefined, undefined);
    expect(ctx.invalidateUiTreeCache).toHaveBeenCalledWith("android");
    expect((out as any).text).toBe("Tapped at (100, 200)");
  });

  it("applies screenshot scale to raw x/y when a scale factor is set", async () => {
    const ctx = makeMockContext();
    ctx.screenshotScaleMap.set("android", { scaleX: 2, scaleY: 2 });

    await handler({ x: 50, y: 100, hints: false }, ctx);

    expect(ctx.deviceManager.tap).toHaveBeenCalledWith(100, 200, undefined, undefined);
  });

  it("appends action hints by default and respects hints:false", async () => {
    const ctx = makeMockContext();
    const withHints = (await handler({ x: 1, y: 1 }, ctx)) as any;
    expect(withHints.text).toContain("--- Hints ---");
    expect(ctx.generateActionHints).toHaveBeenCalledTimes(1);

    const without = (await handler({ x: 1, y: 1, hints: false }, ctx)) as any;
    expect(without.text).not.toContain("--- Hints ---");
    expect(ctx.generateActionHints).toHaveBeenCalledTimes(1);
  });

  it("throws ValidationError when no coordinates, text, resourceId, label, or index are given", async () => {
    const ctx = makeMockContext();
    await expect(handler({}, ctx)).rejects.toThrow(ValidationError);
  });

  it("uses the platform argument over the active target", async () => {
    const ctx = makeMockContext();
    await handler({ x: 10, y: 20, platform: "desktop", hints: false }, ctx);

    expect(ctx.deviceManager.tap).toHaveBeenCalledWith(10, 20, "desktop", undefined);
    expect(ctx.invalidateUiTreeCache).toHaveBeenCalledWith("desktop");
  });

  it("forwards targetPid for desktop focus-preserving taps", async () => {
    const ctx = makeMockContext();
    await handler({ x: 1, y: 2, targetPid: 9999, hints: false }, ctx);

    expect(ctx.deviceManager.tap).toHaveBeenCalledWith(1, 2, undefined, 9999);
  });

  it("on iOS, taps element via WDA when resolver returns iosTapDone with elementId", async () => {
    const tapElement = vi.fn(async () => {});
    const ctx = makeMockContext({
      deviceManager: {
        getCurrentPlatform: vi.fn(() => "ios"),
        tap: vi.fn(async () => {}),
        getIosClient: vi.fn(() => ({
          findElement: vi.fn(async () => ({ ELEMENT: "elem-id-1" })),
          getElementRect: vi.fn(async () => null), // forces iosTapDone path
          tapElement,
        })),
      } as any,
    });

    const out = (await handler({ label: "Submit", platform: "ios", hints: false }, ctx)) as any;

    expect(tapElement).toHaveBeenCalledWith("elem-id-1");
    expect(out.text).toMatch(/^Tapped element:/);
    expect(ctx.deviceManager.tap).not.toHaveBeenCalled();
  });
});

describe("input_swipe", () => {
  const handler = findHandler("input_swipe");

  it("uses swipeDirection when direction is provided", async () => {
    const ctx = makeMockContext();
    const out = (await handler({ direction: "down", hints: false }, ctx)) as any;

    expect(ctx.deviceManager.swipeDirection).toHaveBeenCalledWith("down", undefined);
    expect(ctx.deviceManager.swipe).not.toHaveBeenCalled();
    expect(out.text).toBe("Swiped down");
  });

  it("uses custom coordinates when x1/y1/x2/y2 are provided", async () => {
    const ctx = makeMockContext();
    const out = (await handler({ x1: 100, y1: 200, x2: 300, y2: 400, duration: 500, hints: false }, ctx)) as any;

    expect(ctx.deviceManager.swipe).toHaveBeenCalledWith(100, 200, 300, 400, 500, undefined);
    expect(out.text).toBe("Swiped from (100, 200) to (300, 400)");
  });

  it("applies scale to both endpoints when scale factor is set", async () => {
    const ctx = makeMockContext();
    ctx.screenshotScaleMap.set("android", { scaleX: 2, scaleY: 3 });

    await handler({ x1: 10, y1: 10, x2: 20, y2: 20, hints: false }, ctx);

    expect(ctx.deviceManager.swipe).toHaveBeenCalledWith(20, 30, 40, 60, 300, undefined);
  });

  it("defaults duration to 300ms when not provided", async () => {
    const ctx = makeMockContext();
    await handler({ x1: 0, y1: 0, x2: 1, y2: 1, hints: false }, ctx);

    expect(ctx.deviceManager.swipe).toHaveBeenCalledWith(0, 0, 1, 1, 300, undefined);
  });

  it("throws ValidationError when neither direction nor full coordinates are given", async () => {
    const ctx = makeMockContext();
    await expect(handler({}, ctx)).rejects.toThrow(ValidationError);
    await expect(handler({ x1: 1, y1: 2 }, ctx)).rejects.toThrow(ValidationError); // partial coords
  });

  it("invalidates UI cache after a successful direction swipe", async () => {
    const ctx = makeMockContext();
    await handler({ direction: "up", hints: false }, ctx);
    expect(ctx.invalidateUiTreeCache).toHaveBeenCalledWith("android");
  });
});

describe("input_text", () => {
  const handler = findHandler("input_text");

  it("types the provided text and invalidates UI cache", async () => {
    const ctx = makeMockContext();
    const out = (await handler({ text: "hello world", hints: false }, ctx)) as any;

    expect(ctx.deviceManager.inputText).toHaveBeenCalledWith("hello world", undefined, undefined);
    expect(ctx.invalidateUiTreeCache).toHaveBeenCalledWith("android");
    expect(out.text).toBe('Entered text: "hello world"');
  });

  it("throws ValidationError when text is missing", async () => {
    const ctx = makeMockContext();
    await expect(handler({}, ctx)).rejects.toThrow();
  });

  it("forwards targetPid for desktop focus-preserving input", async () => {
    const ctx = makeMockContext();
    await handler({ text: "hi", targetPid: 1234, hints: false }, ctx);
    expect(ctx.deviceManager.inputText).toHaveBeenCalledWith("hi", undefined, 1234);
  });

  it("uses the platform argument when provided", async () => {
    const ctx = makeMockContext();
    await handler({ text: "x", platform: "ios", hints: false }, ctx);
    expect(ctx.deviceManager.inputText).toHaveBeenCalledWith("x", "ios", undefined);
    expect(ctx.invalidateUiTreeCache).toHaveBeenCalledWith("ios");
  });
});

describe("input_key", () => {
  const handler = findHandler("input_key");

  it("presses the given key", async () => {
    const ctx = makeMockContext();
    const out = (await handler({ key: "BACK", hints: false }, ctx)) as any;

    expect(ctx.deviceManager.pressKey).toHaveBeenCalledWith("BACK", undefined, undefined);
    expect(out.text).toBe("Pressed key: BACK");
  });

  it("throws when key is missing", async () => {
    const ctx = makeMockContext();
    await expect(handler({}, ctx)).rejects.toThrow();
  });

  it("forwards targetPid", async () => {
    const ctx = makeMockContext();
    await handler({ key: "ENTER", targetPid: 7, hints: false }, ctx);
    expect(ctx.deviceManager.pressKey).toHaveBeenCalledWith("ENTER", undefined, 7);
  });
});

describe("input_double_tap", () => {
  const handler = findHandler("input_double_tap");

  it("forwards x, y, and interval to doubleTap", async () => {
    const ctx = makeMockContext();
    const out = (await handler({ x: 50, y: 60, interval: 150, hints: false }, ctx)) as any;

    expect(ctx.deviceManager.doubleTap).toHaveBeenCalledWith(50, 60, 150, undefined);
    expect(out.text).toBe("Double tapped at (50, 60) with 150ms interval");
  });

  it("defaults interval to 100ms", async () => {
    const ctx = makeMockContext();
    await handler({ x: 1, y: 1, hints: false }, ctx);
    expect(ctx.deviceManager.doubleTap).toHaveBeenCalledWith(1, 1, 100, undefined);
  });

  it("throws ValidationError when nothing to resolve", async () => {
    const ctx = makeMockContext();
    await expect(handler({}, ctx)).rejects.toThrow(ValidationError);
  });
});

describe("input_long_press", () => {
  const handler = findHandler("input_long_press");

  it("long-presses at x/y with default duration 1000", async () => {
    const ctx = makeMockContext();
    const out = (await handler({ x: 10, y: 20 }, ctx)) as any;

    expect(ctx.deviceManager.longPress).toHaveBeenCalledWith(10, 20, 1000, undefined);
    expect(out.text).toBe("Long pressed at (10, 20) for 1000ms");
  });

  it("respects custom duration", async () => {
    const ctx = makeMockContext();
    await handler({ x: 0, y: 0, duration: 2500 }, ctx);
    expect(ctx.deviceManager.longPress).toHaveBeenCalledWith(0, 0, 2500, undefined);
  });

  it("throws ValidationError when nothing is provided", async () => {
    const ctx = makeMockContext();
    await expect(handler({}, ctx)).rejects.toThrow(ValidationError);
  });
});
