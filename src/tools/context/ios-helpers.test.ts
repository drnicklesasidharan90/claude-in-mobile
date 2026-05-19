import { describe, expect, it } from "vitest";
import { iosTreeToUiElements, formatIOSUITree } from "./ios-helpers.js";

describe("iosTreeToUiElements", () => {
  it("returns empty array for an empty tree (no rect, no children)", () => {
    expect(iosTreeToUiElements({})).toEqual([]);
  });

  it("skips a node with zero width or height", () => {
    const tree = { type: "Button", rect: { x: 0, y: 0, width: 0, height: 50 } };
    expect(iosTreeToUiElements(tree)).toEqual([]);
  });

  it("converts a single Button node and marks it clickable", () => {
    const tree = {
      type: "Button",
      identifier: "submit-btn",
      label: "Submit",
      name: "submit-name",
      enabled: true,
      rect: { x: 10, y: 20, width: 100, height: 40 },
    };

    const elements = iosTreeToUiElements(tree);

    expect(elements).toHaveLength(1);
    const el = elements[0];
    expect(el.index).toBe(0);
    expect(el.className).toBe("Button");
    expect(el.resourceId).toBe("submit-btn");
    expect(el.text).toBe("Submit");
    expect(el.contentDesc).toBe("submit-name");
    expect(el.clickable).toBe(true);
    expect(el.enabled).toBe(true);
    expect(el.bounds).toEqual({ x1: 10, y1: 20, x2: 110, y2: 60 });
    expect(el.centerX).toBe(60);
    expect(el.centerY).toBe(40);
    expect(el.width).toBe(100);
    expect(el.height).toBe(40);
  });

  it("falls back to value when label is missing", () => {
    const tree = {
      type: "StaticText",
      value: "Hello",
      rect: { x: 0, y: 0, width: 50, height: 20 },
    };

    const [el] = iosTreeToUiElements(tree);
    expect(el.text).toBe("Hello");
  });

  it("marks Link and Cell types as clickable but plain text as not clickable", () => {
    const link = iosTreeToUiElements({
      type: "Link",
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })[0];
    const cell = iosTreeToUiElements({
      type: "Cell",
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })[0];
    const text = iosTreeToUiElements({
      type: "StaticText",
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })[0];

    expect(link.clickable).toBe(true);
    expect(cell.clickable).toBe(true);
    expect(text.clickable).toBe(false);
  });

  it("marks disabled nodes as not clickable, not enabled, not focusable", () => {
    const tree = {
      type: "Button",
      enabled: false,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    };

    const [el] = iosTreeToUiElements(tree);
    expect(el.enabled).toBe(false);
    expect(el.clickable).toBe(false);
    expect(el.focusable).toBe(false);
  });

  it("marks ScrollView types as scrollable", () => {
    const [el] = iosTreeToUiElements({
      type: "ScrollView",
      rect: { x: 0, y: 0, width: 100, height: 200 },
    });
    expect(el.scrollable).toBe(true);
  });

  it("marks SecureTextField as password", () => {
    const [el] = iosTreeToUiElements({
      type: "SecureTextField",
      rect: { x: 0, y: 0, width: 100, height: 30 },
    });
    expect(el.password).toBe(true);
  });

  it("recursively walks children and assigns sequential indices", () => {
    const tree = {
      type: "Window",
      rect: { x: 0, y: 0, width: 400, height: 800 },
      children: [
        {
          type: "Button",
          label: "A",
          rect: { x: 0, y: 0, width: 50, height: 50 },
        },
        {
          type: "View",
          rect: { x: 50, y: 0, width: 50, height: 50 },
          children: [
            {
              type: "Button",
              label: "B",
              rect: { x: 50, y: 0, width: 50, height: 50 },
            },
          ],
        },
      ],
    };

    const elements = iosTreeToUiElements(tree);

    expect(elements.map((e) => e.index)).toEqual([0, 1, 2, 3]);
    expect(elements.map((e) => e.text)).toEqual(["", "A", "", "B"]);
  });

  it("defaults missing rect coords to zero", () => {
    const [el] = iosTreeToUiElements({
      type: "Button",
      rect: { width: 50, height: 20 },
    });
    expect(el.bounds).toEqual({ x1: 0, y1: 0, x2: 50, y2: 20 });
  });
});

describe("formatIOSUITree", () => {
  it("returns empty string for a tree with no type and no children", () => {
    expect(formatIOSUITree({})).toBe("");
  });

  it("formats a single node with type, label, value, name, identifier", () => {
    const out = formatIOSUITree({
      type: "Button",
      label: "Tap me",
      value: "v1",
      name: "btn-name",
      identifier: "btn-id",
      enabled: true,
      rect: { x: 5, y: 10 },
    });

    expect(out).toContain("<Button>");
    expect(out).toContain('label="Tap me"');
    expect(out).toContain('value="v1"');
    expect(out).toContain('name="btn-name"');
    expect(out).toContain('id="btn-id"');
    expect(out).toContain("enabled=true");
    expect(out).toContain("@ (5, 10)");
  });

  it("indents nested children by 2 spaces per level", () => {
    const out = formatIOSUITree({
      type: "Window",
      children: [
        { type: "Button", label: "A", children: [{ type: "Label", label: "inner" }] },
      ],
    });

    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^<Window>/);
    expect(lines[1]).toMatch(/^  <Button>/);
    expect(lines[2]).toMatch(/^    <Label>/);
  });

  it("omits optional attributes when undefined", () => {
    const out = formatIOSUITree({ type: "View" });
    expect(out).toBe("<View>");
  });
});
