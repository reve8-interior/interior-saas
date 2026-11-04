import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Collapsible } from '../Collapsible';

describe('Collapsible', () => {
  it('is closed by default but keeps its content mounted', () => {
    const { container } = render(
      <Collapsible title="Contact" summary="3 fields">
        <input aria-label="Phone" />
      </Collapsible>
    );
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByLabelText('Phone', { selector: 'input' })).toBeTruthy();
    expect(screen.getByText('3 fields')).toBeInTheDocument();
  });

  it('opens when defaultOpen is set', () => {
    const { container } = render(
      <Collapsible title="Contact" defaultOpen>
        <p>body</p>
      </Collapsible>
    );
    expect(container.querySelector('details')).toHaveAttribute('open');
  });
});
