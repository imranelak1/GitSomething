import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const snapshot = () => window.matchMedia(query).matches;
const subscribe = (update: () => void) => {
  const preference = window.matchMedia(query);
  preference.addEventListener('change', update);
  return () => preference.removeEventListener('change', update);
};

/** Motion's current hook takes a mount-time snapshot; this also follows changes. */
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
