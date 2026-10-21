import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileSpreadsheet,
  GitCompare,
  Lock,
  MessageSquareText,
  PlusCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GuideNav, type GuideSection } from './GuideNav';

// ── Shared building blocks ────────────────────────────────────────────────────

const CARD = 'surface p-4 sm:p-5';

const BADGE_CLS = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
} as const;

type Tone = keyof typeof BADGE_CLS;

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_CLS[tone]}`}
    >
      {children}
    </span>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-heading text-lg font-extrabold tracking-tight text-dark-900 dark:text-white">
        {title}
      </h2>
      <p className="text-sm text-dark-500 dark:text-dark-400">{sub}</p>
    </div>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-bold text-primary-500">
      {n}
    </span>
  );
}

/** Fake window frame so mock visuals read as "what you will see". */
function Mock({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="mt-3 overflow-hidden rounded-xl border border-line bg-primary-50/80 dark:border-primary-300/15 dark:bg-dark-950">
      <div className="space-y-2 p-3 text-xs">{children}</div>
      <figcaption className="border-t border-line bg-white px-3 py-1.5 text-[11px] text-dark-500 dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-dark-400">
        {caption}
      </figcaption>
    </figure>
  );
}

function MockButton({
  tone = 'primary',
  disabled = false,
  children,
}: {
  tone?: 'primary' | 'blue' | 'red' | 'ghost';
  disabled?: boolean;
  children: ReactNode;
}) {
  const cls = disabled
    ? 'bg-primary-100/70 text-gray-400 dark:bg-white/10 dark:text-dark-500'
    : {
        primary: 'bg-primary-600 text-white',
        blue: 'bg-blue-600 text-white',
        red: 'border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400',
        ghost:
          'border border-line text-dark-700 dark:border-primary-300/15 dark:text-dark-300',
      }[tone];
  return (
    <span
      className={`inline-block rounded-xl px-3 py-1.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

// ── Flow diagram ──────────────────────────────────────────────────────────────

interface FlowStage {
  label: string;
  hint: string;
  icon: LucideIcon;
}

const FLOW: FlowStage[] = [
  { label: 'Meeting notes', hint: 'Paste text', icon: MessageSquareText },
  { label: 'Conversation', hint: 'Saved as #1, #2…', icon: Bot },
  { label: 'Verify rows', hint: 'Tick ✓ each row', icon: CheckCircle2 },
  { label: 'Quotation', hint: 'Add to Quotation', icon: PlusCircle },
  { label: 'Versions', hint: 'Save & compare', icon: GitCompare },
  { label: 'Excel', hint: 'Share with client', icon: FileSpreadsheet },
];

function FlowDiagram() {
  return (
    <ol className="grid grid-cols-2 gap-2 md:flex md:flex-row md:items-stretch md:gap-1">
      {FLOW.map((stage, i) => (
        <li
          key={stage.label}
          className="flex min-w-0 items-center gap-1 md:flex-1"
        >
          <div className="surface flex min-w-0 flex-1 flex-col items-center gap-2 p-3 text-center md:h-full md:justify-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
              <stage.icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-dark-900 dark:text-white">
                {stage.label}
              </p>
              <p className="text-[11px] text-dark-500 dark:text-dark-400">
                {stage.hint}
              </p>
            </div>
          </div>
          {i < FLOW.length - 1 && (
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-dark-500 dark:text-dark-400 md:block" />
          )}
        </li>
      ))}
    </ol>
  );
}

// ── Conversation walkthrough ────────────────────────────────────────────────────

function ConversationSteps() {
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <div className="flex gap-3">
          <StepNo n={1} />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
              Create a conversation
            </h3>
            <p className="text-sm text-dark-500 dark:text-dark-300">
              Open a client → <b>Conversations</b> → <b>+ AI Extract</b>. Paste
              your meeting notes (or upload a .txt/.md file) → <b>Extract</b>.
            </p>
            <Mock caption="Each meeting = one conversation. #1 is the oldest.">
              <div className="rounded-lg border border-dashed border-line p-3 text-dark-500 dark:border-primary-300/15 dark:text-dark-400">
                “Master bedroom: add wardrobe 8x7, change TV unit rate to
                ₹1,200, remove the false ceiling…”
              </div>
              <div className="flex justify-end">
                <MockButton>Extract →</MockButton>
              </div>
            </Mock>
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex gap-3">
          <StepNo n={2} />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
              Review what AI found
            </h3>
            <p className="text-sm text-dark-500 dark:text-dark-300">
              AI turns the notes into rows. Each row has an action badge. Fix
              any cell by typing in it, or <b>+ Add row</b> to add your own.
              Then <b>Save Conversation</b>.
            </p>
            <Mock caption="Hover a badge to see which quotation item it affects.">
              <div className="flex items-center gap-2">
                <Badge tone="green">New</Badge>
                <span>Wardrobe — Master bedroom</span>
                <span className="ml-auto text-dark-500 dark:text-dark-400">
                  adds a new item
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="amber">Update</Badge>
                <span>TV unit — Living room</span>
                <span className="ml-auto text-dark-500 dark:text-dark-400">
                  changes an existing item
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="red">Remove</Badge>
                <span>False ceiling — Hall</span>
                <span className="ml-auto text-dark-500 dark:text-dark-400">
                  takes an item off
                </span>
              </div>
            </Mock>
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex gap-3">
          <StepNo n={3} />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
              Verify every row you trust
            </h3>
            <p className="text-sm text-dark-500 dark:text-dark-300">
              Tick the ✓ box on rows that are correct, or use <b>Verify all</b>.
              Only ticked rows go to the quotation. Red rows are missing a
              required field — fill it first.
            </p>
            <Mock caption="Edits save automatically as you type.">
              <div className="flex items-center justify-between">
                <span className="text-dark-500">2/3 verified</span>
                <span className="text-primary-600">Verify all</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-green-50/60 px-2 py-1 dark:bg-green-900/10">
                <span className="text-primary-600">☑</span>
                <Badge tone="green">New</Badge>
                <span>Wardrobe · 8x7 · ₹950</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-green-50/60 px-2 py-1 dark:bg-green-900/10">
                <span className="text-primary-600">☑</span>
                <Badge tone="amber">Update</Badge>
                <span>TV unit · ₹1,200</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1 dark:bg-red-900/10">
                <span className="text-dark-500 dark:text-dark-400">☐</span>
                <Badge tone="green">New</Badge>
                <span className="text-red-600 dark:text-red-400">
                  Mirror · rate missing
                </span>
              </div>
            </Mock>
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex gap-3">
          <StepNo n={4} />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
              Add to Quotation
            </h3>
            <p className="text-sm text-dark-500 dark:text-dark-300">
              Click <b>Add to Quotation (n)</b>. The quotation is created or
              updated, and the conversation is <b>done</b> — it is read-only
              from now on.
            </p>
            <Mock caption="To change it later, edit the quotation and save a version.">
              <div className="flex flex-wrap items-center gap-2">
                <MockButton tone="blue">Add to Quotation (2)</MockButton>
                <ArrowRight className="h-3.5 w-3.5 text-dark-500 dark:text-dark-400" />
                <Badge tone="blue">✓ Added to Quotation</Badge>
                <Lock className="h-3.5 w-3.5 text-blue-500" />
              </div>
            </Mock>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Order rule visual ─────────────────────────────────────────────────────────

function OrderRule() {
  const cp = (n: number, state: 'done' | 'next' | 'wait') => {
    const cls = {
      done: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      next: 'border-primary-400 bg-primary-500/10 text-primary-600',
      wait: 'border-line bg-primary-50/60 text-gray-400 dark:border-primary-300/15 dark:bg-dark-800 dark:text-dark-500',
    }[state];
    return (
      <span
        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${cls}`}
      >
        #{n}
      </span>
    );
  };
  return (
    <div className="grid gap-3">
      <div className={CARD}>
        <p className="mb-2 text-sm font-semibold text-dark-900 dark:text-white">
          Adding: oldest first
        </p>
        <div className="flex items-center gap-2">
          {cp(1, 'done')}
          <ArrowRight className="h-3.5 w-3.5 text-dark-500 dark:text-dark-400" />
          {cp(2, 'next')}
          <ArrowRight className="h-3.5 w-3.5 text-dark-500 dark:text-dark-400" />
          {cp(3, 'wait')}
        </div>
        <p className="mt-2 text-xs text-dark-500 dark:text-dark-400">
          #3 shows <b>“Waiting on older conversation”</b> until #2 is added.
        </p>
      </div>
    </div>
  );
}

// ── Quotation walkthrough ─────────────────────────────────────────────────────

function DesignBlocks() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Mark hotspots on an image
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          Open a design and click <b>Add hotspot</b>. Drag over an item to mark
          it, or click once to drop a pin.
        </p>
        <Mock caption="Fill in the label, material and size, then Save.">
          <div className="flex flex-wrap items-center gap-2">
            <MockButton tone="blue">Add hotspot</MockButton>
            <ArrowRight className="h-3.5 w-3.5 text-dark-500 dark:text-dark-400" />
            <Badge tone="green">Wardrobe saved</Badge>
          </div>
        </Mock>
      </div>
      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Add several in a row
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          After you save, the editor stays ready for the next spot. Press{' '}
          <b>Done adding</b> when finished. Click a marker any time to edit it
          or add it to the quotation.
        </p>
        <Mock caption="Cancel skips the current spot and keeps drawing.">
          <MockButton tone="ghost">Done adding</MockButton>
        </Mock>
      </div>
    </div>
  );
}

function VersionBlocks() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Save a version
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          Click <b>Save version</b> on the Quotation page. It keeps a copy of
          the quotation as it is now. Keep editing afterwards.
        </p>
      </div>
      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Attach images &amp; share
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          Open a version to attach design images to rooms, then create a link
          for your customer (prices shown or hidden).
        </p>
      </div>
      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Compare two versions
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          <b>Quotation → Saved versions → Compare</b> shows them side by side.
          Rows are marked Added, Changed or Removed, with the total difference.
        </p>
        <Mock caption="Pick any two versions, or the current quotation.">
          <div className="flex items-center gap-2">
            <Badge tone="green">Added 1</Badge>
            <Badge tone="amber">Changed 2</Badge>
            <Badge tone="red">Removed 1</Badge>
          </div>
        </Mock>
      </div>
    </div>
  );
}

function QuotationBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Read the header
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          Shows where the quotation stands and the money summary.
        </p>
        <Mock caption="Header of the Quotation page">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">Pending</Badge>
            <Badge tone="blue">Last saved: Version 2</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Initial', '₹4,50,000'],
              ['Negotiated', '₹4,10,000'],
              ['Difference', '− ₹40,000'],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg border border-line p-1.5 dark:border-primary-300/15"
              >
                <p className="text-[9px] uppercase text-dark-500 dark:text-dark-400">
                  {k}
                </p>
                <p className="font-bold text-dark-900 dark:text-white">{v}</p>
              </div>
            ))}
          </div>
        </Mock>
      </div>

      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Edit by hand anytime
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          Use <b>Add Item</b> or the pencil on a row. Enter the{' '}
          <b>Negotiated Price</b> once the client agrees on a number.
        </p>
        <Mock caption="Rooms are grouped; click a room to collapse it.">
          <div className="rounded-lg bg-dark-100/70 px-2 py-1 font-semibold dark:bg-dark-800">
            ▾ Master bedroom
          </div>
          <div className="flex justify-between px-2">
            <span>Wardrobe 8x7</span>
            <span>
              <s className="text-dark-500 dark:text-dark-400">₹56,000</s>{' '}
              ₹52,000
            </span>
          </div>
        </Mock>
      </div>

      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Compare versions
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          Open <b>Quotation → Saved versions → Compare</b>. Pick any two
          versions (or the current quotation) to see them side by side.
        </p>
        <Mock caption="Rows are marked Added, Changed or Removed.">
          <div className="flex items-center gap-2">
            <Badge tone="green">Added 1</Badge>
            <Badge tone="amber">Changed 1</Badge>
            <Badge tone="red">Removed 1</Badge>
          </div>
          <p className="text-dark-500">
            TV unit: rate <s>₹1,000</s> → ₹1,200
          </p>
        </Mock>
      </div>

      <div className={CARD}>
        <h3 className="font-extrabold tracking-tight text-dark-900 dark:text-white">
          Approve &amp; export
        </h3>
        <p className="text-sm text-dark-500 dark:text-dark-300">
          When the client says yes, click <b>Approve Quotation</b>. Use{' '}
          <b>Export Excel</b> any time to share a copy.
        </p>
        <Mock caption="Top-right buttons on the Quotation page">
          <div className="flex flex-wrap gap-2">
            <MockButton tone="ghost">Export Excel</MockButton>
            <MockButton tone="ghost">Compare versions</MockButton>
            <MockButton tone="ghost">+ Add Item</MockButton>
            <MockButton>Save version</MockButton>
            <span className="inline-block rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">
              Approve Quotation
            </span>
          </div>
        </Mock>
      </div>
    </div>
  );
}

// ── Troubleshooting ───────────────────────────────────────────────────────────

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Add to Quotation is greyed out',
    a: 'Check: (1) at least one row is ticked ✓, (2) no red rows with missing fields, (3) all older conversations are already added.',
  },
  {
    q: '“AI extraction ran and found no line items”',
    a: 'The notes had no billable work. Use + Add a line item to add rows yourself, or Re-run extraction after editing.',
  },
  {
    q: 'I need to change something a conversation added',
    a: 'Edit the quotation directly, then save a version. Conversations are not undone once added.',
  },
  {
    q: 'AI put something under “not turned into line items”',
    a: 'Those notes weren’t clear enough to price. Add them as rows manually if they matter.',
  },
  {
    q: 'Wrong room, rate or unit from AI',
    a: 'Edit the cell before verifying. AI is a draft — you always have the final say.',
  },
];

function Faq() {
  return (
    <div className="space-y-2">
      {FAQ.map((f) => (
        <details key={f.q} className={`${CARD} group !p-3 sm:!p-4`}>
          <summary className="cursor-pointer text-sm font-medium text-dark-900 dark:text-white">
            {f.q}
          </summary>
          <p className="mt-2 text-sm text-dark-500 dark:text-dark-300">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

// ── Basics ────────────────────────────────────────────────────────────────────

interface BasicCard {
  title: string;
  text: string;
  href: string;
}

const BASICS: BasicCard[] = [
  {
    title: '1 · Quotation Columns',
    text: 'Choose the columns your quotation rows use. Do this once.',
    href: '/dashboard/settings/columns',
  },
  {
    title: '2 · Material Library',
    text: 'Add materials via Excel, AI or manually so rates stay consistent.',
    href: '/dashboard/materials',
  },
  {
    title: '3 · Clients',
    text: 'Add a client — their conversations and quotation live inside.',
    href: '/dashboard/clients',
  },
  {
    title: 'Board & Dashboard',
    text: 'Switch Clients to Board view to track every client by stage; the Dashboard shows activity at a glance.',
    href: '/dashboard/board',
  },
];

function Basics() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {BASICS.map((b) => (
        <Link
          key={b.title}
          href={b.href}
          className={`${CARD} transition-colors hover:border-primary-400`}
        >
          <p className="text-sm font-semibold text-dark-900 dark:text-white">
            {b.title}
          </p>
          <p className="mt-1 text-xs text-dark-500 dark:text-dark-300">
            {b.text}
          </p>
        </Link>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SECTIONS: GuideSection[] = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'set-up', label: 'Set up' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'order-rule', label: 'Order rule' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'designs', label: 'Designs' },
  { id: 'versions', label: 'Versions' },
  { id: 'faq', label: 'FAQ' },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <GuideNav sections={SECTIONS} />
      <div className="space-y-10">
        <section id="how-it-works" className="scroll-mt-32">
          <SectionTitle
            title="How it works"
            sub="Every client meeting becomes a conversation. Verified conversations build the quotation."
          />
          <FlowDiagram />
        </section>

        <section id="set-up" className="scroll-mt-32">
          <SectionTitle
            title="Set up once"
            sub="Quick basics — open any card to get started."
          />
          <Basics />
        </section>

        <section id="conversations" className="scroll-mt-32">
          <SectionTitle
            title="Conversations"
            sub="Client → Conversations. Turn meeting notes into quotation changes."
          />
          <ConversationSteps />
        </section>

        <section id="order-rule" className="scroll-mt-32">
          <SectionTitle
            title="The order rule"
            sub="Conversations must follow the meeting timeline."
          />
          <OrderRule />
        </section>

        <section id="quotation" className="scroll-mt-32">
          <SectionTitle
            title="Quotation"
            sub="Client → Quotation. Your live, editable price sheet."
          />
          <QuotationBlocks />
        </section>

        <section id="designs" className="scroll-mt-32">
          <SectionTitle
            title="Designs & hotspots"
            sub="Client → Designs. Mark items on an image and link materials."
          />
          <DesignBlocks />
        </section>

        <section id="versions" className="scroll-mt-32">
          <SectionTitle
            title="Versions"
            sub="Client → Quotation → Saved versions. Saved copies you can share and compare."
          />
          <VersionBlocks />
        </section>

        <section id="faq" className="scroll-mt-32">
          <SectionTitle title="Stuck?" sub="Common questions." />
          <Faq />
        </section>
      </div>
    </div>
  );
}
