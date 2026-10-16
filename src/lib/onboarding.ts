export const GUIDE_STORAGE_KEY = 'branchline.guide.v1';

export function shouldShowGuide(): boolean {
  try {
    return localStorage.getItem(GUIDE_STORAGE_KEY) !== 'seen';
  } catch {
    return true;
  }
}

export function rememberGuide(): void {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, 'seen');
  } catch {
    /* Private browsing can disable storage; the guide still works. */
  }
}
