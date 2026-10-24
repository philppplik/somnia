#!/usr/bin/env python3
"""Builds latest.json for the Tauri updater from the .sig files CI produced.
usage: make-latest-json.py <tag> <notes_file> <windows_nsis_dir> <linux_appimage_dir> <out_json> [<macos_dir>]
Only platforms whose signature file exists are listed. Exit code 3 when none exist (release without updater).
Channels: add --channels-dir DIR to also write the per-channel manifests (see channels_for). Stable tags feed latest.json, latest-beta.json and latest-alpha.json, beta tags feed beta and alpha, alpha tags only alpha.
macOS (optional 6th argument): looks for <macos_dir>/*.app.tar.gz.sig (Tauri updater archive of the .app) and lists it as
darwin-aarch64 (default, macos-latest runners are Apple Silicon). Set SOMNIA_MACOS_ARCH=x86_64 for an Intel build."""
import glob, json, os, re, sys, datetime
from urllib.parse import quote

def platforms(tag, wdir, ldir, mdir=None, macos_arch=None):
    base = f"https://github.com/philppplik/somnia/releases/download/{tag}/"
    arch = macos_arch or os.environ.get("SOMNIA_MACOS_ARCH", "aarch64")
    if arch not in ("aarch64", "x86_64"):
        raise ValueError(f"unsupported macOS arch {arch}")
    table = [
        ("windows-x86_64", wdir, "*.exe.sig"),
        ("linux-x86_64", ldir, "*.AppImage.sig"),
    ]
    if mdir:
        table.append((f"darwin-{arch}", mdir, "*.app.tar.gz.sig"))
    plat = {}
    for key, d, pattern in table:
        sigs = sorted(glob.glob(os.path.join(d, pattern)))
        if len(sigs) > 1:
            raise ValueError(f"ambiguous signed artifacts for {key}: {sigs}")
        if sigs:
            artifact = sigs[0][:-4]
            if not os.path.isfile(artifact):
                raise ValueError(f"signature has no matching artifact: {sigs[0]}")
            name = quote(os.path.basename(artifact))
            plat[key] = {"signature": open(sigs[0]).read().strip(), "url": base + name}
    return plat

ALPHA_ID=re.compile(r"alpha|nightly|canary|dev", re.I)

def channel_of(tag):
    """Channel a tag belongs to. Mirrors channelAllows in src/lib/updatePrefs.ts: no prerelease id is stable, alpha/nightly/canary/dev ids are alpha, any other prerelease id (beta, rc) is beta."""
    core = tag.lstrip("v").split("+", 1)[0]
    if "-" not in core:
        return "stable"
    return "alpha" if ALPHA_ID.search(core.split("-", 1)[1]) else "beta"

def channels_for(tag):
    """Manifest file names a release of this tag must be published as. A channel always offers the newest release at or above its own stability, so a stable release also refreshes the beta and alpha manifests."""
    return {"stable": ["latest.json", "latest-beta.json", "latest-alpha.json"],
            "beta": ["latest-beta.json", "latest-alpha.json"],
            "alpha": ["latest-alpha.json"]}[channel_of(tag)]

def build(tag, notes, plat):
    return {"version": tag.lstrip("v"), "notes": open(notes).read()[:4000],
            "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "platforms": plat}

if __name__ == "__main__":
    argv = sys.argv[1:]
    chdir = None
    if "--channels-dir" in argv:
        i = argv.index("--channels-dir")
        chdir = argv[i + 1]
        del argv[i:i + 2]
    tag, notes, wdir, ldir, out = argv[0:5]
    mdir = argv[5] if len(argv) > 5 else None
    plat = platforms(tag, wdir, ldir, mdir)
    if not plat:
        sys.exit(3)
    manifest = build(tag, notes, plat)
    json.dump(manifest, open(out, "w"), indent=2)
    if chdir:
        os.makedirs(chdir, exist_ok=True)
        for name in channels_for(tag):
            json.dump(manifest, open(os.path.join(chdir, name), "w"), indent=2)
        print("channel manifests:", ", ".join(channels_for(tag)))
    print("latest.json platforms:", ", ".join(plat))
