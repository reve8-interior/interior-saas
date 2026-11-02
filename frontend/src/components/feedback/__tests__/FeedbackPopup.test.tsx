import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { FeedbackPopup } from '../FeedbackPopup';
import * as feedback from '@/lib/feedback';
import type { FeedbackPrompt } from '@/lib/schemas/feedback';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/feedback', async (orig) => ({
  ...(await orig<typeof import('@/lib/feedback')>()),
  getNextPrompt: vi.fn(),
  submitFeedback: vi.fn(),
  randomDelay: () => 1000,
}));

const prompt: FeedbackPrompt = {
  feature: 'designs',
  title: 'Designs',
  question: 'How are designs working for you?',
  choice_question: 'What do you use most?',
  options: [
    { value: 'upload', label: 'Upload' },
    { value: 'hotspots', label: 'Hotspots' },
  ],
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FeedbackPopup userId="u1" />
    </QueryClientProvider>
  );
}

/** Lets the random pause elapse and the prompt lookup resolve. */
async function showPopup() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

describe('FeedbackPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(feedback.getNextPrompt).mockResolvedValue(prompt);
    vi.mocked(feedback.submitFeedback).mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it('stays hidden until the random pause has passed', async () => {
    mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(feedback.getNextPrompt).not.toHaveBeenCalled();
    await showPopup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(prompt.question)).toBeInTheDocument();
  });

  it('does not ask again within the cooldown', async () => {
    feedback.saveLastShown('u1', Date.now());
    mount();
    await showPopup();
    expect(feedback.getNextPrompt).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('records that the user was prompted', async () => {
    mount();
    await showPopup();
    expect(feedback.loadLastShown('u1')).not.toBeNull();
  });

  it('shows nothing when no feature is left to ask about', async () => {
    vi.mocked(feedback.getNextPrompt).mockResolvedValue(null);
    mount();
    await showPopup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(feedback.loadLastShown('u1')).toBeNull();
  });

  it('skips the round quietly when the lookup fails', async () => {
    vi.mocked(feedback.getNextPrompt).mockRejectedValue(new Error('down'));
    mount();
    await showPopup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not look anything up if unmounted during the pause', async () => {
    const { unmount } = mount();
    unmount();
    await showPopup();
    expect(feedback.getNextPrompt).not.toHaveBeenCalled();
  });

  it('reveals the follow-up only after a rating is chosen', async () => {
    mount();
    await showPopup();
    expect(screen.queryByText(prompt.choice_question)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(screen.getByText(prompt.choice_question)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked();
  });

  it('dismisses without submitting', async () => {
    mount();
    await showPopup();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss feedback' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(feedback.submitFeedback).not.toHaveBeenCalled();
  });

  describe('submitting', () => {
    async function openWithRating(stars: number) {
      mount();
      await showPopup();
      fireEvent.click(screen.getByRole('radio', { name: `${stars} stars` }));
    }

    async function send() {
      vi.useRealTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    }

    it('submits the rating and chosen option, then closes', async () => {
      await openWithRating(5);
      fireEvent.click(screen.getByRole('radio', { name: 'Hotspots' }));
      await send();
      await waitFor(() =>
        expect(feedback.submitFeedback).toHaveBeenCalledWith({
          feature: 'designs',
          rating: 5,
          choice: 'hotspots',
        })
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it('lets the user deselect an option and send with no choice', async () => {
      await openWithRating(3);
      const upload = screen.getByRole('radio', { name: 'Upload' });
      fireEvent.click(upload);
      fireEvent.click(upload);
      await send();
      await waitFor(() =>
        expect(feedback.submitFeedback).toHaveBeenCalledWith({
          feature: 'designs',
          rating: 3,
          choice: null,
        })
      );
    });

    it('keeps the popup open and shows the error when sending fails', async () => {
      vi.mocked(feedback.submitFeedback).mockRejectedValue(new Error('nope'));
      await openWithRating(2);
      await send();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
