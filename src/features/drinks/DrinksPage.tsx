import { Link } from 'react-router';
import { DrinksPrivilege } from './DrinksPrivilege';

/**
 * `/drinks`: the drinks privileges on their own page, outside the room
 * gates, for the Departure Lounge and the Butler's letters (ADR-024). The
 * server decides everything; a device without her session is asked for the
 * membership card.
 */
export default function DrinksPage() {
  return (
    <main className="drinks-page" aria-labelledby="drinks-page-title">
      <div className="drinks-page__inner">
        <header>
          <Link to="/lounge">‹ Members’ Lounge</Link>
          <h1 id="drinks-page-title">Drinks</h1>
        </header>
        <DrinksPrivilege />
      </div>
    </main>
  );
}
