import { cinemaConfig } from './cinemaConfig';
export function CinemaBackdrop() {
  return (
    <div
      className="cinema__architecture"
      aria-hidden="true"
      style={{ backgroundImage: `url("${cinemaConfig.background}")` }}
    />
  );
}
