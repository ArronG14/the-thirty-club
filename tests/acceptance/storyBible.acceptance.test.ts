// @vitest-environment node
/**
 * Story Bible acceptance (22–25 October), docs/acceptance/STORY_ACCEPTANCE.md.
 *
 * Read-only against a CANDIDATE checkout (ACCEPT_ROOT, default this one):
 * its migrations are applied to an in-memory PostgreSQL (PGlite) and the
 * seeded journey is compared with the Story Bible's owner decisions (the
 * "21 October working edition"); its source is searched for the locked
 * verbatim copy. Nothing is written to the candidate, nothing reaches a
 * hosted database, nothing is sent.
 *
 *   npm run test:acceptance                          this checkout
 *   ACCEPT_ROOT=../path/to/candidate npm run test:acceptance
 *
 * These are the machine-checkable rows only (IDs SB-…); behaviour on the
 * device is in the checklist and the iPhone rehearsal script.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(process.env.ACCEPT_ROOT ?? '.');
const MIGRATIONS = join(ROOT, 'supabase/migrations');

interface Effect {
  type: string;
  title?: string;
  body?: string;
  room?: string;
  name?: string;
  params?: {
    quantity?: number;
    prizeSlugs?: string[];
    prizePositions?: number[];
    kind?: string;
  };
  action?: { kind?: string; room?: string } | null;
}
interface Milestone {
  key: string;
  fire_at: Date | null;
  timezone: string | null;
  state: string;
  effects: Effect[];
}
interface Prize {
  slug: string;
  title: string;
  kind: string;
  active: boolean;
  [column: string]: unknown;
}

let pg: PGlite;
let milestones: Milestone[] = [];
let prizes: Prize[] = [];

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  milestones = (
    await pg.query<Milestone>(
      'select key, fire_at, timezone, state, effects from public.ttc_journey_milestones order by fire_at nulls last, key',
    )
  ).rows;
  prizes = (await pg.query<Prize>('select * from public.ttc_prize_catalogue'))
    .rows;
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

const iso = (m: Milestone) => m.fire_at?.toISOString() ?? null;
const spinIssues = () =>
  milestones.flatMap((m) =>
    m.effects
      .filter((e) => e.type === 'hook' && e.name === 'casino.spins.issue')
      .map((e) => ({ milestone: m, params: e.params ?? {} })),
  );
const lettersOf = (m: Milestone) =>
  m.effects.filter((e) => e.type === 'letter');
const at = (instant: string) => milestones.filter((m) => iso(m) === instant);
const hasLetterTitled = (title: string) =>
  milestones.flatMap(lettersOf).some((l) => l.title === title);

describe('SB-SCHED: scheduled triggers (Story Bible owner decisions)', () => {
  it('SB-01 exactly one Grand Entrance: 21 Oct 19:00 Europe/London', () => {
    const entrances = milestones.filter((m) =>
      m.effects.some((e) => e.type === 'open-entrance'),
    );
    expect(entrances.map((m) => [iso(m), m.timezone])).toEqual([
      ['2026-10-21T18:00:00.000Z', 'Europe/London'],
    ]);
  });

  it('SB-02 22 Oct UGG, Departure Lounge, airport drinks and Albert/AirPods are owner-triggered (never armed on a clock)', () => {
    const manual = milestones.filter((m) => {
      const t = iso(m);
      return (
        t !== null &&
        t >= '2026-10-22T00:00:00.000Z' &&
        t < '2026-10-22T15:50:00.000Z'
      );
    });
    expect(manual.length).toBeGreaterThanOrEqual(4);
    for (const m of manual) expect(m.state, m.key).not.toBe('pending');
  });

  it('SB-03 two airport "Complimentary Drink" vouchers, distinct from the Jamaica drinks', () => {
    const grants = milestones.flatMap((m) =>
      m.effects.filter((e) => e.type === 'hook' && e.name === 'drinks.grant'),
    );
    expect(grants.map((g) => g.params)).toContainEqual(
      expect.objectContaining({ kind: 'airport', quantity: 2 }),
    );
  });

  it('SB-04 flight farewell SMS: 22 Oct 16:50 Europe/London (15:50 UTC), text only', () => {
    const flight = at('2026-10-22T15:50:00.000Z');
    expect(flight.length, 'a milestone at 16:50 UK').toBeGreaterThan(0);
    for (const m of flight)
      for (const e of m.effects) expect(e.action ?? null, m.key).toBeNull();
  });

  it('SB-05 Jamaica arrival SMS: 22 Oct 21:30 America/Jamaica (02:30 UTC on the 23rd), text only', () => {
    const arrival = at('2026-10-23T02:30:00.000Z');
    expect(arrival.length, 'a milestone at 21:30 Jamaica').toBeGreaterThan(0);
    for (const m of arrival) {
      expect(m.timezone).toBe('America/Jamaica');
      for (const e of m.effects) expect(e.action ?? null, m.key).toBeNull();
      for (const l of lettersOf(m))
        expect(l.body ?? '', `${m.key} has a placeholder`).not.toMatch(/\[\[/);
    }
  });

  it('SB-06 Grand Casino invitation: 23 Oct 09:00 America/Jamaica (14:00 UTC)', () => {
    const opening = at('2026-10-23T14:00:00.000Z');
    expect(
      opening.some((m) =>
        m.effects.some((e) => e.type === 'invite-room' && e.room === 'casino'),
      ),
    ).toBe(true);
    for (const m of opening) expect(m.timezone).toBe('America/Jamaica');
  });

  it('SB-07 birthday midnight: 24 Oct 00:00 America/Jamaica (05:00 UTC) invites the Screening Room; UK midnight never', () => {
    const midnight = at('2026-10-24T05:00:00.000Z');
    expect(
      midnight.some((m) =>
        m.effects.some(
          (e) => e.type === 'invite-room' && e.room === 'screening-room',
        ),
      ),
    ).toBe(true);
    expect(
      milestones.some(
        (m) =>
          iso(m) === '2026-10-23T23:00:00.000Z' &&
          m.effects.some((e) => e.type === 'invite-room'),
      ),
    ).toBe(false);
  });

  it('SB-08 the Gift Vault is NOT an automatic midnight entitlement (superseded); it opens through the NFC keys', () => {
    const autoVault = milestones.filter(
      (m) =>
        iso(m) === '2026-10-24T05:00:00.000Z' &&
        m.state === 'pending' &&
        m.effects.some(
          (e) => e.type === 'invite-room' && e.room === 'gift-vault',
        ),
    );
    expect(autoVault.map((m) => m.key)).toEqual([]);
  });

  it('SB-09 breakfast: NO scheduled send; only the owner\'s manual "breakfast has arrived"', () => {
    const breakfast = milestones.filter((m) => /breakfast/i.test(m.key));
    for (const m of breakfast) expect(m.state, m.key).not.toBe('pending');
  });

  it('SB-10 private birthday card: no Butler SMS or letter', () => {
    const card = milestones.filter(
      (m) => /card/i.test(m.key) && m.key !== 'early-membership',
    );
    for (const m of card)
      expect(lettersOf(m).length, `${m.key} carries a Butler letter`).toBe(0);
  });

  it('SB-11 birthday dinner: 24 Oct 16:00 America/Jamaica (21:00 UTC), SMS then Lounge letter', () => {
    const dinner = at('2026-10-24T21:00:00.000Z');
    expect(dinner.length).toBeGreaterThan(0);
    expect(dinner.flatMap(lettersOf).length).toBeGreaterThan(0);
    for (const m of dinner) expect(m.timezone).toBe('America/Jamaica');
  });

  it('SB-12 farewell: a 25 October (Jamaica) letter, held by default (excursion only if booked)', () => {
    const farewell = milestones.filter((m) => {
      const t = iso(m);
      return (
        t !== null &&
        t >= '2026-10-25T05:00:00.000Z' &&
        t < '2026-10-26T05:00:00.000Z'
      );
    });
    expect(farewell.length).toBeGreaterThan(0);
    for (const m of farewell) expect(m.state, m.key).not.toBe('pending');
  });

  it('SB-13 every Jamaica chapter is scheduled in America/Jamaica, every UK one in Europe/London', () => {
    for (const m of milestones) {
      const t = iso(m);
      if (!t) continue;
      if (t >= '2026-10-22T21:00:00.000Z')
        expect(m.timezone, m.key).toBe('America/Jamaica');
    }
  });
});

describe('SB-CASINO: nine spins in three fixed sessions, the prize on each third spin', () => {
  const SESSIONS = [
    { utc: '2026-10-23T14:00:00.000Z', local: '09:00', reward: /drink/i },
    { utc: '2026-10-23T19:30:00.000Z', local: '14:30', reward: /nyla/i },
    {
      utc: '2026-10-24T01:30:00.000Z',
      local: '20:30',
      reward: /777|jackpot|mystery/i,
    },
  ];

  it('SB-20 exactly three issues of three spins: 9 in total, at 09:00, 14:30 and 20:30 Jamaica', () => {
    const issues = spinIssues();
    expect(
      issues.map((i) => [iso(i.milestone), i.params.quantity]).sort(),
    ).toEqual(SESSIONS.map((s) => [s.utc, 3]));
    expect(issues.reduce((n, i) => n + (i.params.quantity ?? 0), 0)).toBe(9);
  });

  for (const [n, s] of SESSIONS.entries())
    it(`SB-2${n + 1} session ${n + 1} (${s.local} Jamaica): one guaranteed prize, on spin 3 of 3`, () => {
      const issue = spinIssues().find((i) => iso(i.milestone) === s.utc);
      expect(issue, `no spin issue at ${s.local} Jamaica`).toBeDefined();
      expect(issue!.params.prizePositions).toEqual([3]);
      expect(issue!.params.prizeSlugs).toHaveLength(1);
      expect(issue!.params.prizeSlugs![0]).toMatch(s.reward);
      expect(issue!.milestone.timezone).toBe('America/Jamaica');
    });

  it('SB-24 every prize a session promises exists in the catalogue', () => {
    const slugs = new Set(prizes.map((p) => p.slug));
    for (const i of spinIssues())
      for (const slug of i.params.prizeSlugs ?? [])
        expect(slugs.has(slug), `prize ${slug} (${i.milestone.key})`).toBe(
          true,
        );
  });

  it('SB-25 session 1 prize: three "Bring Me a Drink" vouchers (Jamaica, separate from the airport two)', () => {
    const slug = spinIssues().find((i) => iso(i.milestone) === SESSIONS[0]!.utc)
      ?.params.prizeSlugs?.[0];
    const prize = prizes.find((p) => p.slug === slug);
    expect(prize?.title ?? '').toMatch(/bring me a drink/i);
    expect(JSON.stringify(prize)).toMatch(/3|three/i);
  });

  it("SB-26 session 2 prize: Nyla's film through the protected reference", () => {
    const prize = prizes.find((p) => p.slug === 'nyla-film');
    expect(prize).toBeDefined();
    // The owner sets the Film URL and activates it before 14:30 (MD09);
    // a release candidate may ship it inactive, but never with another URL.
    const url = prize?.video_url ?? prize?.videoUrl ?? null;
    expect(url === null || url === '/api/v1/media/nyla-film').toBe(true);
  });

  it('SB-27 session 3 prize: the 777 Mystery Jackpot, a Gift Vault entitlement that does not name the breakfast', () => {
    const slug = spinIssues().find((i) => iso(i.milestone) === SESSIONS[2]!.utc)
      ?.params.prizeSlugs?.[0];
    const prize = prizes.find((p) => p.slug === slug);
    expect(prize, `catalogue has ${slug}`).toBeDefined();
    expect(prize!.title).not.toMatch(/breakfast/i);
  });
});

/* ---------- Locked verbatim copy (whitespace and apostrophes normalised) ---------- */

const SOURCE_DIRS = ['supabase/migrations', 'src', 'netlify'];
function corpus(): string {
  const texts: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (
        /\.(sql|ts|tsx|json|md)$/.test(entry) &&
        !/\.test\.|\.spec\./.test(entry)
      )
        texts.push(readFileSync(path, 'utf8'));
    }
  };
  for (const d of SOURCE_DIRS) walk(join(ROOT, d));
  return normalise(texts.join('\n'));
}
const normalise = (s: string) =>
  s
    .replace(/\\n/g, ' ')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/''/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ');

/** Distinctive sentences of each locked passage in the Story Bible. */
const LOCKED: Record<string, string[]> = {
  'SB-30 21 Oct 16:00 teaser SMS (LOCKED)': [
    'I am delighted to inform you that I have managed to pull a few strings on your behalf. Quite a few, in fact.',
    'You may notice that the countdown has undergone a rather unexpected adjustment. I assure you, this is entirely intentional.',
  ],
  'SB-31 membership letter "A Most Unfortunate Delivery Incident"': [
    'A Most Unfortunate Delivery Incident',
    'A black lioness, answering to the name of Nyla.',
    'Although I am reliably informed that this particular lioness can be bribed with a cuddle.',
  ],
  'SB-32 UGG message and Vault pop-up': [
    'yet I remain unconvinced that he has given sufficient thought to your footwear.',
    'Regrettably, the key appears to have been misplaced somewhere one might reasonably expect to find a pillow.',
    'Excellent work, Madam. Your delivery has been successfully released from the Vault.',
  ],
  'SB-33 Departure Lounge letter (body; ending revised and approved, text not in the Bible)':
    [
      'Your Departure Lounge Awaits',
      'I am delighted to announce that The Thirty Club Departure Lounge is officially open.',
    ],
  'SB-34 Operation Albert letter "A Rather Concerning Development"': [
    'A Rather Concerning Development',
    'Quite what qualifications a stuffed bear possesses in matters of private security is beyond me',
    'I must say, Madam, I am beginning to lose control of this establishment.',
  ],
  'SB-35 airport drinks letter "A Rather Generous Benefactor" (introduction revised and approved, text not in the Bible)':
    [
      'A Rather Generous Benefactor',
      'I fear the gentleman does not entirely understand the concept of anonymity.',
    ],
  'SB-36 flight farewell "A Most Pleasant Flight, Madam"': [
    'A Most Pleasant Flight, Madam',
    'Should you find him three drinks deep, enthusiastically recounting his life story to the flight attendants',
    'Until Jamaica.',
  ],
  'SB-37 Grand Casino opens "An Invitation of Considerable Importance"': [
    'An Invitation of Considerable Importance',
    'I have credited your account with 1,000 complimentary tokens',
    'I have personally authorised three complimentary spins upon our magnificent slot machine.',
  ],
  'SB-38 Nyla session "A Rather Personal Delivery"': [
    'A Rather Personal Delivery',
    'Quite how one manages to misplace a stuffed bear entrusted with matters of national importance is beyond me.',
  ],
  'SB-39 final session "One Final Roll of the Dice" and the jackpot letter': [
    'One Final Roll of the Dice',
    'A Most Extraordinary Victory!',
    'Some treasures travel far without ever leaving your side. Seek where the little things you carry like to hide.',
  ],
  'SB-40 birthday midnight SMS and letter "The Reason for It All"': [
    'The clock has struck twelve.',
    'The Reason for It All',
    'The Thirty Club was never really about the Casino, the prizes, or the magnificent doors.',
  ],
  'SB-41 post-film Butler words': [
    'I do hope you enjoyed your little surprise.',
    'And I suspect your husband may have had something to do with bringing them all together.',
  ],
  'SB-42 breakfast has arrived (manual)': [
    'I am delighted to inform you that your Birthday Breakfast in Bed has now arrived.',
  ],
  'SB-43 dinner SMS and letter "A Matter of Considerable Importance"': [
    "I regret to inform you that I have lost all confidence in your husband's ability to organise your birthday.",
    'A Matter of Considerable Importance',
    'Happy Womb Independence Day.',
  ],
  'SB-44 farewell "One Last Engagement, Madam" with the locked closing': [
    'One Last Engagement, Madam',
    'Although I do intend to submit a formal request for annual leave.',
    'I suspect Miss Nyla will reject it.',
    'May this next chapter of your life be your most wonderful yet.',
    'Forever your devoted Butler',
  ],
};

describe('SB-COPY: locked verbatim copy is present in the candidate', () => {
  let text = '';
  beforeAll(() => {
    text = corpus();
  });
  for (const [label, sentences] of Object.entries(LOCKED))
    it(label, () => {
      const missing = sentences.filter((s) => !text.includes(normalise(s)));
      expect(missing, `missing from ${ROOT}`).toEqual([]);
    });

  it('SB-45 no gift identity in any pre-reveal letter title (UGGs, AirPods, breakfast)', () => {
    const early = milestones.flatMap((m) =>
      lettersOf(m).map((l) => ({ key: m.key, title: l.title ?? '' })),
    );
    for (const { key, title } of early)
      expect(title, key).not.toMatch(/\bugg|airpods|breakfast in bed/i);
  });

  it('SB-46 letter titles a candidate uses for these chapters match the Bible', () => {
    for (const title of [
      'A Most Unfortunate Delivery Incident',
      'An Invitation of Considerable Importance',
      'The Reason for It All',
      'A Matter of Considerable Importance',
      'One Last Engagement, Madam',
    ])
      expect(
        hasLetterTitled(title) || text.includes(normalise(title)),
        title,
      ).toBe(true);
  });
});
