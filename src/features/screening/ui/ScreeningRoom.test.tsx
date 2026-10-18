import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENING_KEY } from '../domain/progress';
import type { VideoMessage } from '../domain/videoMessages';
import ScreeningRoom, { EndFrame } from './ScreeningRoom';
const messages: VideoMessage[] = ['one', 'two'].map((id, order) => ({
  id,
  order,
  sender: `Test ${id}`,
  video: { src: `/media/screening/${id}.mp4`, type: 'video/mp4' },
}));
function mount(content = messages, complete = vi.fn()) {
  return render(
    <MemoryRouter>
      <ScreeningRoom messages={content} onComplete={complete} />
    </MemoryRouter>,
  );
}
const press = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }));
const video = () => document.querySelector('video')!;
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    fireEvent.play(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    fireEvent.pause(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('screening experience', () => {
  it('has no autoplay and starts synchronously from the premiere tap; pause, replay, navigation work', () => {
    mount();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(video()).not.toHaveAttribute('autoplay');
    press('Begin screening');
    expect(video()).toHaveAttribute('src', messages[0]!.video.src);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    press('Pause');
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    press('Screening options');
    press('Replay message');
    press('Next message');
    expect(video()).toHaveAttribute('src', messages[1]!.video.src);
    press('Previous message');
    expect(video()).toHaveAttribute('src', messages[0]!.video.src);
    expect(JSON.parse(localStorage.getItem(SCREENING_KEY)!).watched).toEqual(
      [],
    );
  });
  it('offers next, records only ended clips, completes once all watched, and allows rewatch', () => {
    const complete = vi.fn();
    mount(messages, complete);
    press('Begin screening');
    fireEvent.ended(video());
    expect(complete).not.toHaveBeenCalled();
    press(/Watch next message from/);
    fireEvent.ended(video());
    expect(screen.getByText('The end')).toBeVisible();
    expect(complete).toHaveBeenCalled();
    press('Rewatch the collection');
    expect(video()).toHaveAttribute('src', messages[0]!.video.src);
    expect(JSON.parse(localStorage.getItem(SCREENING_KEY)!).watched).toEqual([
      'one',
      'two',
    ]);
  });
  it('resumes after remount and browsing does not erase progress', () => {
    const first = mount();
    press('Begin screening');
    fireEvent.ended(video());
    press(/Watch next message from/);
    first.unmount();
    mount();
    press('Browse messages');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Watched')).toBeVisible();
    press('Close collection');
    press('Resume screening');
    expect(video()).toHaveAttribute('src', messages[1]!.video.src);
  });
  it('restores saved position on metadata and scrubs without marking watched', () => {
    localStorage.setItem(
      SCREENING_KEY,
      JSON.stringify({
        version: 1,
        started: true,
        lastId: 'one',
        positions: { one: 8 },
        watched: [],
      }),
    );
    mount();
    press('Resume screening');
    Object.defineProperty(video(), 'duration', {
      value: 20,
      configurable: true,
    });
    fireEvent.loadedMetadata(video());
    expect(video().currentTime).toBe(8);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '12' } });
    expect(video().currentTime).toBe(12);
    expect(JSON.parse(localStorage.getItem(SCREENING_KEY)!).watched).toEqual(
      [],
    );
  });
  it('recovers from a rejected play and media error without blocking skipping or leaving', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new Error('NotAllowedError'),
    );
    mount();
    press('Begin screening');
    await screen.findByText(/Tap Play to continue/);
    fireEvent.error(video());
    expect(
      screen.getByText('This message cannot load right now.'),
    ).toBeVisible();
    press('Retry');
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    await act(async () => {});
    press('Next message');
    press('Screening options');
    expect(
      screen.getByRole('link', { name: 'Return to the Members’ Lounge' }),
    ).toHaveAttribute('href', '/');
    await act(async () => {});
  });
  it('filters placeholders and never starts an empty collection', () => {
    mount([{ ...messages[0]!, placeholder: true }]);
    expect(screen.getByText('The messages are not ready yet.')).toBeVisible();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.queryByText('Test one')).toBeNull();
  });
  it('keeps invalid content recoverable even for a returning viewer', () => {
    localStorage.setItem(
      SCREENING_KEY,
      JSON.stringify({ version: 1, started: true, lastId: 'one', watched: [] }),
    );
    mount([messages[0]!, { ...messages[1]!, order: 0 }]);
    expect(
      screen.getByText(
        'The collection needs a little attention. Please return shortly.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Resume screening' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Return to the Members’ Lounge' }),
    ).toBeVisible();
  });

  it('offers native iPhone fullscreen from options without remounting the inline video', () => {
    mount();
    press('Begin screening');
    const element = video();
    const enterFullscreen = vi.fn();
    Object.defineProperty(element, 'webkitEnterFullscreen', {
      value: enterFullscreen,
    });
    expect(element).toHaveAttribute('playsinline');
    expect(element.controls).toBe(false);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    press('Screening options');
    press('Fullscreen');
    expect(enterFullscreen).toHaveBeenCalledOnce();
    expect(video()).toBe(element);
  });
  it('shows one end-of-message overlay and waits for Watch Next', () => {
    mount();
    press('Begin screening');
    const element = video();
    fireEvent.ended(element);
    expect(screen.getByRole('heading', { name: 'Test one' })).toBeVisible();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next message' })).toBeNull();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(video()).toBe(element);
    press('Replay');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });
  it('pauses when hidden and cleans up the media on exit', async () => {
    const view = mount();
    press('Begin screening');
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Play' })).toBeVisible(),
    );
    const element = video();
    view.unmount();
    expect(element).not.toHaveAttribute('src');
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });
  it('renders a deterministic clean end frame without controls or WebGL', () => {
    const { container } = render(<EndFrame />);
    expect(container.querySelector('canvas, video, button, a')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
