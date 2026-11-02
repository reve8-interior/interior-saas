import { DeviceShot } from '@/components/landing/DeviceShot';
import {
  DesignLinkDemo,
  QuotationLinkDemo,
} from '@/components/landing/LinkDemos';
import {
  ExtractMockup,
  PipelineMockup,
  VersionDiffMockup,
} from '@/components/landing/Mockups';
import { PricingTable } from '@/components/landing/PricingTable';
import { ThemeProvider } from '@/components/providers';
import { ThemeButton } from '@/components/shared/CustomerChrome';
import { Logo } from '@/components/ui/Logo';
import { REQUEST_ACCESS_EMAIL, REQUEST_ACCESS_HREF } from '@/lib/constants';
import { getPublicPlans } from '@/lib/publicPlans';
import {
  Check,
  ClipboardList,
  FileText,
  GitCompare,
  Images,
  KanbanSquare,
  Link2,
  MessageCircle,
  Package,
  PenLine,
  Send,
  Sparkles,
  ThumbsUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

/** The root layout starts every page dark; without a saved choice, the landing page switches to light before paint. */
const LIGHT_DEFAULT_SCRIPT = `try{if(!localStorage.getItem('theme'))document.documentElement.classList.remove('dark')}catch(e){}`;

const AUTH_COOKIE = 'designer_token';

export const metadata: Metadata = {
  title:
    'reve8 Studio: quotations and client collaboration for interior designers',
  description:
    'Run every client from first discussion to handover: versioned quotations, design reviews, shared links and meeting notes in one portal.',
  openGraph: {
    title: 'reve8 Studio',
    description:
      'Quotations and client collaboration for interior designers, by reve8.',
    type: 'website',
  },
};

const HEADING =
  'font-heading font-extrabold tracking-tight text-dark-900 dark:text-white';
const MUTED = 'text-dark-500 dark:text-dark-400';
const SECTION = 'mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20';

interface Feature {
  icon: LucideIcon;
  title: string;
  line: string;
}

const FLOW: Feature[] = [
  {
    icon: ClipboardList,
    title: 'Add the client',
    line: 'Capture the brief and drop them into the pipeline.',
  },
  {
    icon: PenLine,
    title: 'Log the meeting',
    line: 'Write free-form notes. Questions are tracked until answered.',
  },
  {
    icon: Sparkles,
    title: 'Extract the items',
    line: 'AI suggests quotation items from your notes. You review and apply.',
  },
  {
    icon: Images,
    title: 'Show the design',
    line: 'Pin items on design images so clients can see what each piece is.',
  },
  {
    icon: Send,
    title: 'Share a link',
    line: 'Send the quotation or designs. The client needs no account.',
  },
  {
    icon: ThumbsUp,
    title: 'Client approves',
    line: 'They approve or ask a question. Every version stays on record.',
  },
];

const CLIENT_CAN = [
  'Read every line item with size, quantity, rate and total, room by room.',
  'See the designs, zoom in and tap pins for the material and rate.',
  'Ask a question or request a change, without a separate chat.',
  'Approve the quotation with one tap. You see it on their record.',
];

const BENEFITS: { title: string; line: string }[] = [
  {
    title: 'Stop retyping',
    line: 'Meeting notes become quotation items, so the first draft takes minutes, not an evening.',
  },
  {
    title: 'Never lose a revision',
    line: 'Every change is a saved version. Compare any two and show the client what moved.',
  },
  {
    title: 'Clients stay in the loop',
    line: 'One link shows the latest quotation and designs. No more "which file is final?".',
  },
  {
    title: 'Your whole team, one record',
    line: 'Everyone sees the same client history, messages and notes instead of scattered chats.',
  },
];

const MODULES: Feature[] = [
  {
    icon: KanbanSquare,
    title: 'Client pipeline',
    line: 'Discussion to completed, with what needs attention.',
  },
  {
    icon: FileText,
    title: 'Quotations',
    line: 'Room-wise line items with exports.',
  },
  {
    icon: GitCompare,
    title: 'Version compare',
    line: 'See added, changed and removed items.',
  },
  {
    icon: MessageCircle,
    title: 'Messages and notes',
    line: 'Customer messages with resolve state.',
  },
  {
    icon: Package,
    title: 'Materials and rates',
    line: 'Your price list, reused across quotations.',
  },
  { icon: Users, title: 'Team', line: 'Invite your designers to the studio.' },
  {
    icon: Images,
    title: 'Designs and portfolio',
    line: 'Zoomable images with item details.',
  },
  {
    icon: Link2,
    title: 'Shared links',
    line: 'Quotation, design and portfolio links.',
  },
];

/** One alternating text + visual row. */
function FeatureRow({
  eyebrow,
  title,
  points,
  reverse = false,
  children,
}: {
  eyebrow: string;
  title: string;
  points: string[];
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:gap-14 lg:py-16">
      <div className={reverse ? 'lg:order-2' : ''}>
        <p className="eyebrow">{eyebrow}</p>
        <h3 className={`${HEADING} mt-2 text-2xl sm:text-3xl`}>{title}</h3>
        <ul className="mt-5 space-y-3">
          {points.map((p) => (
            <li key={p} className={`flex gap-2.5 text-sm ${MUTED}`}>
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? 'lg:order-1' : ''}>{children}</div>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className={`${HEADING} mt-2 text-2xl sm:text-4xl`}>{title}</h2>
    </div>
  );
}

/** Signed-in designers skip the landing page and go straight to their dashboard. */
export default async function Page() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (token) redirect('/dashboard');
  const plans = await getPublicPlans();

  return (
    <ThemeProvider defaultTheme="light">
      <script dangerouslySetInnerHTML={{ __html: LIGHT_DEFAULT_SCRIPT }} />
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
            <Logo size={26} />
            <nav className="ml-4 hidden items-center gap-6 text-sm font-medium md:flex">
              {[
                ['#flow', 'How it works'],
                ['#viewer', 'Client view'],
                ['#features', 'Features'],
                ['#benefits', 'Benefits'],
                ...(plans.length ? [['#pricing', 'Pricing']] : []),
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className={`hover:text-primary-600 dark:hover:text-primary-400 ${MUTED}`}
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ThemeButton />
              <Link href="/login" className="btn-secondary btn-sm">
                Log in
              </Link>
              <a
                href={REQUEST_ACCESS_HREF}
                className="btn-primary btn-sm hidden sm:inline-flex"
              >
                Request access
              </a>
            </div>
          </div>
        </header>

        <main>
          <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-10 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="text-center lg:text-left">
              <p className="eyebrow">For interior designers</p>
              <h1 className={`${HEADING} mt-3 text-4xl sm:text-6xl`}>
                Share the design. Share the quote. Get it approved.
              </h1>
              <p className={`mt-5 text-base sm:text-lg ${MUTED}`}>
                reve8 Studio runs the whole project in one place: clients,
                meeting notes, designs and versioned quotations. Nothing for
                your client to install or log into.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <a href={REQUEST_ACCESS_HREF} className="btn-primary btn-lg">
                  Request access
                </a>
                <a href="#flow" className="btn-secondary btn-lg">
                  See how it works
                </a>
              </div>
              <p className={`mt-4 text-xs ${MUTED}`}>
                Accounts are set up by us. Already have one?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-primary-600 dark:text-primary-400"
                >
                  Log in
                </Link>
              </p>
            </div>
            <div>
              <DeviceShot
                shots={[{ key: 'qa' }]}
                url="portal.reve8.com/quotation/…"
                alt="A shared quotation, on desktop and phone"
                eager
              />
            </div>
          </section>

          <section className="border-y border-line bg-surface-2/40">
            <p
              className={`mx-auto max-w-3xl px-4 py-8 text-center text-base sm:text-lg ${MUTED}`}
            >
              Keep your design tools. reve8 Studio handles the paperwork around
              them: the notes, the quotes, the revisions and the approvals.
            </p>
          </section>

          <section id="flow" className={`${SECTION} scroll-mt-16`}>
            <SectionHead
              eyebrow="How it works"
              title="From first meeting to approved quotation"
            />
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW.map(({ icon: Icon, title, line }, i) => (
                <li key={title} className="surface relative p-5">
                  <span className="absolute right-4 top-4 text-3xl font-extrabold text-dark-200 dark:text-dark-800">
                    {i + 1}
                  </span>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={HEADING}>{title}</h3>
                  <p className={`mt-1 text-sm ${MUTED}`}>{line}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="viewer" className={`${SECTION} scroll-mt-16`}>
            <SectionHead
              eyebrow="What your client sees"
              title="Two links. Everything they need."
            />
            <ul className="mx-auto mb-14 grid max-w-3xl gap-3 sm:grid-cols-2">
              {CLIENT_CAN.map((text) => (
                <li key={text} className={`flex gap-2.5 text-sm ${MUTED}`}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  {text}
                </li>
              ))}
            </ul>
            <div className="space-y-16">
              <div>
                <h3
                  className={`${HEADING} mb-6 text-center text-xl sm:text-2xl`}
                >
                  The quotation link
                </h3>
                <QuotationLinkDemo />
              </div>
              <div>
                <h3
                  className={`${HEADING} mb-6 text-center text-xl sm:text-2xl`}
                >
                  The design link
                </h3>
                <DesignLinkDemo />
              </div>
            </div>
          </section>

          <section id="features" className={`${SECTION} scroll-mt-16 pt-4`}>
            <SectionHead
              eyebrow="Features"
              title="Everything a project needs, in one tab"
            />
            <FeatureRow
              eyebrow="Pipeline"
              title="Every client, at a glance"
              points={[
                'Five phases from discussion to completed.',
                'See which clients need your attention first.',
                'Your team works from the same board.',
              ]}
            >
              <PipelineMockup />
            </FeatureRow>
            <FeatureRow
              eyebrow="AI extract"
              title="Meeting notes become quotation items"
              reverse
              points={[
                'Write notes the way you talk. No forms to fill.',
                'AI suggests the items and rooms. You review before anything is added.',
                'Open questions stay flagged until you resolve them.',
              ]}
            >
              <ExtractMockup />
            </FeatureRow>
            <FeatureRow
              eyebrow="Versions"
              title="Your client changed their mind. Again."
              points={[
                'Every revision is saved as a version.',
                'Compare any two versions and see added, changed and removed items.',
                'Clients see only the latest, so nobody works from an old file.',
              ]}
            >
              <VersionDiffMockup />
            </FeatureRow>
          </section>

          <section
            id="benefits"
            className="scroll-mt-16 border-y border-line bg-surface-2/40"
          >
            <div className={SECTION}>
              <SectionHead
                eyebrow="Benefits"
                title="Less paperwork. Fewer surprises."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {BENEFITS.map(({ title, line }, i) => (
                  <div key={title} className="surface flex gap-4 p-5">
                    <span className="text-2xl font-extrabold text-primary-500">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className={HEADING}>{title}</h3>
                      <p className={`mt-1 text-sm ${MUTED}`}>{line}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={SECTION}>
            <SectionHead
              eyebrow="Everything inside"
              title="One portal, eight tools"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MODULES.map(({ icon: Icon, title, line }) => (
                <div key={title} className="surface p-4">
                  <Icon className="mb-2 h-5 w-5 text-primary-500" />
                  <h3 className={`${HEADING} text-sm`}>{title}</h3>
                  <p className={`mt-1 text-xs ${MUTED}`}>{line}</p>
                </div>
              ))}
            </div>
          </section>

          {plans.length > 0 && (
            <section id="pricing" className={`${SECTION} scroll-mt-16`}>
              <SectionHead
                eyebrow="Pricing"
                title="Simple plans for every studio"
              />
              <PricingTable plans={plans} />
            </section>
          )}

          <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6">
            <div className="surface p-8 sm:p-12">
              <h2 className={`${HEADING} text-2xl sm:text-3xl`}>
                Want to run your studio on reve8?
              </h2>
              <p className={`mt-3 text-sm ${MUTED}`}>
                Accounts are set up by us. Write to {REQUEST_ACCESS_EMAIL} and
                we will get you started.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href={REQUEST_ACCESS_HREF} className="btn-primary btn-lg">
                  Request access
                </a>
                <Link href="/login" className="btn-secondary btn-lg">
                  Log in
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer
          className={`border-t border-line px-4 py-6 text-center text-sm ${MUTED}`}
        >
          reve8 Studio is a product of{' '}
          <a
            href="https://reve8.com"
            className="font-medium hover:text-primary-600 dark:hover:text-primary-400"
          >
            reve8
          </a>
          .
        </footer>
      </div>
    </ThemeProvider>
  );
}
