#!/usr/bin/env python3
"""Builds latest.json for the Tauri updater from the .sig files CI produced.
usage: make-latest-json.py <tag> <notes_file> <windows_nsis_dir> <linux_appimage_dir> <out_json> [<macos_dir>]
Only platforms whose signature file exists are listed. Exit code 3 when none exist (release without updater).
macOS (optional 6th argument): looks for <macos_dir>/*.app.tar.gz.sig (Tauri updater archive of the .app) and lists it as
darwin-aarch64 (default, macos-latest runners are Apple Silicon). Set SOMNIA_MACOS_ARCH=x86_64 for an Intel build."""
import glob, json, os, sys, datetime

def platforms(tag, wdir, ldir, mdir=None, macos_arch=None):
    base = f"https://github.com/philppplik/somnia/releases/download/{tag}/"
    arch = macos_arch or os.environ.get("SOMNIA_MACOS_ARCH", "aarch64")
    if arch not in ("aarch64", "x86_64"):
        raise ValueError(f"unsupported macOS arch {arch}")
    table = [
        ("windows-x86_64", wdir, "*.exe.sig", f"Somnia-{tag}-x64-setup.exe"),
        ("linux-x86_64", ldir, "*.AppImage.sig", f"Somnia-{tag}-amd64.AppImage"),
    ]
    if mdir:
        table.append((f"darwin-{arch}", mdir, "*.app.tar.gz.sig", f"Somnia-{tag}-macos-{arch}.app.tar.gz"))
    plat = {}
    for key, d, pattern, name in table:
        sigs = sorted(glob.glob(os.path.join(d, pattern)))
        if sigs:
            plat[key] = {"signature": open(sigs[0]).read().strip(), "url": base + name}
    return plat

def build(tag, notes, plat):
    return {"version": tag.lstrip("v"), "notes": open(notes).read()[:4000],
            "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "platforms": plat}

if __name__ == "__main__":
    tag, notes, wdir, ldir, out = sys.argv[1:6]
    mdir = sys.argv[6] if len(sys.argv) > 6 else None
    plat = platforms(tag, wdir, ldir, mdir)
    if not plat:
        sys.exit(3)
    json.dump(build(tag, notes, plat), open(out, "w"), indent=2)
    print("latest.json platforms:", ", ".join(plat))
