import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('./', import.meta.url));
export interface RenderFixture {
  id: string; category: string; entry: string; scripts: boolean;
  viewports: Array<{width: number; height: number}>;
  selectors: string[]; readySelector?: string; readyText?: string;
}
export const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as {version: number; fixtures: RenderFixture[]};
export function projectFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const folder of ['pages', 'assets']) {
    for (const name of readdirSync(path.join(root, folder))) {
      if (/\.(html|css|js|svg)$/.test(name)) files[`${folder}/${name}`] = readFileSync(path.join(root, folder, name), 'utf8');
    }
  }
  return files;
}
export const fontData = `data:font/ttf;base64,${readFileSync(path.join(root, 'assets/DejaVuSans.ttf')).toString('base64')}`;
