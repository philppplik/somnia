#!/usr/bin/env python3
"""Builds latest.json for the Tauri updater from the .sig files CI produced.
usage: make-latest-json.py <tag> <notes_file> <windows_nsis_dir> <linux_appimage_dir> <out_json>
Only platforms whose signature file exists are listed. Exit code 3 when none exist (release without updater)."""
import glob,json,sys,datetime
tag,notes,wdir,ldir,out=sys.argv[1:6]
base=f"https://github.com/philppplik/somnia/releases/download/{tag}/"
plat={}
for key,pattern,name in [("windows-x86_64",wdir+"/*.exe.sig",f"Somnia-{tag}-x64-setup.exe"),("linux-x86_64",ldir+"/*.AppImage.sig",f"Somnia-{tag}-amd64.AppImage")]:
    sigs=glob.glob(pattern)
    if sigs:plat[key]={"signature":open(sigs[0]).read().strip(),"url":base+name}
if not plat:sys.exit(3)
json.dump({"version":tag.lstrip("v"),"notes":open(notes).read()[:4000],"pub_date":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),"platforms":plat},open(out,"w"),indent=2)
print("latest.json platforms:",", ".join(plat))
