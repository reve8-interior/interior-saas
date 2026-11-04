'use client';

import { Collapsible } from '@/components/ui/Collapsible';
import { Switch } from '@/components/ui/Switch';
import { INPUT_CLS } from '@/lib/constants';
import type { ReactNode } from 'react';
import type {
  SiteService,
  SiteSettings,
  SiteSettingsInput,
  SiteSocial,
} from '@/lib/schemas/site';
import {
  ABOUT_MAX,
  SERVICES_MAX,
  SOCIALS_MAX,
  TAGLINE_MAX,
  validateSiteInput,
} from '@/lib/siteForm';
import { FormEvent, useState } from 'react';

interface SiteProfileFormProps {
  settings: SiteSettings;
  saving: boolean;
  onSave: (input: SiteSettingsInput) => void;
  /** Extra sections rendered between the profile groups and the Save button. */
  children?: ReactNode;
}

const FORM_ID = 'site-profile-form';

function patch<T>(list: T[], i: number, change: Partial<T>): T[] {
  return list.map((item, idx) => (idx === i ? { ...item, ...change } : item));
}

interface ProfileValues {
  tagline: string;
  about: string;
  phone: string;
  email: string;
  address: string;
  services: SiteService[];
  socials: SiteSocial[];
  hideBadge: boolean;
}

/** Trimmed payload for the API; also the shape compared to detect unsaved changes. */
function toInput(v: ProfileValues, canHideBadge: boolean): SiteSettingsInput {
  return {
    tagline: v.tagline.trim(),
    about: v.about.trim(),
    phone: v.phone.trim(),
    email: v.email.trim(),
    address: v.address.trim(),
    services: v.services.map((s) => ({
      title: s.title.trim(),
      description: s.description.trim(),
    })),
    socials: v.socials.map((s) => ({
      label: s.label.trim(),
      url: s.url.trim(),
    })),
    ...(canHideBadge ? { hide_badge: v.hideBadge } : {}),
  };
}

function fromSettings(settings: SiteSettings): ProfileValues {
  return {
    tagline: settings.tagline ?? '',
    about: settings.about ?? '',
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    address: settings.address ?? '',
    services: settings.services,
    socials: settings.socials,
    hideBadge: settings.hide_badge,
  };
}

/** Text content of the public site: tagline, about, services, links, contact. */
export function SiteProfileForm({
  settings,
  saving,
  onSave,
  children,
}: SiteProfileFormProps) {
  const [tagline, setTagline] = useState(settings.tagline ?? '');
  const [about, setAbout] = useState(settings.about ?? '');
  const [phone, setPhone] = useState(settings.phone ?? '');
  const [email, setEmail] = useState(settings.email ?? '');
  const [address, setAddress] = useState(settings.address ?? '');
  const [services, setServices] = useState<SiteService[]>(settings.services);
  const [socials, setSocials] = useState<SiteSocial[]>(settings.socials);
  const [hideBadge, setHideBadge] = useState(settings.hide_badge);
  const [error, setError] = useState('');

  // Compared against the saved settings, so the button re-disables once a save comes back.
  const input = toInput(
    { tagline, about, phone, email, address, services, socials, hideBadge },
    settings.can_hide_badge
  );
  const dirty =
    JSON.stringify(input) !==
    JSON.stringify(toInput(fromSettings(settings), settings.can_hide_badge));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = validateSiteInput(input);
    setError(problem ?? '');
    if (!problem) onSave(input);
  }

  return (
    <div className="space-y-4">
      <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
        <Collapsible title="About your studio" summary={tagline.trim() || null}>
          <div className="space-y-5">
            <div>
              <label htmlFor="site-tagline" className="label-text">
                Tagline
              </label>
              <input
                id="site-tagline"
                className={INPUT_CLS}
                value={tagline}
                maxLength={TAGLINE_MAX}
                onChange={(e) => setTagline(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="site-about" className="label-text">
                About
              </label>
              <textarea
                id="site-about"
                className={`${INPUT_CLS} min-h-32`}
                value={about}
                maxLength={ABOUT_MAX}
                onChange={(e) => setAbout(e.target.value)}
              />
            </div>
          </div>
        </Collapsible>

        <Collapsible
          title="Services"
          summary={`${services.length} of ${SERVICES_MAX}`}
        >
          <fieldset className="space-y-3">
            <legend className="sr-only">Services (up to {SERVICES_MAX})</legend>
            {services.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label={`Service ${i + 1} title`}
                  className={INPUT_CLS}
                  placeholder="Title"
                  value={s.title}
                  maxLength={80}
                  onChange={(e) =>
                    setServices(patch(services, i, { title: e.target.value }))
                  }
                />
                <input
                  aria-label={`Service ${i + 1} description`}
                  className={INPUT_CLS}
                  placeholder="Description"
                  value={s.description}
                  maxLength={300}
                  onChange={(e) =>
                    setServices(
                      patch(services, i, { description: e.target.value })
                    )
                  }
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() =>
                    setServices(services.filter((_, j) => j !== i))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {services.length < SERVICES_MAX && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setServices([...services, { title: '', description: '' }])
                }
              >
                Add service
              </button>
            )}
          </fieldset>
        </Collapsible>

        <Collapsible
          title="Links"
          summary={`${socials.length} of ${SOCIALS_MAX}`}
        >
          <fieldset className="space-y-3">
            <legend className="sr-only">Links (up to {SOCIALS_MAX})</legend>
            {socials.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label={`Link ${i + 1} label`}
                  className={INPUT_CLS}
                  placeholder="Label, e.g. Instagram"
                  value={s.label}
                  maxLength={40}
                  onChange={(e) =>
                    setSocials(patch(socials, i, { label: e.target.value }))
                  }
                />
                <input
                  aria-label={`Link ${i + 1} URL`}
                  className={INPUT_CLS}
                  placeholder="https://"
                  value={s.url}
                  inputMode="url"
                  onChange={(e) =>
                    setSocials(patch(socials, i, { url: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => setSocials(socials.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            {socials.length < SOCIALS_MAX && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSocials([...socials, { label: '', url: '' }])}
              >
                Add link
              </button>
            )}
          </fieldset>
        </Collapsible>

        <Collapsible title="Contact details">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="site-phone" className="label-text">
                  Phone
                </label>
                <input
                  id="site-phone"
                  className={INPUT_CLS}
                  value={phone}
                  maxLength={40}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="site-email" className="label-text">
                  Email
                </label>
                <input
                  id="site-email"
                  type="email"
                  className={INPUT_CLS}
                  value={email}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="site-address" className="label-text">
                  Address
                </label>
                <input
                  id="site-address"
                  className={INPUT_CLS}
                  value={address}
                  maxLength={300}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            {settings.can_hide_badge && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Hide the Reve8 badge on my site</span>
                <Switch
                  checked={hideBadge}
                  onChange={setHideBadge}
                  label="Hide the Reve8 badge"
                />
              </div>
            )}
          </div>
        </Collapsible>
      </form>

      {/* Outside the form (it may hold forms of its own); the button below still submits it via `form`. */}
      {children}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        form={FORM_ID}
        className="btn-primary"
        disabled={saving || !dirty}
      >
        {saving ? 'Saving…' : 'Save website'}
      </button>
    </div>
  );
}
