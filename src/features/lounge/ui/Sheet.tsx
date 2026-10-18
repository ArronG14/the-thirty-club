import { useEffect, useRef, type PropsWithChildren } from 'react';

/**
 * A modal panel within the lounge. The rest of the room is made inert by
 * the caller while it is open; focus moves in, and returns on close.
 */
export function Sheet({
  title,
  label,
  variant,
  returnFocusTo,
  onClose,
  children,
}: PropsWithChildren<{
  title: string;
  /** Visible eyebrow above the title. */
  label?: string;
  variant: 'card' | 'directory';
  /** Where focus goes on close. Safari does not focus buttons on click. */
  returnFocusTo?: HTMLElement | null;
  onClose(): void;
}>) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener =
      returnFocusTo ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose, returnFocusTo]);

  const id = `sheet-${variant}`;
  return (
    <div className="sheet" data-variant={variant}>
      <div className="sheet__scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        {label && <p className="sheet__label">{label}</p>}
        <h2 id={id} className="sheet__title">
          {title}
        </h2>
        {children}
        <button type="button" className="sheet__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
