import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";

const root = "/srv/apps/formatter";
if (existsSync(root + "/current/web/.formatter-dynamic")) {
  const destination = "/run/formatter/chromium";
  const temporary = destination + ".pending";
  try {
    await pipeline(
      createReadStream(root + "/runtime/chromium-153.0.0.br"),
      createBrotliDecompress(),
      createWriteStream(temporary, { mode: 0o700 }),
    );
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
