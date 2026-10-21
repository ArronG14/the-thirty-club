import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DojaPage from './DojaPage';

afterEach(() => vi.unstubAllGlobals());

describe('Doja direct link', () => {
  it('starts with the Butler, then presents only the note and a discreet editor seal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              letter: {
                addressedTo: 'Alise',
                message: 'Line one.\n\nLine two!',
                from: 'Doja',
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const { container } = render(<DojaPage />);
    expect(
      screen.getByRole('button', { name: 'See Note' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Madam, a rather special delivery/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See Note' }));
    await waitFor(() =>
      expect(screen.getByText('Dearest Alise,')).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Madam, a rather special delivery/),
    ).not.toBeInTheDocument();
    expect(container.querySelector('.doja-paper__message')?.textContent).toBe(
      'Line one.\n\nLine two!',
    );
    expect(screen.getByText('With Love,')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Doja’s private writing desk' }),
    ).toBeInTheDocument();
  });

  it('shows an intentional empty letter when nothing is saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"letter":null}', { status: 200 })),
    );
    render(<DojaPage />);
    fireEvent.click(screen.getByRole('button', { name: 'See Note' }));
    await waitFor(() =>
      expect(
        screen.getByText('This paper is waiting for Doja’s words.'),
      ).toBeInTheDocument(),
    );
  });
});
