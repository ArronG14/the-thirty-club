import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MemberLetter } from '../../shared/concierge/types';
import {
  INVITATION_TEMPLATES,
  THANKS_RESPONSE,
} from '../../shared/correspondence/templates';
import { deliveryText, smsText } from '../butlers-office/deskText';
import { collectionLine } from './domain/butlerLines';
import { paragraphs } from './domain/format';
import { LetterPresentation } from './ui/LetterPresentation';

const letter: MemberLetter = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'A letter for Sunday',
  salutation: 'Dearest Alise,',
  body: 'First line\nsame paragraph.\n\nSecond paragraph.',
  timezone: 'America/Jamaica',
  deliveredAt: '2026-10-25T14:00:00Z',
  openedAt: null,
  thankedAt: null,
  status: 'published',
  replies: [],
};

describe('the Butler’s words', () => {
  it('speaks of one letter and of several naturally', () => {
    expect(collectionLine(1, 3)).toContain('One letter awaits');
    expect(collectionLine(3, 3)).toContain('3 letters await');
    expect(collectionLine(0, 2)).toContain('Every letter has been read');
    expect(collectionLine(0, 0)).toContain('Nothing has arrived');
  });

  it('carries the canonical link in every invitation and none in the thanks', () => {
    for (const text of Object.values(INVITATION_TEMPLATES)) {
      expect(text).toContain('https://30.ag14.co');
      expect(text.length).toBeLessThanOrEqual(1600);
    }
    expect(THANKS_RESPONSE).toMatch(/^Madam, how exceedingly kind/);
  });

  it('never reports a queued SMS as sent', () => {
    const sms = {
      id: 'x',
      state: 'approved' as const,
      attempts: 0,
      sendAt: null,
      providerSid: null,
      lastError: null,
    };
    expect(smsText(sms, false)).toBe(
      'Queued, not sent — SMS sending is switched off',
    );
    expect(smsText(sms, true)).toMatch(/^Queued/);
    expect(smsText({ ...sms, state: 'accepted' }, true)).toContain(
      'not yet confirmed',
    );
    expect(smsText(null, true)).toBe('Not queued');
  });

  it('shows Jamaica deliveries with their UK equivalent', () => {
    expect(deliveryText('2026-10-20T14:00:00Z', 'America/Jamaica')).toMatch(
      /09:00 Jamaica time \(15:00 UK\)$/,
    );
    expect(deliveryText('2026-10-20T14:00:00Z', 'Europe/London')).toMatch(
      /15:00 UK time$/,
    );
  });

  it('keeps paragraphs and line breaks as written', () => {
    expect(paragraphs(letter.body)).toEqual([
      ['First line', 'same paragraph.'],
      ['Second paragraph.'],
    ]);
  });
});

describe('the letter', () => {
  it('opens by hand and reports the opening once', () => {
    let opened = 0;
    render(<LetterPresentation letter={letter} onOpen={() => opened++} />);
    const envelope = screen.getByRole('button', { name: /Break the seal/ });
    fireEvent.click(envelope);
    fireEvent.click(envelope);
    expect(opened).toBe(1);
  });

  it('goes straight to the page when already opened, and the preview records nothing', () => {
    render(
      <LetterPresentation
        letter={{ ...letter, openedAt: '2026-10-25T15:00:00Z' }}
        preview
      />,
    );
    // A preview always starts sealed, so the owner sees the ceremony.
    expect(screen.getByRole('button', { name: /Break the seal/ })).toBeTruthy();
  });

  it('shows an opened letter with the Butler at the foot of the page', () => {
    render(
      <LetterPresentation
        letter={{ ...letter, openedAt: '2026-10-25T15:00:00Z' }}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'A letter for Sunday' }),
    ).toBeTruthy();
    expect(screen.getByText('Dearest Alise,')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A Word, Butler' }));
    expect(screen.getByText(/You have my undivided attention/)).toBeTruthy();
    expect(
      screen
        .getByLabelText('Your message to the Butler')
        .getAttribute('maxlength'),
    ).toBe('1000');
  });
});
