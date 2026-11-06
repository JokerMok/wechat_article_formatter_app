"""Package the public assets and the loopback Next server."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile

work, output = map(Path, sys.argv[1:3])
sha = sys.argv[3]
build = work / ".next"
release = build / "standalone"
assert (release / "server.js").is_file(), "Build a Next standalone runtime first"
assert not (work / "middleware.ts").exists() and not (work / "proxy.ts").exists(), "Review public routing for authenticated builds"

# Only the private server uses Next. Image optimization is unnecessary for this release.
image_native = release / "node_modules/@img"
if image_native.is_dir():
    for package in image_native.glob("*darwin*"):
        shutil.rmtree(package)
native_files = list(release.rglob("*.node"))
if native_files:
    raise SystemExit("Review remaining native modules before packaging for Linux: " + str(native_files))

static = release / ".next/static"
if not static.exists():
    shutil.copytree(build / "static", static)
web = release / "web"
web.mkdir()
prerendered_home = build / "server/app/index.html"
if prerendered_home.is_file():
    shutil.copy2(prerendered_home, web / "index.html")
else:
    (web / ".formatter-dynamic").write_text("loopback frontend and authenticated AI\n")
shutil.copytree(static, web / "_next/static", copy_function=os.link)
release_metadata = {
    "git_sha": sha,
    "package_lock_sha256": hashlib.sha256((work / "package-lock.json").read_bytes()).hexdigest(),
    "next": json.loads((work / "node_modules/next/package.json").read_text())["version"],
    "build_id": (build / "BUILD_ID").read_text().strip(),
}
(release / "RELEASE.json").write_text(json.dumps(release_metadata, indent=2) + "\n")
files = sorted(p for p in release.rglob("*") if p.is_file() and not p.is_symlink())
(release / "SHA256SUMS").write_text("".join(
    f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(release)}\n" for p in files
))
for p in release.rglob("*"):
    if not p.is_symlink():
        p.chmod(0o755 if p.is_dir() else 0o644)
release.chmod(0o755)
archive = output / f"formatter-{sha}.tar.gz"
with tarfile.open(archive, "w:gz", compresslevel=6) as tar:
    tar.add(release, arcname=".")
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_name(archive.name + ".sha256").write_text(f"{digest}  {archive.name}\n")
print(archive)
