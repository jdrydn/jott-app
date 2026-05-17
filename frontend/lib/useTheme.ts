import type { ProfileTheme } from '@backend/db/schema';
import { useEffect } from 'react';

// Cache key read by the inline boot script in frontend/index.html. Keep these
// in sync — the script needs to apply the same logic before React mounts.
const THEME_CACHE_KEY = 'jott:theme';

export function applyTheme(theme: ProfileTheme | undefined): void {
  const root = document.documentElement;
  const resolved: ProfileTheme = theme ?? 'system';
  try {
    localStorage.setItem(THEME_CACHE_KEY, resolved);
  } catch {
    // localStorage unavailable (private mode, sandbox) — boot script will fall
    // back to 'system' on next load. No-op here.
  }
  const dark =
    resolved === 'dark' ||
    (resolved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
}

export function useApplyTheme(theme: ProfileTheme | undefined): void {
  useEffect(() => {
    // undefined = "not ready yet" (e.g. profile still loading). Don't touch
    // the DOM — the inline boot script in index.html has already applied the
    // cached value; overriding here would cause a flash until profile resolves.
    if (theme === undefined) return;
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (): void => applyTheme(theme);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);
}
