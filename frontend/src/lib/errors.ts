/** User-facing message for a caught error, falling back to a generic string. */
export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong'
): string {
  return err instanceof Error ? err.message : fallback;
}
