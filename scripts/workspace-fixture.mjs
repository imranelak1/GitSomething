// Browser checks opt into the practice workspace explicitly. A fresh launch
// stays on Home, so loading Monaco is an action taken by the test, not the app.
export async function enterDemoWorkspace(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('.monaco-diff-editor') ||
      [...document.querySelectorAll('button')].some(
        (button) => button.getAttribute('aria-label') === 'Try demo workspace',
      ),
    null,
    { timeout: 45_000 },
  );
  const demo = page.getByRole('button', { name: 'Try demo workspace', exact: true });
  if (await demo.isVisible()) await demo.click();
  await page.locator('.monaco-diff-editor').waitFor({ state: 'visible', timeout: 45_000 });
}

export async function openGuideFromHome(page) {
  await page.getByRole('button', { name: 'Open getting started guide', exact: true }).click();
  await page.locator('.onboarding-dialog').waitFor({ state: 'visible' });
}
