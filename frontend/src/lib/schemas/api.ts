export interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
  authToken?: string | null;
}
