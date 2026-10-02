import { launch, sleep } from './lib.mjs';
const { p, close } = await launch();
await p.screenshot({ path: '/tmp/s1.png' });
await close();
