import { describe, it, expect } from "vitest";
import { parseSourceDocument } from "../article-parser";
import { DEFAULT_SOURCE_MARKDOWN } from "../../components/workspace/state";
import { OpenAICompatibleProvider } from "./provider";

describe("semantic pipeline roundtrip", () => {
  it("accepts a source-anchored analysis of mixed syntax", async () => {
    const source = parseSourceDocument(DEFAULT_SOURCE_MARKDOWN);
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://example.com/v1", apiKey: "test", model: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: JSON.stringify({
      schemaVersion: 1, documentType: "opinionAnalysis", tone: "理性",
      thesis: source.blocks.find((block) => block.type === "paragraph")?.plainText,
      sections: [{ id: "analysis-main", role: "argument", sourceSegmentIds: source.segments.map((segment) => segment.id), confidence: 0.85 }], facts: [], quoteCandidates: [],
    }) } }] }) });
    const result = await provider.analyzeSemantic({ source, generationMode: "reachOptimized" }).catch((error) => ({ failure: error.diagnostics }));
    expect(result).not.toHaveProperty("failure");
  });
});
