import { useEffect, useRef } from 'react';
import type { VideoMessage } from '../domain/videoMessages';
export function MessageList({
  messages,
  selected,
  watched,
  onSelect,
  onClose,
}: {
  messages: readonly VideoMessage[];
  selected: number;
  watched: readonly string[];
  onSelect(index: number): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="cinema-collection"
      aria-labelledby="collection-title"
      onCancel={onClose}
    >
      <div className="cinema-collection__header">
        <div>
          <p className="cinema__eyebrow">The private collection</p>
          <h2 id="collection-title">An audience of your own.</h2>
        </div>
        <button onClick={onClose} aria-label="Close collection">
          Close
        </button>
      </div>
      <p>Every message, whenever you wish.</p>
      <ol>
        {messages.map((message, index) => (
          <li
            key={message.id}
            aria-current={index === selected ? 'true' : undefined}
          >
            {message.poster ? (
              <img src={message.poster} alt="" loading="lazy" />
            ) : (
              <span className="cinema-collection__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
            )}
            <div>
              <h3>{message.sender}</h3>
              <p>
                {index === selected ? 'Selected · ' : ''}
                {watched.includes(message.id) ? 'Watched' : 'Not yet watched'}
              </p>
            </div>
            <button
              onClick={() => onSelect(index)}
              aria-label={`Play message from ${message.sender}`}
            >
              Play
            </button>
          </li>
        ))}
      </ol>
    </dialog>
  );
}
