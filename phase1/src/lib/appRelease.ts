/** User-facing release label. The shell package version is not the product release. */
export function formatAppRelease(release:string):string{
 const version=release.replace(/^v/i,'');
 const prerelease=version.split('+',1)[0].split('-').slice(1).join('-');
 const channel=/(?:^|[.-])alpha(?:[.-]|$)/i.test(prerelease)?'Alpha':/(?:^|[.-])beta(?:[.-]|$)/i.test(prerelease)?'Beta':'Stable';
 return `Somnia ${channel} v${version}`;
}
