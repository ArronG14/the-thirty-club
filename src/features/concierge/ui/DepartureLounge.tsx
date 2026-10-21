import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { browserConciergeDeps } from '../client/deps';
import type { PrivilegeId } from '../domain/catalogue';
import { knownSchedule, type LoungePhase } from '../domain/lounge';
import {
  boardTime,
  describeCountdown,
  describeInstant,
  UK_ZONE,
} from '../domain/time';
import {
  useConcierge,
  type ConciergeDeps,
  type ConciergeModel,
} from '../useConcierge';
import { BoardingPass } from './BoardingPass';
import { CredentialRequest } from './CredentialRequest';
import { ConciergeLetter, PaperSheet } from './Paper';
import { PrivilegeCard } from './PrivilegeCard';
import { PrivilegeEnvelope } from './PrivilegeEnvelope';
import { SplitFlapBoard } from './SplitFlapBoard';
import './departure.css';
import { DepartureWelcome, useDepartureWelcome } from './DepartureWelcome';

function boardRemarks(model: ConciergeModel): string {
  const schedule = knownSchedule(model.state);
  switch (model.phase) {
    case 'closed':
      return `Opens ${boardTime(schedule.departureOpensAt, UK_ZONE)}`;
    case 'credential':
      return 'Awaiting papers';
    case 'open':
      if (model.now >= schedule.privileges['jamaica-arrival']) return 'Arrived';
      if (model.now >= schedule.privileges['in-flight']) return 'In flight';
      return 'Now boarding';
  }
}

function ConnectionNote({ model }: { model: ConciergeModel }) {
  if (model.connection === 'offline') {
    return (
      <p className="departure__note" role="status">
        You are offline. The lounge is shown as it was when last seen.
      </p>
    );
  }
  if (model.connection === 'unavailable') {
    return (
      <p className="departure__note" role="status">
        The concierge service cannot be reached just now. Please try again
        shortly.
      </p>
    );
  }
  return null;
}

function Closed({ model }: { model: ConciergeModel }) {
  const opensAt = knownSchedule(model.state).departureOpensAt;
  return (
    <div className="closed">
      <ConciergeLetter
        greeting="Madam,"
        paragraphs={[
          'Your membership has been approved.',
          'While the doors of The Thirty Club remain closed until your birthday, certain privileges have been arranged for your journey.',
          'Your Departure Lounge will be ready to receive you on Thursday at two o’clock.',
        ]}
        signOff="We shall be in touch."
      />
      <p className="availability">
        <span className="availability__label">The Departure Lounge opens</span>
        <span className="availability__when">
          {describeInstant(opensAt, UK_ZONE)}
        </span>
        <span className="availability__left">
          In {describeCountdown(model.now, opensAt)}
        </span>
      </p>
    </div>
  );
}

/**
 * The boarding pass is issued: shown once, when the credential has just
 * been recognised on this device.
 */
function Boarding({
  model,
  reducedMotion,
}: {
  model: ConciergeModel;
  reducedMotion: boolean;
}) {
  return (
    <section className="boarding" aria-labelledby="boarding-title">
      <h2 id="boarding-title" className="boarding__title">
        Your travel credentials are in order
      </h2>
      <div className="boarding__pass">
        <BoardingPass
          departureAt={knownSchedule(model.state).departureOpensAt}
          cleared
          stampIn={!reducedMotion}
        />
      </div>
      <p className="boarding__line">Welcome to your Departure Lounge, Madam.</p>
      <button
        type="button"
        className="brass-button boarding__go"
        onClick={model.markBoarded}
      >
        Enter the lounge
      </button>
    </section>
  );
}

function Wallet({
  model,
  reducedMotion,
}: {
  model: ConciergeModel;
  reducedMotion: boolean;
}) {
  const [opened, setOpened] = useState<{
    id: PrivilegeId;
    opener: HTMLElement;
  } | null>(null);
  const titleId = useId();
  const { breakSeal, redeem } = model;
  const open = useCallback(
    (id: PrivilegeId, opener: HTMLElement) => {
      breakSeal(id);
      setOpened({ id, opener });
    },
    [breakSeal],
  );
  const close = useCallback(() => setOpened(null), []);
  const view = opened
    ? model.privileges.find((p) => p.privilege.id === opened.id)
    : null;

  return (
    <>
      <div className="wallet" inert={opened !== null}>
        <span
          className="wallet__corner wallet__corner--tl"
          aria-hidden="true"
        />
        <span
          className="wallet__corner wallet__corner--tr"
          aria-hidden="true"
        />
        <span
          className="wallet__corner wallet__corner--bl"
          aria-hidden="true"
        />
        <span
          className="wallet__corner wallet__corner--br"
          aria-hidden="true"
        />
        <BoardingPass
          departureAt={knownSchedule(model.state).departureOpensAt}
          cleared
        />
        <h2 className="wallet__label">Your privileges</h2>
        <ul className="wallet__pocket">
          {model.privileges.map((privilegeView) => (
            <PrivilegeEnvelope
              key={privilegeView.privilege.id}
              view={privilegeView}
              now={model.now}
              reducedMotion={reducedMotion}
              onOpen={open}
            />
          ))}
        </ul>
        {/* The two airport drinks live with the club's other privileges
            (ADR-024); her husband pays, the Butler passes word. */}
        <Link className="wallet__drinks" to="/drinks">
          <span>Two drinks before the flight</span>
          <small>Choose a drink · word goes to your husband</small>
        </Link>
      </div>
      {opened && view && (
        <PaperSheet
          labelledBy={titleId}
          returnFocusTo={opened.opener}
          onClose={close}
        >
          <PrivilegeCard
            view={view}
            titleId={titleId}
            connection={model.connection}
            rehearsing={model.realm === 'rehearsal'}
            reducedMotion={reducedMotion}
            onRedeem={(details) => redeem(view.privilege.id, details)}
          />
        </PaperSheet>
      )}
    </>
  );
}

function Stage({
  phase,
  model,
  reducedMotion,
}: {
  phase: LoungePhase;
  model: ConciergeModel;
  reducedMotion: boolean;
}) {
  switch (phase) {
    case 'closed':
      return <Closed model={model} />;
    case 'credential':
      return <CredentialRequest now={model.now} onPresent={model.present} />;
    case 'open':
      return model.boarded ? (
        <Wallet model={model} reducedMotion={reducedMotion} />
      ) : (
        <Boarding model={model} reducedMotion={reducedMotion} />
      );
  }
}

/**
 * `/departure`. The club's Departure Lounge: a 2.5D room of leather, brass
 * and paper that opens on Thursday at 14:00 UK time.
 */
export default function DepartureLounge({ deps }: { deps?: ConciergeDeps }) {
  const [resolved] = useState(() => deps ?? browserConciergeDeps());
  const model = useConcierge(resolved);
  const welcome = useDepartureWelcome();
  const reducedMotion = useReducedMotion();

  return (
    <div
      className="departure"
      data-phase={model.phase}
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      <div className="departure__lamp" aria-hidden="true" />
      <header className="departure__header">
        <Link to="/" className="departure__back">
          The Thirty Club
        </Link>
        <h1 className="departure__title">
          <span>The</span> Departure Lounge
        </h1>
      </header>
      <SplitFlapBoard
        still={reducedMotion}
        lines={[
          { label: 'Flight', text: 'TC030  JAMAICA' },
          { label: 'Remarks', text: boardRemarks(model) },
        ]}
      />
      <div
        className="departure__stage"
        key={
          model.phase === 'open' && !model.boarded ? 'boarding' : model.phase
        }
      >
        {welcome?.available ? (
          <DepartureWelcome
            introduced={welcome.introduced}
            body={welcome.body}
          />
        ) : (
          <Stage
            phase={model.phase}
            model={model}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
      <ConnectionNote model={model} />
    </div>
  );
}
