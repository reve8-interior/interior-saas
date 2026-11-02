import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';
import { ReplyBanner } from '../ReplyBanner';

const version = (over: Partial<QuotationVersionSummary>) =>
  ({
    is_shared: true,
    is_agreed: false,
    reply_kind: 'question',
    reply_name: 'Mrs Rao',
    reply_message: 'Can we change the finish?',
    replied_at: '2030-01-01T00:00:00Z',
    ...over,
  }) as QuotationVersionSummary;

const renderBanner = (
  over: Partial<QuotationVersionSummary>,
  onAgree = () => {}
) =>
  render(
    <ReplyBanner
      summary={version(over)}
      clientId="c1"
      contact={{ phone: '+91 98765 43210', email: 'rao@x.test' }}
      onAgree={onAgree}
    />
  );

describe('ReplyBanner', () => {
  it('shows nothing until the customer has answered', () => {
    const { container } = renderBanner({ reply_kind: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a question with ways to reach the customer and edit', () => {
    renderBanner({});
    expect(screen.getByText(/asked a question/)).toBeInTheDocument();
    expect(screen.getByText(/change the finish/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      'https://wa.me/919876543210'
    );
    expect(screen.queryByRole('link', { name: /Email/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: /Edit quotation/ })
    ).toHaveAttribute('href', '/dashboard/clients/c1/quotation');
  });

  it('falls back to email when the client has no phone', () => {
    render(
      <ReplyBanner
        summary={version({})}
        clientId="c1"
        contact={{ email: 'rao@x.test' }}
        onAgree={() => {}}
      />
    );
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Email/ })).toHaveAttribute(
      'href',
      'mailto:rao@x.test'
    );
  });

  it('offers Mark as agreed for an approval', () => {
    const onAgree = vi.fn();
    renderBanner({ reply_kind: 'approved', reply_message: null }, onAgree);
    fireEvent.click(screen.getByRole('button', { name: /Mark as agreed/ }));
    expect(onAgree).toHaveBeenCalled();
    expect(screen.queryByText(/Edit quotation/)).toBeNull();
  });
});
