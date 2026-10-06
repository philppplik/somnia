import {test,expect} from './fixtures';
import {open as openMenu} from './collabHelpers';
test('LAN-Direct says it needs the desktop app in the browser',async({page})=>{
 await page.goto('/');await openMenu(page,'Share project...');
 await page.getByRole('button',{name:'LAN-Direct',exact:true}).click();
 await expect(page.getByTestId('lan-needs-desktop')).toBeVisible();
 await expect(page.getByRole('button',{name:'Start sharing'})).toBeDisabled();});
test('relay address is validated and plain ws:// to a remote host is flagged',async({page})=>{
 await page.goto('/');await openMenu(page,'Share project...');
 const start=page.getByRole('button',{name:'Start sharing'});await expect(start).toBeDisabled();
 await page.getByLabel('Relay address').fill('not a url');await expect(page.getByTestId('relay-invalid')).toBeVisible();await expect(start).toBeDisabled();
 await page.getByLabel('Relay address').fill('ws://relay.example.com');await expect(page.getByTestId('relay-insecure')).toBeVisible();await expect(start).toBeEnabled();
 await page.getByLabel('Relay address').fill('ws://127.0.0.1:8787');await expect(page.getByTestId('relay-insecure')).toHaveCount(0);});
test('join validates the link and warns when it has no key',async({page})=>{
 await page.goto('/');await openMenu(page,'Join shared project...');
 const join=page.getByRole('button',{name:'Join',exact:true});await expect(join).toBeDisabled();
 await page.getByLabel('Invite link').fill('hello');await expect(page.getByTestId('link-invalid')).toBeVisible();await expect(join).toBeDisabled();
 await page.getByLabel('Invite link').fill('wss://relay.example.com/room/abcdefghijklmnopqrstuvwx');await expect(join).toBeEnabled();await expect(page.getByTestId('join-no-key')).toBeVisible();
 await page.getByLabel('Invite link').fill('wss://relay.example.com/room/abcdefghijklmnopqrstuvwx#key='+'A'.repeat(43));await expect(page.getByTestId('join-no-key')).toHaveCount(0);});
test('an unreachable relay ends in an honest error, not a connected state',async({page})=>{
 await page.goto('/');await openMenu(page,'Share project...');
 await page.getByLabel('Relay address').fill('ws://127.0.0.1:9');await page.getByRole('button',{name:'Start sharing'}).click();
 await expect(page.getByTestId('host-error')).toBeVisible({timeout:60000});
 await expect(page.getByTestId('host-error')).toContainText(/Could not reach|Could not start/);
 await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByTestId('collab-status')).toHaveCount(0);});
test.describe('no project',()=>{
 test.use({sample:false});
 test('sharing without a project explains why nothing starts',async({page})=>{
  await page.goto('/');await openMenu(page,'Share project...');
  await page.getByLabel('Relay address').fill('ws://127.0.0.1:8787');await page.getByRole('button',{name:'Start sharing'}).click();
  await expect(page.getByTestId('host-error')).toContainText('Open a project first');});});
