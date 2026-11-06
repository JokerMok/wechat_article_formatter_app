import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const release = process.env.FORMATTER_RELEASE_DIR || "/srv/apps/formatter/current";
const directory = process.env.RUNTIME_DIRECTORY || "/run/formatter";
const app = existsSync(join(release, "runtime.tar.gz")) ? join(directory, "app") : release;
process.chdir(app);
await import(pathToFileURL(join(app, "server.js")).href);
