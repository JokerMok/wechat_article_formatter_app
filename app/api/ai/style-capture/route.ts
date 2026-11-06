import { authorizeAI } from "../../../../lib/accounts/feature";
import { z } from "zod";
import { captureReference } from "../../../../lib/studio/capture";
import { rightsSchema } from "../../../../lib/studio/types";
import {
  acquireServerAILimit,
  assertAllowedRequestOrigin,
} from "../../../../lib/ai/server/limits";
import { readBoundedBody } from "../../../../lib/ai/server/bounded-body";
import { ServerAIError } from "../../../../lib/ai/server/errors";
import { WechatCaptureError } from "../../../../lib/studio/wechat-capture";
export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z
  .object({
    url: z.string().max(2000).optional(),
    html: z.string().max(500_000).optional(),
    baseURL: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .optional(),
    rights: rightsSchema,
  })
  .refine(
    (v) =>
      Boolean(v.url) !== Boolean(v.html) && (!v.baseURL || Boolean(v.html)),
  );
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    assertAllowedRequestOrigin(request);
    await authorizeAI(request, "STYLE_CAPTURE");
    const parsed = schema.safeParse(
      JSON.parse(await readBoundedBody(request, 1_500_000)),
    );
    if (!parsed.success)
      return Response.json(
        { error: "请输入一个网页链接或参考 HTML。" },
        { status: 400 },
      );
    release = acquireServerAILimit(request);
    return Response.json(
      {
        data: await captureReference({
          ...parsed.data,
          signal: request.signal,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof ServerAIError
        ? (error.status ?? 400)
        : error instanceof WechatCaptureError && error.code === "invalid_url"
          ? 400
          : 422;
    return Response.json(
      {
        ...(error instanceof WechatCaptureError ? { code: error.code } : {}),
        error:
          error instanceof ServerAIError
            ? error.message
            : error instanceof Error &&
                !/ENOTFOUND|ECONN|EAI_|certificate|socket|abort|timeout/i.test(
                  error.message,
                )
              ? error.message
              : "网页无法取得或采集超时，请改用截图或手动粘贴。",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    release?.();
  }
}
