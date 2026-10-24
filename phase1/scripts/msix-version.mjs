// Store identity version for the MSIX package, derived from somniaRelease in package.json.
//
// Microsoft Store rule (learn.microsoft.com "Package version numbering", Windows 10/11):
// the fourth version section is reserved for Store use and MUST be 0 at build time, and
// the first section cannot be 0. Prerelease progression therefore cannot use the fourth
// section. Mapping, agreed with the Store packaging task:
//   x.y.z            -> x.y.z.0
//   x.y.z-beta.N     -> x.y.z.0   (prerelease suffix stripped; a prerelease IS submitted
//                                  as its target version. Consequence: once a beta of
//                                  x.y.z is in the Store, the eventual stable x.y.z.0
//                                  needs an explicit MSIX_VERSION override or a higher
//                                  x.y.(z+1) user-facing version - never a silent bump.)
//   anything else    -> 0.1.0.0   (unparseable dev string; never Store-eligible)
// Escape hatch: MSIX_VERSION env var overrides everything (must be x.y.z.0 form).
// make-msix.ps1 calls this script; msix-version.test.mjs locks the table.
import {readFileSync} from 'node:fs';
export function msixIdentityVersion(release,override) {
  if(override) {
    if(!/^\d+\.\d+\.\d+\.0$/.test(override)) throw new Error(`MSIX_VERSION override '${override}' must be x.y.z.0 (fourth section is Store-reserved and must be 0).`);
    return override;
  }
  const m=/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z]+(?:\.\d+)?)?$/.exec(String(release??''));
  if(!m) return '0.1.0.0';
  return `${m[1]}.${m[2]}.${m[3]}.0`;
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href) {
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  const rel=pkg.somniaRelease;
  const v=msixIdentityVersion(rel,process.env.MSIX_VERSION);
  if(/-/.test(String(rel)) && !process.env.MSIX_VERSION) console.error(`note: prerelease '${rel}' submitted as ${v} (suffix stripped). The stable ${v} release will need MSIX_VERSION or a higher user-facing version.`);
  console.log(v);
}
