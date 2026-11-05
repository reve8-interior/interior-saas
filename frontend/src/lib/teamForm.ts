export const MIN_PASSWORD_LENGTH = 8;

// No look-alike characters (0/O, 1/l/I) so the password can be read aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Random temporary password using the browser CSPRNG. */
export function generateTempPassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export interface MemberFormErrors {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field-level validation for the add/edit member form. */
export function validateMemberForm(
  form: { email: string; password?: string },
  isNew: boolean
): MemberFormErrors {
  const errors: MemberFormErrors = {};
  const email = form.email.trim();
  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  // Blank is fine for a new member: an invite link is emailed instead.
  if (isNew && form.password && form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return errors;
}
