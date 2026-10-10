'use client';

// components/theme-toggle.tsx
// Dark is the default theme (app/globals.css); this toggles a persisted
// override. The blocking script in app/layout.tsx already applies the saved
// theme before paint, so there is no flash of the wrong theme - the only
// thing that lags by one client render is this button's own icon, corrected
// in the effect below once we can read localStorage. That one-frame lag
// never causes a hydration mismatch, because the server-rendered icon and
// this component's first client render both start from the same 'dark'
// assumption.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

const STORAGE_KEY = 'compass-theme';
type Theme = 'dark' | 'light';

function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  const toggle = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or storage disabled: theme just won't persist.
    }
  };

  return (
    <Button variant="ghost" onClick={toggle} aria-label="Ganti tema" title="Ganti tema">
      {theme === 'dark' ? '\u2600\uFE0F' : '\u{1F319}'}
    </Button>
  );
}
