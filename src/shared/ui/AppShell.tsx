import type { PropsWithChildren } from 'react';
import { PwaStatus } from '../pwa/PwaStatus';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="app-footer">
        <PwaStatus />
      </footer>
    </div>
  );
}
