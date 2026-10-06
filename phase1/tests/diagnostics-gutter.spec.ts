import {test,expect} from './fixtures';
import {showCode} from './helpers';

const broken='<html lang="en">\n<head>\n<title>Gutter diagnostics</title>\n<link rel="stylesheet" href="missing.css">\n</head>\n<body>\n<h1>Diagnostics example</h1>\n<img src="hero.png">\n<div><span>Broken nesting</div>\n</body>\n</html>';
test('gutter matches Problems, prioritizes errors, shows hover messages, and clears after edits',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('somnia.theme','dark');localStorage.setItem('somnia.themeChoice','dark');});
 await page.goto('/');await showCode(page);
 const code=page.getByLabel('Source code');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(broken);
 const warnings=page.locator('.cm-lint-marker-warning'),errors=page.locator('.cm-lint-marker-error');
 await expect(warnings.first()).toBeVisible();await expect(errors.first()).toBeVisible();
 // Line 4: missing stylesheet, line 8: image alt, line 9: syntax error
 // and missing closing tag, aggregated by CodeMirror into one error marker.
 const rows=page.locator('.cm-gutter-lint .cm-gutterElement');
 await expect(rows.locator('.cm-lint-marker')).toHaveCount(3);
 const numbered=page.locator('.cm-lineNumbers .cm-gutterElement');
 for(const [line,marker] of [[4,warnings.nth(0)],[8,warnings.nth(1)],[9,errors.nth(0)]] as const){
  const icon=await marker.boundingBox(),number=await numbered.filter({hasText:new RegExp(`^${line}$`)}).boundingBox();
  expect(icon).not.toBeNull();expect(number).not.toBeNull();
  expect(Math.abs(icon!.y+icon!.height/2-number!.y-number!.height/2)).toBeLessThan(3);
 }
 await warnings.first().hover();await expect(page.locator('.cm-tooltip-lint')).toContainText('Stylesheet not found in the project: missing.css');
 await page.getByRole('button',{name:'Toggle problems',exact:true}).click();
 await expect(page.getByTestId('problems-panel')).toContainText('Stylesheet not found in the project: missing.css');
 await expect(page.getByTestId('problems-panel')).toContainText('Image has no alt attribute');
 await expect(page.getByTestId('problems-panel')).toContainText('Syntax problem here');
 await errors.first().hover();await expect(page.locator('.cm-tooltip-lint')).toContainText('Syntax problem here');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.screenshot({path:'test-results/evidence-somnia-diagnostics-gutter-dark.png'});
 await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText('<html lang="en"><head><title>Clean</title></head><body><h1>Clean</h1></body></html>');
 await expect(page.locator('.cm-lint-marker')).toHaveCount(0);
 await expect(page.getByTestId('problems-count')).toContainText('No problems');
});
test('switching files does not retain other-file markers, including with line numbers off',async({page})=>{
 await page.goto('/');await showCode(page);
 const code=page.getByLabel('Source code');await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(broken);
 await expect(page.locator('.cm-lint-marker-error').first()).toBeVisible();
 await page.getByRole('button',{name:'Files panel'}).click();await page.getByRole('button',{name:'Open styles.css'}).click();
 await expect(page.locator('.cm-lint-marker')).toHaveCount(0);
 await page.getByRole('tab',{name:'index.html'}).click();
 await expect(page.locator('.cm-lint-marker-error').first()).toBeVisible();
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Code editor',exact:true}).click();
 await page.getByLabel('Show line numbers').uncheck();await page.keyboard.press('Escape');
 await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);
 await expect(page.locator('.cm-lint-marker-error').first()).toBeVisible();
});

test('existing project dependencies do not produce reference warnings after changes',async({page})=>{
 await page.goto('/');await showCode(page);
 const code=page.getByLabel('Source code');await code.click();await page.keyboard.press('Control+a');
 await page.keyboard.insertText('<link rel="stylesheet" href="styles.css">');
 await expect(page.locator('.cm-lint-marker')).toHaveCount(0);
 await page.getByRole('button',{name:'Files panel'}).click();await page.getByRole('button',{name:'Open styles.css'}).click();
 await code.click();await page.keyboard.press('Control+a');await page.keyboard.insertText('h1 { color: red; }');
 await page.getByRole('tab',{name:'index.html'}).click();
 await expect(page.locator('.cm-lint-marker')).toHaveCount(0);
});
