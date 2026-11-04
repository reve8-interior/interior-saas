import { fireEvent, render, screen } from '@testing-library/react';

import { FilePreviewList } from '../FilePreviewList';

describe('FilePreviewList', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('renders a thumbnail for each chosen image and can remove one', () => {
    const file = new File(['x'], 'sofa.png', { type: 'image/png' });
    const onRemove = vi.fn();
    render(<FilePreviewList files={[file]} onRemove={onRemove} />);
    expect(screen.getByAltText('sofa.png').getAttribute('src')).toBe(
      'blob:preview'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove sofa.png' }));
    expect(onRemove).toHaveBeenCalledWith(file);
  });
});
