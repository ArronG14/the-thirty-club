import { useState } from 'react';
import { DEV_LINK_GROUPS } from './devLinks';
import './devMenu.css';

/**
 * DEVELOPMENT ONLY. A floating shortcut menu for testing every built room.
 * It is mounted from `src/main.tsx` behind a static `import.meta.env.DEV`
 * guard, so production bundles never contain it. To remove it, delete
 * `src/dev/` and the three marked lines in `src/main.tsx`.
 */
export default function DevMenu() {
  const [open, setOpen] = useState(false);
  const here = window.location.pathname + window.location.search;
  return (
    <div className="dev-menu" data-testid="dev-menu">
      <button
        type="button"
        className="dev-menu__toggle"
        aria-expanded={open}
        aria-controls="dev-menu-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : 'Dev'}
      </button>
      {open && (
        <nav
          id="dev-menu-panel"
          className="dev-menu__panel"
          aria-label="Developer navigation"
        >
          <p className="dev-menu__warning">
            Developer tool. Previews use a shifted clock and never change the
            saved membership.
          </p>
          {DEV_LINK_GROUPS.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      aria-current={link.href === here ? 'page' : undefined}
                    >
                      {link.label}
                      {link.note && <small> {link.note}</small>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </div>
  );
}
