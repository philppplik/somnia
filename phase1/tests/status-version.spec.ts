import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
import {formatAppRelease} from '../src/lib/appRelease';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
test('status pill shows product release rather than active file type',async({page})=>{
 await page.goto('/');
 await expect(page.getByTestId('app-version-pill')).toHaveText(formatAppRelease(release));
 await expect(page.getByTestId('app-version-pill')).toBeVisible();
 await page.screenshot({path:'test-results/status-version-pill.png'});
});
