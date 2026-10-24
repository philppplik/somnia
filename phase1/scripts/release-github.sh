#!/bin/bash
# usage: release.sh <tag> <run_id> <sha> <prerelease:true|false> <notes_file>
set -e
T=${1}; RUN=${2}; SHA=${3}; PRE=${4}; NOTES=${5}
cd /home/sandbox/somnia2; H=$(git config --get-regexp 'http.*extraheader' | cut -d' ' -f2-); API=https://api.github.com/repos/philppplik/somnia; D=/tmp/rel-${T}
rm -rf ${D}; mkdir -p ${D}/w ${D}/l ${D}/m ${D}/out
curl -s -H "${H}" ${API}/actions/runs/${RUN}/artifacts | python3 -c "
import sys,json
for a in json.load(sys.stdin)['artifacts']: print(a['id'],a['name'].split('-')[1])" > ${D}/art.txt
while read id kind; do d=w; [ ${kind} = linux ] && d=l; [ ${kind} = macos ] && d=m; curl -sL -H "${H}" ${API}/actions/artifacts/${id}/zip -o ${D}/${d}.zip && (cd ${D}/${d} && unzip -oq ../${d}.zip); done < ${D}/art.txt
O=${D}/out
cp ${D}/w/nsis/*.exe ${O}/Somnia-${T}-x64-setup.exe; cp ${D}/w/msi/*.msi ${O}/Somnia-${T}-x64.msi
cp ${D}/l/src-tauri/target/release/bundle/deb/*.deb ${O}/Somnia-${T}-amd64.deb; cp ${D}/l/src-tauri/target/release/bundle/appimage/*.AppImage ${O}/Somnia-${T}-amd64.AppImage; cp $(find ${D}/m -name '*.dmg'|head -1) ${O}/Somnia-${T}-macos.dmg
MAC=$(find ${D}/m -name '*.app.tar.gz'|head -1); MACARGS=''; if [ -n "${MAC}" ] && [ -f "${MAC}.sig" ]; then cp ${MAC} ${O}/Somnia-${T}-macos-aarch64.app.tar.gz; MACARGS=$(dirname ${MAC}); fi
(cd ${O} && sha256sum Somnia-* > SHA256SUMS.txt)
python3 /home/sandbox/somnia2/phase1/scripts/make-latest-json.py ${T} ${NOTES} ${D}/w/nsis ${D}/l/src-tauri/target/release/bundle/appimage ${O}/latest.json ${MACARGS} || echo 'no updater signatures: release has no latest.json'
cat ${NOTES} /home/sandbox/somnia2/phase1/scripts/release-notes-footer.md > ${D}/notes-full.md 2>/dev/null || cp ${NOTES} ${D}/notes-full.md
python3 - ${T} ${SHA} ${PRE} ${D}/notes-full.md > ${D}/body.json <<'PY'
import json,sys;t,sha,pre,n=sys.argv[1:5];print(json.dumps({"tag_name":t,"target_commitish":sha,"name":"Somnia "+t,"body":open(n).read(),"prerelease":pre=="true"}))
PY
RID=$(curl -s -H "${H}" -X POST ${API}/releases -d @${D}/body.json | python3 -c "import sys,json;r=json.load(sys.stdin);print(r.get('id'))"); echo release ${RID}
cd ${O}; for f in *; do curl -s -H "${H}" -H "Content-Type: application/octet-stream" --data-binary @${f} "https://uploads.github.com/repos/philppplik/somnia/releases/${RID}/assets?name=${f}" | python3 -c "
import sys,json;r=json.load(sys.stdin);print(r.get('name'),r.get('state'),r.get('message'))"; done
