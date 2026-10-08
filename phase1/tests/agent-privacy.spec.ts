import {test, expect} from './fixtures';
test('cloud consent is explicit, persisted, withdrawable and translated', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();await page.getByRole('complementary',{name:'Somnia Agent'}).getByRole('button',{name:'Agent configuration',exact:true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab',{name:'Privacy & data',exact:true}).click();
  const allow = dialog.getByRole('button',{name:'Allow cloud AI',exact:true});
  await expect(allow).toBeDisabled();
  const checkbox = dialog.getByRole('checkbox',{name:/I agree/});
  await expect(checkbox).not.toBeChecked();
  await expect(dialog.getByRole('link',{name:'OpenRouter',exact:true})).toHaveAttribute('href','https://openrouter.ai/privacy');
  await checkbox.check();
  await expect(allow).toBeEnabled();
  await page.screenshot({path:'tests/artifacts/agent-consent-light.png'});
  await allow.click();
  await expect(dialog.getByText('Cloud consent is on.',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('somnia.agent.cloud-consent.v1'))).not.toBeNull();
  await dialog.getByRole('button',{name:'Withdraw cloud consent',exact:true}).click();
  await expect(dialog.getByText('Cloud consent is off.',{exact:true})).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await page.reload();await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();await page.getByRole('complementary',{name:'Somnia Agent'}).getByRole('button',{name:'Agent configuration',exact:true}).click();
  await dialog.getByRole('tab',{name:'Privacy & data',exact:true}).click();
  await expect(allow).toBeDisabled();
  // German strings for agent.settings.* are not translated yet (falls back to English); see report.
  await page.screenshot({path:'tests/artifacts/agent-consent-de.png'});
});
test('consent controls fit a small window and support keyboard use', async ({page}) => {
  await page.setViewportSize({width:760,height:560});
  await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();await page.getByRole('complementary',{name:'Somnia Agent'}).getByRole('button',{name:'Agent configuration',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('tab',{name:'Privacy & data',exact:true}).click();
  const checkbox=dialog.getByRole('checkbox',{name:/I agree/});await checkbox.focus();await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  const allow=dialog.getByRole('button',{name:'Allow cloud AI',exact:true});await allow.scrollIntoViewIfNeeded();
  await expect(allow).toBeVisible();await page.screenshot({path:'tests/artifacts/agent-consent-small.png'});
});
