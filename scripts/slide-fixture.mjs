import { expect } from '@playwright/test';

// Moving the handle is deliberately separate from confirming the action. End
// alone must never publish: these tests use the same two-step keyboard path as
// someone operating the accessible slider without a pointer.
export async function confirmSlide(page, name = 'Slide to create & push') {
  const slider = page.getByRole('slider', { name, exact: true });
  await expect(slider).toBeVisible();
  await expect(slider).not.toHaveAttribute('aria-disabled', 'true');
  await slider.focus();
  await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
  await slider.press('Enter');
}
