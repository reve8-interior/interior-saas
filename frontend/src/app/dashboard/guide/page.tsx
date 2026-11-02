import {
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  GitCompare,
  Images,
  Inbox,
  Link2,
  MessageCircle,
  PenLine,
  Search,
  Sofa,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GuideNav, type GuideSection } from './GuideNav';

// ── Building blocks ───────────────────────────────────────────────────────────

const CARD = 'surface p-4';
const H3 = 'font-extrabold tracking-tight text-dark-900 dark:text-white';
const MUTED = 'text-dark-500 dark:text-dark-400';

const BADGE_CLS = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  grey: 'bg-dark-100 text-dark-700 dark:bg-white/10 dark:text-dark-300',
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
      <p className={`text-sm ${MUTED}`}>{sub}</p>
    </div>
  );
}

/** A card: short title, one line, and a picture of what you will see. */
function Tile({
  n,
  title,
  line,
  children,
}: {
  n?: number;
  title: string;
  line: string;
  children?: ReactNode;
}) {
  return (
    <div className={`${CARD} flex flex-col`}>
      <div className="flex items-center gap-2">
        {n !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-bold text-primary-500">
            {n}
          </span>
        )}
        <h3 className={H3}>{title}</h3>
      </div>
      <p className={`mt-1 text-sm ${MUTED}`}>{line}</p>
      {children && (
        <div className="mt-3 flex-1 space-y-2 rounded-xl border border-line bg-primary-50/80 p-3 text-xs dark:bg-dark-950">
          {children}
        </div>
      )}
    </div>
  );
}

function Btn({
  tone = 'primary',
  children,
}: {
  tone?: 'primary' | 'blue' | 'ghost' | 'green';
  children: ReactNode;
}) {
  const cls = {
    primary: 'bg-brand text-white',
    blue: 'bg-blue-600 text-white',
    green: 'bg-green-600 text-white',
    ghost: 'border border-line text-dark-700 dark:text-dark-300',
  }[tone];
  return (
    <span
      className={`inline-block rounded-xl px-3 py-1.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function Row({
  tone,
  badge,
  label,
  note,
}: {
  tone: Tone;
  badge: string;
  label: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Badge tone={tone}>{badge}</Badge>
      <span>{label}</span>
      {note && <span className={`ml-auto ${MUTED}`}>{note}</span>}
    </div>
  );
}

/** A design image with numbered pins, used wherever hotspots are shown. */
function PinImage({ children }: { children?: ReactNode }) {
  return (
    <div className="relative h-28 overflow-hidden rounded-lg bg-gradient-to-br from-dark-200 to-dark-100 dark:from-dark-800 dark:to-dark-900">
      <span className="absolute left-[18%] top-[45%] flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-primary-600 shadow">
        <Sofa className="h-3.5 w-3.5" />
      </span>
      <span className="absolute left-[55%] top-[25%] flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold text-primary-600 shadow">
        2
      </span>
      <span className="absolute left-[75%] top-[60%] flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white shadow ring-4 ring-primary-500/30">
        3
      </span>
      {children}
    </div>
  );
}

// ── 1 · How it works ──────────────────────────────────────────────────────────

const FLOW: { label: string; icon: LucideIcon }[] = [
  { label: 'Add client', icon: Users },
  { label: 'Designs', icon: Images },
  { label: 'Quotation', icon: PenLine },
  { label: 'Save version', icon: GitCompare },
  { label: 'Share link', icon: Link2 },
  { label: 'Agreed', icon: CheckCircle2 },
];

function FlowDiagram() {
  return (
    <ol className="grid grid-cols-3 gap-2 md:flex md:items-stretch md:gap-1">
      {FLOW.map((s, i) => (
        <li key={s.label} className="flex min-w-0 items-center gap-1 md:flex-1">
          <div className="surface flex min-w-0 flex-1 flex-col items-center gap-2 p-3 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
              <s.icon className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-dark-900 dark:text-white">
              {i + 1}. {s.label}
            </p>
          </div>
          {i < FLOW.length - 1 && (
            <ArrowRight
              className={`hidden h-4 w-4 shrink-0 md:block ${MUTED}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

const WORDS: [string, string][] = [
  ['Client', 'One customer'],
  ['Quotation', 'Live price sheet'],
  ['Version', 'Saved copy'],
  ['Hotspot', 'Pin on an image'],
  ['Shared link', 'Customer view'],
];

function Words() {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {WORDS.map(([w, m]) => (
        <span key={w} className="surface px-3 py-1.5 text-xs">
          <b className="text-dark-900 dark:text-white">{w}</b>
          <span className={MUTED}> = {m}</span>
        </span>
      ))}
    </div>
  );
}

// ── 2 · Get started ───────────────────────────────────────────────────────────

const BASICS = [
  {
    t: '1 · Columns',
    d: 'Pick quotation columns',
    href: '/dashboard/settings/columns',
  },
  { t: '2 · Materials', d: 'Add your rates', href: '/dashboard/materials' },
  { t: '3 · Client', d: 'Add your first client', href: '/dashboard/clients' },
];

function Basics() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {BASICS.map((b) => (
        <Link
          key={b.t}
          href={b.href}
          className={`${CARD} transition-colors hover:border-primary-400`}
        >
          <p className="text-sm font-semibold text-dark-900 dark:text-white">
            {b.t}
          </p>
          <p className={`mt-1 text-xs ${MUTED}`}>{b.d}</p>
        </Link>
      ))}
    </div>
  );
}

// ── 3 · Find your way ─────────────────────────────────────────────────────────

function Navigation() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile title="Menu" line="Everything is one tap away.">
        {[
          'Dashboard',
          'Clients',
          'Portfolio',
          'Shared links',
          'Material Library',
          'Quotation Columns',
        ].map((m, i) => (
          <div
            key={m}
            className={`rounded-lg px-2 py-1 ${
              i === 1
                ? 'bg-brand text-white'
                : 'text-dark-700 dark:text-dark-300'
            }`}
          >
            {m}
          </div>
        ))}
      </Tile>
      <Tile title="Search" line="Press Ctrl + K (Cmd + K on Mac).">
        <div
          className={`flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5 dark:bg-dark-900 ${MUTED}`}
        >
          <Search className="h-3.5 w-3.5" /> Sharma…
        </div>
        <div className="rounded-lg bg-primary-600/10 px-2 py-1">
          Sharma · Quotation
        </div>
        <div className="px-2 py-1">Sharma · Designs</div>
      </Tile>
      <Tile title="Inbox" line="Customer messages wait here.">
        <div className="flex items-center gap-2">
          <span className="relative">
            <Inbox className="h-5 w-5 text-dark-700 dark:text-dark-300" />
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
              2
            </span>
          </span>
          <span>Sharma asked a question</span>
        </div>
        <Btn tone="ghost">Mark resolved</Btn>
      </Tile>
    </div>
  );
}

// ── 4 · Clients ───────────────────────────────────────────────────────────────

const PHASES = ['Discussion', 'Design', 'Quotation', 'Implementation', 'Done'];

function ClientBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile title="Stages" line="Move a client forward as work moves.">
        <div className="flex flex-wrap gap-1">
          {PHASES.map((p, i) => (
            <Badge key={p} tone={i === 2 ? 'blue' : 'grey'}>
              {p}
            </Badge>
          ))}
        </div>
        <Btn>Move to next</Btn>
      </Tile>
      <Tile title="Three tabs" line="Everything for a client is inside.">
        <div className="flex gap-1.5">
          <Badge tone="blue">Details</Badge>
          <Badge tone="grey">Designs</Badge>
          <Badge tone="grey">Quotation</Badge>
        </div>
        <p className={MUTED}>Red number = waiting on you</p>
      </Tile>
      <Tile title="Customer messages" line="Reply, then mark it resolved.">
        <Row tone="blue" badge="Question" label="“9 ft wardrobe?”" note="V2" />
        <div className="flex gap-2">
          <Btn tone="ghost">Mark resolved</Btn>
        </div>
      </Tile>
    </div>
  );
}

// ── 5 · Designs ───────────────────────────────────────────────────────────────

function DesignBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Tile n={1} title="Upload" line="Drop in images. Tag the room.">
        <div
          className={`rounded-lg border border-dashed border-line p-4 text-center ${MUTED}`}
        >
          Drop images here
        </div>
      </Tile>
      <Tile n={2} title="Add hotspot" line="Drag a box or click to pin.">
        <PinImage />
        <div className="flex gap-2">
          <Btn tone="blue">Add hotspot</Btn>
          <Btn tone="ghost">Done adding</Btn>
        </div>
      </Tile>
      <Tile n={3} title="Fill details" line="Name, material, size, cost.">
        <div className="space-y-1.5">
          {['Sofa 3-seater', 'Fabric · Grey', '7 x 3 ft · ₹58,000'].map((t) => (
            <div
              key={t}
              className="rounded-lg border border-line bg-white px-2 py-1 dark:bg-dark-900"
            >
              {t}
            </div>
          ))}
        </div>
        <Btn>Save</Btn>
      </Tile>
      <Tile n={4} title="To quotation" line="One hotspot, or Add all.">
        <Row tone="green" badge="In quotation" label="Sofa" note="₹58,000" />
        <p className={MUTED}>Tap it to jump to the row</p>
      </Tile>
      <Tile title="Customer view" line="See it as your customer will.">
        <PinImage />
        <div className={`flex items-center gap-1 ${MUTED}`}>
          <Eye className="h-3.5 w-3.5" /> Zoom · tap a pin for details
        </div>
      </Tile>
      <Tile title="Portfolio" line="Tick designs, then Add to portfolio.">
        <div className="flex gap-1.5">
          <Btn tone="ghost">☑ Add to portfolio</Btn>
          <Btn tone="ghost">Share</Btn>
        </div>
      </Tile>
    </div>
  );
}

// ── 6 · Quotation ─────────────────────────────────────────────────────────────

function QuotationBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile title="Top strip" line="Status, versions, customer views.">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="amber">Draft</Badge>
          <Badge tone="blue">2 versions</Badge>
          <Badge tone="grey">Opened 3×</Badge>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ['Initial', '₹4.5L'],
            ['Negotiated', '₹4.1L'],
            ['Off', '−₹40K'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 p-1.5">
              <p className={`text-[9px] uppercase ${MUTED}`}>{k}</p>
              <p className="font-bold text-dark-900 dark:text-white">{v}</p>
            </div>
          ))}
        </div>
      </Tile>
      <Tile title="Add rows" line="Enter = next row. Library fills it.">
        <div className="rounded-lg bg-dark-100/70 px-2 py-1 font-semibold dark:bg-dark-800">
          ▾ Master bedroom
        </div>
        <div className="flex justify-between px-2">
          <span>Wardrobe 8x7</span>
          <span>
            <s className={MUTED}>₹56,000</s> ₹52,000
          </span>
        </div>
        <Btn tone="ghost">Add rows by hand</Btn>
      </Tile>
      <Tile title="Fix gaps" line="Warning shows rows missing info.">
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
          ⚠ 2 items need clarity
        </span>
        <p className="underline">Show only these</p>
      </Tile>
    </div>
  );
}

// ── 7 · Meeting notes ─────────────────────────────────────────────────────────

function NotesSteps() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Tile n={1} title="Paste notes" line="Quotation → Add from notes.">
        <div
          className={`rounded-lg border border-dashed border-line p-2 ${MUTED}`}
        >
          “Add wardrobe 8x7, TV unit ₹1,200, remove false ceiling…”
        </div>
        <Btn>
          <Sparkles className="mr-1 inline h-3 w-3" />
          Extract
        </Btn>
      </Tile>
      <Tile n={2} title="Check the rows" line="AI drafts. You decide.">
        <Row tone="green" badge="New" label="Wardrobe" />
        <Row tone="amber" badge="Update" label="TV unit" />
        <Row tone="red" badge="Remove" label="False ceiling" />
      </Tile>
      <Tile n={3} title="Answer questions" line="One tap adds it to the notes.">
        <p>Wardrobes in 3 rooms. 23K for all?</p>
        <p className="text-primary-600">+ Add this sentence</p>
      </Tile>
      <Tile n={4} title="Verify & add" line="Tick ✓ rows, then add.">
        <div className="flex justify-between">
          <span className={MUTED}>2/3 verified</span>
          <span className="text-primary-600">Verify all</span>
        </div>
        <Btn tone="blue">Add to Quotation (2)</Btn>
      </Tile>
    </div>
  );
}

// ── 8 · Versions ──────────────────────────────────────────────────────────────

function VersionBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Tile title="Save" line="Top right of the Quotation.">
        <Btn>Save version</Btn>
        <p className={MUTED}>Keep editing after.</p>
      </Tile>
      <Tile title="List" line="Quotation → Versions.">
        <Row tone="green" badge="Agreed" label="Version 2" />
        <Row tone="blue" badge="Shared" label="Version 1" />
      </Tile>
      <Tile title="Compare" line="Any two versions.">
        <div className="flex gap-1.5">
          <Badge tone="green">Added 1</Badge>
          <Badge tone="amber">Changed 2</Badge>
          <Badge tone="red">Removed 1</Badge>
        </div>
      </Tile>
      <Tile title="⋯ Menu" line="On every version.">
        <div className="space-y-1">
          <p>
            <Download className="mr-1 inline h-3 w-3" />
            Export Excel
          </p>
          <p>Restore this version</p>
          <p>Mark as agreed</p>
        </div>
      </Tile>
    </div>
  );
}

// ── 9 · Sharing ───────────────────────────────────────────────────────────────

function SharingBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Tile n={1} title="Create link" line="Open a version → Share.">
        <div className="flex gap-1.5">
          <Badge tone="green">Prices shown</Badge>
          <Badge tone="grey">Expires 30 days</Badge>
        </div>
        <Btn>Create link</Btn>
      </Tile>
      <Tile n={2} title="Send" line="WhatsApp, email or copy.">
        <div className="flex gap-1.5">
          <Btn tone="green">
            <MessageCircle className="mr-1 inline h-3 w-3" />
            WhatsApp
          </Btn>
          <Btn tone="ghost">Copy</Btn>
        </div>
      </Tile>
      <Tile n={3} title="Customer replies" line="Approve or ask a question.">
        <div className="rounded-lg border border-line bg-white p-2 dark:bg-dark-900">
          <div className="flex gap-1.5">
            <Btn tone="green">Approve</Btn>
            <Btn tone="ghost">Ask a question</Btn>
          </div>
        </div>
      </Tile>
      <Tile
        n={4}
        title="It lands in your Inbox"
        line="Reply sits on top of that version."
      >
        <Row tone="blue" badge="Question" label="Version 2" />
        <div className="flex flex-wrap gap-1.5">
          <Btn tone="ghost">WhatsApp</Btn>
          <Btn tone="ghost">Mark as agreed</Btn>
        </div>
      </Tile>
      <Tile title="Same link, new version" line="Customer keeps one address.">
        <p>Show version 3 on this link</p>
      </Tile>
      <Tile title="Link expired?" line="Shared links → Extend 30 days.">
        <Row tone="red" badge="Expired" label="Sharma" />
      </Tile>
      <Tile title="Designs link" line="Tick designs → Share.">
        <Btn tone="ghost">Update link</Btn>
      </Tile>
      <Tile title="Portfolio link" line="Portfolio → Share portfolio.">
        <Btn tone="ghost">Share portfolio</Btn>
      </Tile>
    </div>
  );
}

// ── 10 · Team ─────────────────────────────────────────────────────────────────

function TeamBlocks() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile title="Admin" line="Everything, plus Team.">
        <Badge tone="blue">All clients</Badge>
      </Tile>
      <Tile title="Designer" line="Only clients given to them.">
        <Badge tone="green">Selected clients</Badge>
      </Tile>
      <Tile title="Viewer" line="Can look, cannot edit.">
        <Badge tone="grey">Read-only</Badge>
      </Tile>
    </div>
  );
}

// ── 11 · FAQ ──────────────────────────────────────────────────────────────────

const FAQ: { q: string; a: string }[] = [
  {
    q: '“Add from notes” is missing or says AI is off',
    a: 'AI is not on for your business. Add rows by hand, or ask your admin.',
  },
  {
    q: 'Add to Quotation is greyed out',
    a: 'Tick at least one row, and fill any red row first.',
  },
  {
    q: 'AI got something wrong',
    a: 'Edit the cell before ticking. AI only drafts.',
  },
  {
    q: 'Customer sees an old version',
    a: 'Share the new version and choose “Show version N on this link”.',
  },
  {
    q: 'Customer link does not open',
    a: 'It expired. Shared links → extend 30 days. Same address.',
  },
  {
    q: 'I deleted something by mistake',
    a: 'Tap Undo right away, or restore an older version.',
  },
  {
    q: 'A client or button is missing',
    a: 'Designers see only given clients; viewers cannot edit. Ask an admin.',
  },
  {
    q: 'Forgot password',
    a: 'Ask your admin to reset it on the Team page.',
  },
];

function Faq() {
  return (
    <div className="space-y-2">
      {FAQ.map((f) => (
        <details key={f.q} className={`${CARD} !p-3`}>
          <summary className="cursor-pointer text-sm font-medium text-dark-900 dark:text-white">
            {f.q}
          </summary>
          <p className={`mt-2 text-sm ${MUTED}`}>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SECTIONS: GuideSection[] = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'set-up', label: 'Start' },
  { id: 'navigate', label: 'Menu' },
  { id: 'clients', label: 'Clients' },
  { id: 'designs', label: 'Designs' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'meeting-notes', label: 'Meeting notes' },
  { id: 'versions', label: 'Versions' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'team', label: 'Team' },
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
            sub="First meeting to agreed price in 6 steps."
          />
          <FlowDiagram />
          <Words />
        </section>

        <section id="set-up" className="scroll-mt-32">
          <SectionTitle title="Start here" sub="Do these 3 once." />
          <Basics />
        </section>

        <section id="navigate" className="scroll-mt-32">
          <SectionTitle title="Menu, search, inbox" sub="Get around fast." />
          <Navigation />
        </section>

        <section id="clients" className="scroll-mt-32">
          <SectionTitle title="Clients" sub="Menu → Clients" />
          <ClientBlocks />
        </section>

        <section id="designs" className="scroll-mt-32">
          <SectionTitle title="Designs & hotspots" sub="Client → Designs" />
          <DesignBlocks />
        </section>

        <section id="quotation" className="scroll-mt-32">
          <SectionTitle title="Quotation" sub="Client → Quotation → Items" />
          <QuotationBlocks />
        </section>

        <section id="meeting-notes" className="scroll-mt-32">
          <SectionTitle
            title="Meeting notes (AI)"
            sub="Optional. Quotation → Add from notes"
          />
          <NotesSteps />
        </section>

        <section id="versions" className="scroll-mt-32">
          <SectionTitle title="Versions" sub="Client → Quotation → Versions" />
          <VersionBlocks />
        </section>

        <section id="sharing" className="scroll-mt-32">
          <SectionTitle
            title="Sharing"
            sub="Customer opens a link. No login."
          />
          <SharingBlocks />
        </section>

        <section id="team" className="scroll-mt-32">
          <SectionTitle title="Team" sub="Menu → Team (admins)" />
          <TeamBlocks />
        </section>

        <section id="faq" className="scroll-mt-32">
          <SectionTitle title="Stuck?" sub="Tap a question." />
          <Faq />
        </section>
      </div>
    </div>
  );
}
