import { FilmPlayer } from '../../shared/media/FilmPlayer';
import { mediaReference } from '../../shared/media/contract';
import './drinksDesk.css';

/**
 * The two protected films (ADR-026). The owner may play them at any time,
 * here, to check each upload streams on his own telephone and connection.
 * Alise receives each only when she has earned it; the server decides.
 */
export default function FilmsDesk() {
  return (
    <div className="dd">
      <header className="dd__head">
        <h2>Films</h2>
        <p>
          Both films live in private storage and are never public addresses.
          Play each here on your iPhone, on the hotel Wi-Fi, before she needs
          it. “This film is still being prepared” means it has not been uploaded
          yet (docs/MEDIA_DELIVERY.md).
        </p>
      </header>
      <section className="dd__card">
        <h3>Thirty Years of Alise — the birthday film</h3>
        <p className="dd__note">
          The Screening Room plays it from 00:00 on 24 October in Jamaica, once
          she has accepted the room. Nothing to set.
        </p>
        <FilmPlayer
          src={mediaReference('birthday-film')}
          title="Thirty Years of Alise"
          watchLabel="Play the standard print"
        />
        <FilmPlayer
          src={mediaReference('birthday-film')}
          title="Thirty Years of Alise, lighter print"
          watchLabel="Play the lighter print"
          print="lighter"
        />
      </section>
      <section className="dd__card">
        <h3>Nyla’s film — the Casino’s afternoon session</h3>
        <p className="dd__note">
          Before the <code>casino-afternoon-spins</code> milestone fires, set
          the prize <code>nyla-film</code> (Casino &amp; rewards) to Film URL{' '}
          <code>{mediaReference('nyla-film')}</code> and make it active. Its
          third spin then reveals the film; she can watch it again from her
          Casino vouchers without spending a spin.
        </p>
        <FilmPlayer
          src={mediaReference('nyla-film')}
          title="Nyla’s film"
          watchLabel="Play"
        />
      </section>
    </div>
  );
}
