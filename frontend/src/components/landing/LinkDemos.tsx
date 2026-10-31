import { StepPlayer, type DemoStep } from './StepPlayer';
import taps from './shotTaps.json';

/** Walkthroughs of the two links a client receives, over real screenshots of the shared pages (sample data). */

type TapMap = Record<
  string,
  { d: { x: number; y: number } | null; m: { x: number; y: number } | null }
>;

/** Pointer positions recorded when the screenshots were taken. */
const TAPS = taps as TapMap;

function step(key: string, title: string, line: string): DemoStep {
  return { key, title, line, desktop: TAPS[key].d, mobile: TAPS[key].m };
}

const QUOTATION_STEPS: DemoStep[] = [
  step(
    'qa',
    'Opens your link',
    'No app and no account. The client lands on the latest quotation, with your studio name on it, on any device.'
  ),
  step(
    'qb',
    'Reads the line items',
    'Every item with its size, quantity, rate and amount, grouped by room, with the total at the bottom.'
  ),
  step(
    'qc',
    'Taps a pin on the design',
    'Pinned items open with their material, category, dimensions and rate, so nobody has to ask what a piece is.'
  ),
  step(
    'qd',
    'Asks a question',
    'A question or a change request goes straight to you from the same page. No chat thread to dig through.'
  ),
  step(
    'qe',
    'Approves',
    'One tap to approve. The client sees a confirmation and you see the response on their record.'
  ),
];

const DESIGN_STEPS: DemoStep[] = [
  step(
    'da',
    'Opens the design link',
    'A gallery of the images you chose to share. Nothing else from the project is visible.'
  ),
  step(
    'db',
    'Taps a marked area',
    'Each pin opens the item with its material, size and rate. A list below the image does the same.'
  ),
  step(
    'dc',
    'Moves to the next image',
    'Thumbnails and arrows move through the set, each image with its own pins.'
  ),
];

export function QuotationLinkDemo() {
  return (
    <StepPlayer steps={QUOTATION_STEPS} url="portal.reve8.com/quotation/…" />
  );
}

export function DesignLinkDemo() {
  return <StepPlayer steps={DESIGN_STEPS} url="portal.reve8.com/share/…" />;
}
