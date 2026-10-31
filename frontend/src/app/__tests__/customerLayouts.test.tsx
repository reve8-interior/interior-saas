import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeButton } from '@/components/shared/CustomerChrome';
import PortfolioLayout from '../portfolio/[token]/layout';
import QuotationLayout from '../quotation/[token]/layout';
import ShareLayout from '../share/[token]/layout';

// Every customer page renders ThemeButton, which throws without a provider.
describe.each([
  ['share', ShareLayout],
  ['portfolio', PortfolioLayout],
  ['quotation', QuotationLayout],
])('%s link layout', (_name, Layout) => {
  it('provides the theme context the customer chrome needs', () => {
    render(
      <Layout>
        <ThemeButton />
      </Layout>
    );
    expect(screen.getByLabelText(/Switch to/)).toBeInTheDocument();
  });
});
