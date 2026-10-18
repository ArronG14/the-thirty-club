import { ownerActive } from '../../owner/session';
import { useState } from 'react';
import { CLUB_REWARDS } from '../../prizes/clubRewards';
import type { SlotClass } from '../domain/slots';
import type { CasinoModel } from '../useCasino';
import {
  completedState,
  freshState,
  jackpotNextState,
  withAward,
  withChips,
} from './devState';

export default function CasinoDevTools({ model }: { model: CasinoModel }) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(7);
  const [slot, setSlot] = useState<SlotClass>('jackpot');
  const [reward, setReward] = useState<string>(CLUB_REWARDS[0]!.id);
  const [armed, setArmed] = useState('none');

  return (
    <aside className="devtools" data-owner={ownerActive} data-open={open}>
      <button
        type="button"
        className="devtools__toggle"
        onClick={() => setOpen(!open)}
      >
        {ownerActive ? 'Casino test controls' : 'DEV · casino'}
      </button>
      {open && (
        <div className="devtools__body">
          <p>
            {ownerActive
              ? 'Owner rehearsal · isolated test rewards'
              : 'Development testing'}
          </p>
          <div className="devtools__row">
            <button type="button" onClick={() => model.replace(freshState())}>
              Reset progress
            </button>
            <button
              type="button"
              onClick={() => model.replace(completedState())}
            >
              Completed state
            </button>
            <button
              type="button"
              onClick={() => model.replace(jackpotNextState())}
            >
              Jackpot next
            </button>
            <button
              type="button"
              onClick={() => model.replace(withChips(model.state, 1000))}
            >
              Chips 1000
            </button>
          </div>
          <div className="devtools__row">
            <label>
              Roulette number
              <input
                type="number"
                min={0}
                max={36}
                value={number}
                onChange={(e) => setNumber(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                model.setOverride('roulette', number);
                setArmed(`roulette ${number}`);
              }}
            >
              Force next spin
            </button>
          </div>
          <div className="devtools__row">
            <label>
              Slots
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value as SlotClass)}
              >
                <option value="jackpot">jackpot</option>
                <option value="triple">triple</option>
                <option value="pair">pair</option>
                <option value="miss">miss</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                model.setOverride('slots', slot);
                setArmed(`slots ${slot}`);
              }}
            >
              Force next spin
            </button>
          </div>
          <div className="devtools__row">
            <label>
              Reward
              <select
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              >
                {CLUB_REWARDS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => model.replace(withAward(model.state, reward))}
            >
              Award
            </button>
          </div>
          <p>Armed: {armed}</p>
          <pre className="devtools__json">
            {JSON.stringify(
              { casino: model.state.casino, ledger: model.state.ledger },
              null,
              1,
            )}
          </pre>
        </div>
      )}
    </aside>
  );
}
