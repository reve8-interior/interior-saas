import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuotationLayout from '../[token]/layout';
import SharedQuotationPage from '../[token]/page';
import type { SharedQuotationView } from '@/lib/schemas/quotationVersion';

vi.mock('next/navigation', () => ({ useParams: () => ({ token: 'tok' }) }));
vi.mock('@/lib/quotationVersions', () => ({
  getSharedQuotation: vi.fn(),
  respondToSharedQuotation: vi.fn(),
}));

const view: SharedQuotationView = {
  business_name: 'Studio',
  contact_email: null,
  contact_phone: null,
  responded_kind: null,
  project_name: 'Rao home',
  version_number: 2,
  label: null,
  created_at: '2026-11-01T00:00:00Z',
  show_prices: false,
  is_agreed: false,
  total: null,
  rooms: [
    {
      room: 'Hall',
      total: null,
      designs: [],
      items: [
        {
          description: 'TV unit',
          unit: 'sqft',
          raw_dimension: null,
          qty: 1,
          est_time: null,
          rate: null,
          amount: null,
        },
        {
          description: 'Sofa',
          unit: 'nos',
          raw_dimension: null,
          qty: 1,
          est_time: null,
          rate: null,
          amount: null,
        },
      ],
    },
  ],
};

vi.mock('@/lib/hooks/useSharedLink', () => ({
  useSharedLink: () => ({
    state: { status: 'ready', view },
    retry: vi.fn(),
    onImageError: vi.fn(),
  }),
}));

// The page's chrome needs the theme context the link layout provides.
const renderPage = () =>
  render(
    <QuotationLayout>
      <SharedQuotationPage />
    </QuotationLayout>
  );

describe('Shared quotation page', () => {
  it('lets the customer ask about every line, tagged with room and line', () => {
    renderPage();
    // Each line renders in the phone list and the desktop table.
    for (const label of ['Hall · TV unit', 'Hall · Sofa']) {
      expect(
        screen.getAllByRole('button', { name: `Ask about ${label}` }).length
      ).toBeGreaterThan(0);
    }
  });

  it('keeps the whole-quotation actions next to the per-line ones', () => {
    renderPage();
    const bar = screen.getByRole('region', { name: 'Your response' });
    expect(
      within(bar).getByRole('button', { name: /Approve this quotation/ })
    ).toBeInTheDocument();
    expect(
      within(bar).getByRole('button', { name: 'Ask a question' })
    ).toBeInTheDocument();
  });
});
