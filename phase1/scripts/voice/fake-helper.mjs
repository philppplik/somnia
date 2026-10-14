// Development/CI child process only. No native engine, assets or network access requested.
import {writeFileSync} from 'node:fs';
const [mode,output]=process.argv.slice(2);
if(mode==='crash')process.exit(7);
if(mode==='wait'){process.stdout.write('ready\n');setInterval(()=>{},1000);}else if(mode==='result'){writeFileSync(output,'Synthetic process transcript');}else process.exit(8);
