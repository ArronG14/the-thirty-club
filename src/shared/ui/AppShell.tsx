import type { PropsWithChildren } from 'react';
import { PwaStatus } from '../pwa/PwaStatus';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="eyebrow">A membership of one</header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-center py-16">
        {children}
      </main>
      <footer>
        <PwaStatus />
      </footer>
    </div>
  );
}
