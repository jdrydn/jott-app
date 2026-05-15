import type { ProfileTheme } from '@backend/db/schema';
import { useEffect } from 'react';

export function useApplyTheme(theme: ProfileTheme | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    const resolved: ProfileTheme = theme ?? 'system';

    function apply(): void {
      const dark =
        resolved === 'dark' ||
        (resolved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', dark);
      root.dataset.theme = dark ? 'dark' : 'light';
    }

    apply();

    if (resolved !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
