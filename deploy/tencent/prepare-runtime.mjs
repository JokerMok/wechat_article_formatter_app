import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip } from "node:zlib";

const root = "/srv/apps/formatter";
const release = process.env.FORMATTER_RELEASE_DIR || join(root, "current");
const directory = process.env.RUNTIME_DIRECTORY || "/run/formatter";

const fullArchive = join(release, "runtime.tar.gz");
const deltaMetadata = join(release, "runtime-base.json");

async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

if (existsSync(fullArchive) || existsSync(deltaMetadata)) {
  const app = join(directory, "app");
  await mkdir(app, { mode: 0o700 });
  const extract = (archive) => execFileSync(
    "/usr/bin/python3", ["-m", "tarfile", "-e", archive, app], { stdio: "inherit" },
  );
  if (existsSync(fullArchive)) {
    extract(fullArchive);
  } else {
    const base = JSON.parse(await readFile(deltaMetadata, "utf8"));
    if (!/^[a-f0-9]{40}$/.test(base.release)) throw new Error("Invalid runtime base");
    const archive = join(root, "releases", base.release, "runtime.tar.gz");
    if (await hash(archive) !== base.archiveSha256) throw new Error("Runtime base checksum mismatch");
    const oldTar = join(directory, "base.tar");
    const newTar = join(directory, "release.tar");
    try {
      await pipeline(createReadStream(archive), createGunzip(), createWriteStream(oldTar));
      execFileSync("/usr/bin/zstd", [
        "-q", "-d", "--long=27", `--patch-from=${oldTar}`,
        join(release, "runtime.patch.zst"), "-o", newTar,
      ], { stdio: "inherit" });
      if (await hash(newTar) !== base.tarSha256) throw new Error("Runtime checksum mismatch");
      extract(newTar);
    } finally {
      await rm(oldTar, { force: true });
      await rm(newTar, { force: true });
    }
  }
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
