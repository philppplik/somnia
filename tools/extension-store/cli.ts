import {readFile} from 'node:fs/promises';
import {parseStoreCatalog} from '../../phase1/src/lib/extensions/store/validation.ts';
import {parseSecurityFeed} from '../../phase1/src/lib/extensions/store/policy.ts';
import {refreshStore} from './tuf.ts';
const [command,...args]=process.argv.slice(2);
if(command==='validate'&&args.length===2){const catalog=parseStoreCatalog(JSON.parse(await readFile(args[0],'utf8')));const security=parseSecurityFeed(JSON.parse(await readFile(args[1],'utf8')));console.log(JSON.stringify({catalogSequence:catalog.sequence,securitySequence:security.sequence,extensions:catalog.extensions.length}));}
else if(command==='refresh'&&args.length===4){const [root,cacheDir,metadataBaseUrl,targetBaseUrl]=args;console.log(JSON.stringify(await refreshStore({pinnedRoot:await readFile(root),cacheDir,metadataBaseUrl,targetBaseUrl})));}
else {console.error('Usage: npm run catalog -- validate <catalog.json> <revocations.json>\n       npm run catalog -- refresh <app-pinned-root.json> <cache-dir> <https-metadata-base> <https-target-base>');process.exitCode=1;}
