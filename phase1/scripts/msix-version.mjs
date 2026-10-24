// Store identity version for the MSIX package, derived from somniaRelease in package.json.
//
// The Store needs a monotonically increasing 4-part x.y.z.rev: every beta must sort
// above the previously published package and below its own stable release, so the
// stable upgrade path stays intact. Mapping:
//   x.y.z          -> x.y.z.1000   (stable)
//   x.y.z-beta.N   -> x.y.z.N      (N clamped to 1..999; same for alpha/rc)
//   anything else  -> 0.1.0.0      (unparseable dev string; never Store-eligible)
// make-msix.ps1 calls this script; msix-version.test.mjs locks the table.
import {readFileSync} from 'node:fs';
export function msixIdentityVersion(release) {
  const m=/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z]+(?:\.(\d+))?)?$/.exec(String(release??''));
  if(!m) return '0.1.0.0';
  const isPrerelease=m[0].includes('-');
  const rev=isPrerelease ? Math.min(Math.max(parseInt(m[4]??'1',10)||1,1),999) : 1000;
  return `${m[1]}.${m[2]}.${m[3]}.${rev}`;
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href) {
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  console.log(msixIdentityVersion(pkg.somniaRelease));
}
