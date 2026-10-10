// app/layout.tsx
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

// Applied before paint so a saved "light" choice never flashes as dark first.
// No stored value (or "dark") needs no action: dark is the CSS root default.
const THEME_INIT_SCRIPT = `try {
  if (localStorage.getItem('compass-theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch (e) {}`;

export const metadata = {
  title: 'Zey Compass',
  description: 'Personal Strategic OS - scoring dan prioritas proyek.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
