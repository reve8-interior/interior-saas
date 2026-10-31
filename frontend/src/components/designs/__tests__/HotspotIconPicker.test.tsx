import { fireEvent, render, screen } from '@testing-library/react';

import { HotspotIconPicker } from '../HotspotIconPicker';

const setup = (value = '', label = 'Sofa') => {
  const onChange = vi.fn();
  render(<HotspotIconPicker value={value} label={label} onChange={onChange} />);
  return onChange;
};

describe('HotspotIconPicker', () => {
  it('names the current choice on the button and starts closed', () => {
    setup('lamp');
    expect(
      screen.getByRole('button', { name: 'Pin icon: Lamp' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows Auto while the icon is guessed from the label', () => {
    setup('', 'Sofa');
    expect(
      screen.getByRole('button', { name: 'Pin icon: Auto' })
    ).toBeInTheDocument();
  });

  it('picks an icon and closes', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: /Pin icon/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Armchair' }));
    expect(onChange).toHaveBeenCalledWith('armchair');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can pick Auto and Number', () => {
    const onChange = setup('lamp');
    fireEvent.click(screen.getByRole('button', { name: /Pin icon/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Number' }));
    expect(onChange).toHaveBeenLastCalledWith('number');
    fireEvent.click(screen.getByRole('button', { name: /Pin icon/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('filters by search and says when nothing matches', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Pin icon/ }));
    const search = screen.getByRole('searchbox', { name: 'Search icons' });
    fireEvent.change(search, { target: { value: 'lam' } });
    expect(screen.getByRole('button', { name: 'Lamp' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sofa' })).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/No icon matches/)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Pin icon/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
