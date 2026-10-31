export interface NextStep {
  title: string;
  hint: string;
  href: string;
}

/**
 * The one thing to do next for a client. Meeting notes are optional, so a
 * quotation built by hand moves on without them.
 */
export function nextStep(
  base: string,
  state: {
    /** Oldest meeting whose rows still wait to go into the quotation. */
    reviewCheckpointId: string | null;
    hasRows: boolean;
    hasVersions: boolean;
    hasDesigns: boolean;
  }
): NextStep | null {
  if (state.reviewCheckpointId) {
    return {
      title: 'Review the meeting rows',
      hint: 'Check the drafted rows and add them to the quotation.',
      href: `${base}/checkpoints#checkpoint-${state.reviewCheckpointId}`,
    };
  }
  if (!state.hasRows) {
    return {
      title: 'Add your first items',
      hint: 'Type them in, or fill the quotation from meeting notes.',
      href: `${base}/quotation`,
    };
  }
  if (!state.hasVersions) {
    return {
      title: 'Save the first version',
      hint: 'A saved version can be shared with the client and compared later.',
      href: `${base}/versions?new=1`,
    };
  }
  if (!state.hasDesigns) {
    return {
      title: 'Upload a design',
      hint: 'Mark the items in an image so the client can tap them.',
      href: `${base}/designs`,
    };
  }
  return null;
}
