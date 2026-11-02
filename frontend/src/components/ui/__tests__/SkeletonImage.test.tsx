import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkeletonImage } from '../SkeletonImage';

describe('SkeletonImage', () => {
  it('hides the image until it has loaded', () => {
    render(<SkeletonImage src="/a.png" alt="Room" />);
    expect(screen.getByAltText('Room')).toHaveClass('opacity-0');
  });

  it('fades the image in on load and forwards onLoad', () => {
    const onLoad = vi.fn();
    render(<SkeletonImage src="/a.png" alt="Room" onLoad={onLoad} />);
    const img = screen.getByAltText('Room');
    fireEvent.load(img);
    expect(img).toHaveClass('opacity-100');
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('stops the skeleton on error so a broken image does not shimmer forever', () => {
    const onError = vi.fn();
    render(<SkeletonImage src="/a.png" alt="Room" onError={onError} />);
    const img = screen.getByAltText('Room');
    fireEvent.error(img);
    expect(img).toHaveClass('opacity-100');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('shows the skeleton again when the source changes', () => {
    const { rerender } = render(<SkeletonImage src="/a.png" alt="Room" />);
    fireEvent.load(screen.getByAltText('Room'));
    expect(screen.getByAltText('Room')).toHaveClass('opacity-100');
    rerender(<SkeletonImage src="/b.png" alt="Room" />);
    expect(screen.getByAltText('Room')).toHaveClass('opacity-0');
  });

  it('applies className to the image and wrapperClassName to the wrapper', () => {
    render(
      <SkeletonImage
        src="/a.png"
        alt="Room"
        className="h-10"
        wrapperClassName="rounded-xl"
      />
    );
    const img = screen.getByAltText('Room');
    expect(img).toHaveClass('h-10');
    expect(img.parentElement).toHaveClass('rounded-xl');
  });

  it('passes extra attributes through to the img', () => {
    render(<SkeletonImage src="/a.png" alt="Room" loading="lazy" />);
    expect(screen.getByAltText('Room')).toHaveAttribute('loading', 'lazy');
  });
});
