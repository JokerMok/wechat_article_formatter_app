import { describe, expect, it } from "vitest";
import { cardPresetForScheme, createCardPreset } from "./catalog";

describe("visual theme card presets", () => {
  it("keeps explicit theme and content layout independent", () => {
    const preset = createCardPreset({ themeId: "storyMagazine", layoutId: "editorial" });

    expect(preset.variant).toBe("editorial");
    expect(preset.background).toBe("#F5F0EA");
    expect(preset.title).toBe("#7A3E4B");
  });

  it.each([
    ["knowledgeMinimal", "editorial", "editorial"],
    ["checklistGuide", "informationCard", "checklist"],
    ["storyNarrative", "storyMagazine", "story"],
  ] as const)("matches the compatibility preset for %s", (schemeId, themeId, layoutId) => {
    expect(cardPresetForScheme(schemeId, layoutId)).toEqual(createCardPreset({ themeId, layoutId }));
  });
});
