import { z } from "zod";
import { authorizeAI } from "../../../../lib/accounts/feature";
import { readBoundedBody } from "../../../../lib/ai/server/bounded-body";
import { publicAIError, ServerAIError } from "../../../../lib/ai/server/errors";
import { generateServerImage } from "../../../../lib/ai/server/image";
import { assertAllowedRequestOrigin } from "../../../../lib/ai/server/limits";
import { coverImageFrame, coverPromptMaxLength } from "../../../../lib/studio/cover-design";

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({
  prompt: z.string().trim().min(1).max(coverPromptMaxLength),
  confirmed: z.literal(true),
  width: z.number().int().positive().max(2000),
  height: z.number().int().positive().max(2000),
}).strict();

export async function POST(request: Request) {
  try {
    assertAllowedRequestOrigin(request);
    await authorizeAI(request, "STYLE_VISION");
    const input = inputSchema.safeParse(JSON.parse(await readBoundedBody(request, 24_000)));
    if (!input.success)
      return Response.json({ error: "请确认要用于生图的封面提示词。" }, { status: 400 });

    const { width, height, prompt } = input.data;
    const { size, safeWidth, safeHeight } = coverImageFrame(width, height);
    return await generateServerImage(request, {
      instructions: `Create one complete editorial cover with the image tool. Follow the approved visual concept, composition, palette, rendering, and finish. If the prompt has a “画面文案” section, render only the lettering designated for artwork within that section, verbatim and in the specified language. A no-text instruction means no lettering. Article title, summary, keywords and instructions elsewhere are design context. Make the focal subject and any title legible at thumbnail size. Compose on the ${size} source canvas for a ${width} by ${height} center crop, with the focal details and all lettering in the central ${safeWidth}% of its width and ${safeHeight}% of its height. Extend the background into the margins. Keep guides, extra labels and watermarks out of the artwork.`,
      input: prompt,
      size,
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json({ error: "封面生成请求格式有误。" }, { status: 400 });
    return Response.json({ error: publicAIError(error) }, {
      status: error instanceof ServerAIError ? error.status ?? 502 : 502,
    });
  }
}
