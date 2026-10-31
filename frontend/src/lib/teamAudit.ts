'use client';

import { AuditEntry } from '@/lib/schemas/business';

/** One readable line per audit event. */
export function describeAudit(e: AuditEntry): string {
  const p = e.payload as Record<string, unknown>;
  const who = typeof p.email === 'string' ? p.email : 'a member';
  switch (e.action) {
    case 'team.member_added':
      return `Added ${who} as ${String(p.role)}`;
    case 'team.member_removed':
      return `Removed ${who}${
        Number(p.clients_reassigned) > 0
          ? ` (${String(p.clients_reassigned)} clients reassigned)`
          : ''
      }`;
    case 'team.password_reset':
      return `Reset password for ${who}`;
    case 'team.member_updated': {
      const changes = (p.changes ?? {}) as Record<
        string,
        { from: unknown; to: unknown }
      >;
      const parts = Object.entries(changes).map(([field, c]) =>
        field === 'is_active'
          ? c.to
            ? 'enabled'
            : 'disabled'
          : `${field} ${String(c.from)} → ${String(c.to)}`
      );
      return `Updated ${who}: ${parts.join(', ') || 'no changes'}`;
    }
    case 'access.client_updated':
      return `Changed who can see client ${String(p.client)} (+${String(p.granted)} / -${String(p.revoked)})`;
    case 'access.member_updated':
      return `Changed client access for ${who} (+${String(p.granted)} / -${String(p.revoked)})`;
    case 'auth.login':
      return 'Signed in';
    case 'auth.password_changed':
      return 'Changed their password';
    case 'business.created':
      return 'Business created';
    case 'business.updated': {
      const fields = Object.keys((p.changes ?? {}) as object);
      return `Business settings changed: ${fields.join(', ')}`;
    }
    case 'business.activated':
      return 'Business activated';
    case 'business.deactivated':
      return 'Business deactivated';
    default:
      return e.action;
  }
}
