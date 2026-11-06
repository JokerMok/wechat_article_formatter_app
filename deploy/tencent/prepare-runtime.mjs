import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";

const root = "/srv/apps/formatter";
const release = process.env.FORMATTER_RELEASE_DIR || join(root, "current");
const directory = process.env.RUNTIME_DIRECTORY || "/run/formatter";

if (existsSync(join(release, "runtime.tar.gz"))) {
  const app = join(directory, "app");
  await mkdir(app, { mode: 0o700 });
  execFileSync("/usr/bin/python3", ["-m", "tarfile", "-e", join(release, "runtime.tar.gz"), app], { stdio: "inherit" });
  const destination = join(directory, "chromium");
  const temporary = destination + ".pending";
  try {
    await pipeline(
      createReadStream(join(root, "runtime/chromium-153.0.0.br")),
      createBrotliDecompress(),
      createWriteStream(temporary, { mode: 0o700 }),
    );
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
