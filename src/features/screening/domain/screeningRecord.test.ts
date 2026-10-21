import { beforeEach, describe, expect, it } from 'vitest';
import { BIRTHDAY_FILM, resolveFilm, TEST_FILM } from '../config/screeningFilm';
import {
  freshRecord,
  loadRecord,
  parseRecord,
  resumeSeconds,
  returning,
  saveRecord,
  SCREENING_KEY,
  screeningReducer,
  screeningStatus,
  type ScreeningAction,
  type ScreeningRecord,
} from './screeningRecord';
import { arrivalLine, endLine, SCREENING_LINES } from './screeningScript';

const AT = '2026-10-24T05:10:00.000Z';
const LATER = '2026-10-24T06:10:00.000Z';
const FILM = 'film-a';
const run = (...actions: ScreeningAction[]) =>
  actions.reduce(screeningReducer, freshRecord());

describe('screening record', () => {
  beforeEach(() => localStorage.clear());

  it('reads the retired message-collection record (v1) and corrupt data as a fresh room', () => {
    expect(
      parseRecord(JSON.stringify({ version: 1, started: true, watched: [] })),
    ).toEqual(freshRecord());
    expect(parseRecord('{not json')).toEqual(freshRecord());
    expect(parseRecord(null)).toEqual(freshRecord());
  });

  it('round-trips through storage and repairs invalid fields', () => {
    const record: ScreeningRecord = {
      ...freshRecord(),
      enteredAt: AT,
      plays: 2,
      resume: { filmId: FILM, seconds: 3.2 },
    };
    expect(saveRecord(record)).toBe(true);
    expect(loadRecord()).toEqual(record);
    localStorage.setItem(
      SCREENING_KEY,
      JSON.stringify({
        version: 2,
        enteredAt: 'yesterday-ish',
        plays: -4,
        completions: 1.5,
        resume: { filmId: FILM, seconds: Number.NaN },
      }),
    );
    expect(loadRecord()).toEqual(freshRecord());
  });

  it('distinguishes never entered, entered, started, interrupted and completed', () => {
    expect(screeningStatus(freshRecord(), FILM)).toBe('never-entered');
    const entered = run({ type: 'enter', at: AT });
    expect(screeningStatus(entered, FILM)).toBe('entered');
    const started = screeningReducer(entered, { type: 'start', at: AT });
    expect(screeningStatus(started, FILM)).toBe('started');
    const interrupted = screeningReducer(started, {
      type: 'position',
      filmId: FILM,
      seconds: 2.5,
      duration: 5,
    });
    expect(screeningStatus(interrupted, FILM)).toBe('interrupted');
    expect(resumeSeconds(interrupted, FILM)).toBe(2.5);
    // A different (replaced) film starts afresh.
    expect(resumeSeconds(interrupted, 'film-b')).toBeNull();
    const completed = screeningReducer(interrupted, {
      type: 'complete',
      at: LATER,
    });
    expect(screeningStatus(completed, FILM)).toBe('completed');
    expect(completed.resume).toBeNull();
    expect(returning(freshRecord())).toBe(false);
    expect(returning(entered)).toBe(true);
  });

  it('keeps the first visit, introduction and completion stamps; counts every completion', () => {
    let record = run(
      { type: 'enter', at: AT },
      { type: 'introduced', at: AT },
      { type: 'complete', at: AT },
    );
    record = [
      { type: 'enter', at: LATER },
      { type: 'introduced', at: LATER },
      { type: 'start', at: LATER },
      { type: 'complete', at: LATER },
    ].reduce((r, a) => screeningReducer(r, a as ScreeningAction), record);
    expect(record).toMatchObject({
      enteredAt: AT,
      introducedAt: AT,
      completedAt: AT,
      completions: 2,
      plays: 1,
    });
  });

  it('only keeps a place worth resuming', () => {
    const at = (seconds: number, duration = 5) =>
      run({ type: 'position', filmId: FILM, seconds, duration }).resume;
    expect(at(0.4)).toBeNull();
    expect(at(4.6)).toBeNull();
    expect(at(2)).toEqual({ filmId: FILM, seconds: 2 });
    // Duration unknown (metadata not loaded) still keeps the place.
    expect(at(40, Number.NaN)).toEqual({ filmId: FILM, seconds: 40 });
    // A same-value update returns the same object (no re-render, no write).
    const kept = run({
      type: 'position',
      filmId: FILM,
      seconds: 2,
      duration: 5,
    });
    expect(
      screeningReducer(kept, {
        type: 'position',
        filmId: FILM,
        seconds: 2,
        duration: 5,
      }),
    ).toBe(kept);
  });
});

describe('the Butler in the screening room', () => {
  it('gives the full introduction once, then a short welcome', () => {
    expect(
      arrivalLine({
        hasFilm: true,
        introduced: false,
        status: 'never-entered',
      }),
    ).toBe(SCREENING_LINES.introduction);
    expect(
      arrivalLine({ hasFilm: true, introduced: true, status: 'completed' }),
    ).toBe(
      'Welcome back, Madam. Your private screening is ready whenever you wish.',
    );
    expect(
      arrivalLine({ hasFilm: true, introduced: true, status: 'interrupted' }),
    ).toBe(SCREENING_LINES.welcomeBackResume);
    expect(
      arrivalLine({ hasFilm: false, introduced: false, status: 'entered' }),
    ).toBe(SCREENING_LINES.preparing);
  });

  it('closes the first screening, and greets an encore differently', () => {
    expect(endLine(true)).toBe(SCREENING_LINES.closing);
    expect(endLine(false)).toBe(SCREENING_LINES.encore);
  });
});

describe('the film configuration', () => {
  it('keeps LIVE safely unconfigured until the birthday film is supplied', () => {
    expect(BIRTHDAY_FILM).toBeNull();
    expect(resolveFilm(false)).toBeNull();
    expect(resolveFilm(true)).toBe(TEST_FILM);
  });

  it('presents a valid birthday film everywhere, and never the test film to Alise', () => {
    const final = {
      id: 'thirty-years-of-alise-v1',
      title: 'Thirty Years of Alise',
      src: '/media/screening/thirty-years-of-alise-v1.mp4',
      type: 'video/mp4' as const,
      kind: 'birthday' as const,
    };
    expect(resolveFilm(false, final)).toBe(final);
    expect(resolveFilm(true, final)).toBe(final);
    expect(
      resolveFilm(false, { ...final, src: 'https://media.example/film.mp4' }),
    ).not.toBeNull();
    // Mislabelled or insecure sources are refused in LIVE.
    expect(resolveFilm(false, { ...final, kind: 'test' })).toBeNull();
    expect(
      resolveFilm(false, { ...final, src: 'http://media.example/film.mp4' }),
    ).toBeNull();
    expect(
      resolveFilm(false, { ...final, src: '//media.example/film.mp4' }),
    ).toBeNull();
  });

  it('points the test film at a real MP4 in the public media folder', () => {
    expect(TEST_FILM).toMatchObject({
      src: '/media/screening/screening-test-5s.mp4',
      type: 'video/mp4',
      kind: 'test',
      durationSeconds: 5,
    });
  });
});
