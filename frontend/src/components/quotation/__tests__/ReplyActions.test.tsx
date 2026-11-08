import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ReplyActions } from '../ReplyActions';

const renderActions = (
  props: Partial<ComponentProps<typeof ReplyActions>> = {}
) =>
  render(
    <ReplyActions
      clientId="c1"
      versionId="v9"
      versionNumber={3}
      contact={{ phone: '+91 98765 43210', email: 'rao@x.test' }}
      {...props}
    />
  );

describe('ReplyActions', () => {
  it('renders icon-only actions that still carry an accessible name', () => {
    renderActions();
    for (const name of [/WhatsApp/, /Edit quotation/, /View v3/]) {
      const el = screen.getByRole('link', { name });
      expect(el).toHaveAttribute('title');
      expect(el.textContent).toBe('');
    }
  });

  it('opens the quotation at the top when the question was not about a line', () => {
    renderActions();
    expect(
      screen.getByRole('link', { name: /Edit quotation/ })
    ).toHaveAttribute('href', '/dashboard/clients/c1/quotation');
  });

  it('sends Edit quotation to the asked line, encoded', () => {
    renderActions({ itemLabel: 'Master bedroom · Wardrobe & loft' });
    const link = screen.getByRole('link', { name: /Edit quotation/ });
    expect(link).toHaveAttribute(
      'href',
      `/dashboard/clients/c1/quotation?line=${encodeURIComponent('Master bedroom · Wardrobe & loft')}`
    );
    expect(link).toHaveAttribute('title', 'Edit this line in the quotation');
  });

  it('uses email when there is no phone', () => {
    renderActions({ contact: { email: 'rao@x.test' } });
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Email/ })).toHaveAttribute(
      'href',
      'mailto:rao@x.test'
    );
  });

  it('offers no contact action when the client has neither', () => {
    renderActions({ contact: {} });
    expect(screen.queryByRole('link', { name: /WhatsApp|Email/ })).toBeNull();
  });

  it('hides Edit quotation when canEdit is false', () => {
    renderActions({ canEdit: false });
    expect(screen.queryByRole('link', { name: /Edit quotation/ })).toBeNull();
  });

  it('hides the version link when asked or when there is no version', () => {
    const { unmount } = renderActions({ showVersionLink: false });
    expect(screen.queryByRole('link', { name: /View v/ })).toBeNull();
    unmount();
    renderActions({ versionId: null });
    expect(screen.queryByRole('link', { name: /View v/ })).toBeNull();
  });
});
