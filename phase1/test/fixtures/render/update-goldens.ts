import {copyFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {updateScope} from './approval';
import {root} from './corpus';
const approval = process.argv[2];
if (!approval) throw new Error('Usage: npx tsx test/fixtures/render/update-goldens.ts /path/to/approval.json');
process.env.SOMNIA_RENDER_APPROVAL = path.resolve(approval);
updateScope();
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'test/fixtures/render/playwright.config.ts', '--update-snapshots=all'], {stdio: 'inherit', env: process.env});
if (result.status !== 0) process.exit(result.status ?? 1);
// Preserve the receipt in the same reviewable commit as the changed images.
const hash = createHash('sha256').update(readFileSync(approval)).digest('hex').slice(0, 16);
mkdirSync(path.join(root, 'approvals'), {recursive: true});
copyFileSync(approval, path.join(root, 'approvals', `${hash}.json`));
