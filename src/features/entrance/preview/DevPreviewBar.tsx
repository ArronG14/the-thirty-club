import type { PreviewMode } from '../domain/environment';
import { PREVIEW_MODES, PREVIEW_PARAM } from './devPreview';

/** DEVELOPMENT ONLY. Rendered behind a static `import.meta.env.DEV` guard. */
export function DevPreviewBar({ mode }: { mode: PreviewMode }) {
  return (
    <nav className="dev-preview" aria-label="Development preview">
      <strong>Dev preview</strong>
      {PREVIEW_MODES.map((entry) => (
        <a
          key={entry.mode}
          href={`/?${PREVIEW_PARAM}=${entry.mode}`}
          aria-current={entry.mode === mode ? 'page' : undefined}
        >
          {entry.label}
        </a>
      ))}
      <a href="/">Exit</a>
    </nav>
  );
}
