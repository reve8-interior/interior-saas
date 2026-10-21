import { describeAudit } from '@/components/team/TeamManager';
import { businessTeamApi, ownTeamApi } from '@/lib/team';
import { AuditEntry } from '@/lib/schemas/business';
import { describe, expect, it } from 'vitest';

const entry = (
  action: string,
  payload: Record<string, unknown>
): AuditEntry => ({
  id: '1',
  timestamp: '2026-10-20T10:00:00Z',
  action,
  entity_type: 'user',
  entity_id: null,
  payload,
  actor_id: null,
  actor_email: null,
  actor_name: null,
});

describe('describeAudit', () => {
  it('summarises role changes', () => {
    const text = describeAudit(
      entry('team.member_updated', {
        email: 'a@x.com',
        changes: { role: { from: 'designer', to: 'viewer' } },
      })
    );
    expect(text).toBe('Updated a@x.com: role designer → viewer');
  });

  it('mentions reassigned clients on removal', () => {
    const text = describeAudit(
      entry('team.member_removed', { email: 'a@x.com', clients_reassigned: 3 })
    );
    expect(text).toContain('3 clients reassigned');
  });

  it('falls back to the raw action', () => {
    expect(describeAudit(entry('something.new', {}))).toBe('something.new');
  });
});

describe('team api keys', () => {
  it('keeps each business cache separate', () => {
    expect(businessTeamApi('b1').key).not.toEqual(businessTeamApi('b2').key);
    expect(businessTeamApi('b1').key).not.toEqual(ownTeamApi.key);
  });
});
