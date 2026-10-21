/**
 * "A word with the Butler": the one composer for every place Alise may
 * write to him (from the service bell, or at the foot of a letter). The
 * caller supplies `send`; the composer keeps one idempotency key per
 * composed message, so a retry after a timeout is the same message.
 *
 * Its confirmation is truthful: the words are recorded and will be put
 * before Arron. Nothing claims the request has been fulfilled.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { REPLY_MAX_LENGTH } from '../../../shared/correspondence/templates';
import { newIdempotencyKey } from '../../concierge/client/api';
import {
  failureText,
  type DeskResult,
} from '../../correspondence/client/correspondenceApi';
import { WORD_PROMPT } from '../../correspondence/domain/butlerLines';
import { deviceStorage } from '../../rehearsal/storage';

const DRAFT_KEY = 'thirty-club:butler:word-draft';
function savedDraft(): { draft: string; key: string } {
  try {
    const saved = JSON.parse(deviceStorage().getItem(DRAFT_KEY) ?? 'null') as {
      draft?: unknown;
      key?: unknown;
    } | null;
    if (
      saved &&
      typeof saved.draft === 'string' &&
      typeof saved.key === 'string'
    )
      return { draft: saved.draft.slice(0, REPLY_MAX_LENGTH), key: saved.key };
  } catch {
    /* A corrupt draft cannot prevent a new request. */
  }
  return { draft: '', key: newIdempotencyKey() };
}

export interface RequestComposerProps {
  send(body: string, key: string): Promise<DeskResult<unknown>>;
  /** Called after the server (or rehearsal) has recorded the words. */
  onSent(body: string): void;
  onCancel(): void;
  prompt?: string;
  cancelLabel?: string;
  /** Rehearsal: shown above the field so nobody mistakes it for the real thing. */
  note?: string | undefined;
}

export function RequestComposer({
  send,
  onSent,
  onCancel,
  prompt = WORD_PROMPT,
  cancelLabel = 'Never mind',
  note,
}: RequestComposerProps) {
  const [saved] = useState(savedDraft);
  const [draft, setDraft] = useState(saved.draft);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [key, setKey] = useState(saved.key);
  const field = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const countId = useId();
  useEffect(() => {
    try {
      deviceStorage().setItem(DRAFT_KEY, JSON.stringify({ draft, key }));
    } catch {
      /* The server still deduplicates this mounted request. */
    }
  }, [draft, key]);

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const words = draft.trim();
    if (!words || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await send(words, key);
    setBusy(false);
    if (!result.ok) {
      setProblem(failureText(result));
      return;
    }
    setDraft('');
    setKey(newIdempotencyKey());
    onSent(words);
  }

  return (
    <form className="cd-word" onSubmit={(e) => void submit(e)}>
      <p className="cd-word__prompt">{prompt}</p>
      {note && <p className="cd-butler__preview">{note}</p>}
      <label htmlFor={fieldId} className="sr-only">
        Your message to the Butler
      </label>
      <textarea
        id={fieldId}
        ref={field}
        className="cd-word__field"
        value={draft}
        maxLength={REPLY_MAX_LENGTH}
        rows={5}
        aria-describedby={countId}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write to the Butler…"
      />
      <p id={countId} className="cd-word__count">
        {REPLY_MAX_LENGTH - draft.length} characters remaining
      </p>
      {problem && (
        <p className="cd-butler__problem" role="alert">
          {problem}
        </p>
      )}
      <div className="cd-word__actions">
        <button
          type="submit"
          className="cd-button"
          disabled={busy || draft.trim().length === 0}
        >
          {busy ? 'Handing it over…' : 'Hand it to the Butler'}
        </button>
        <button
          type="button"
          className="cd-button cd-button--quiet"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}
