export type StoredCredentials = {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "production";
  /** Optional override; otherwise derived from the request host. */
  redirectUri?: string;
};

export function credentialsConfigured(
  creds: StoredCredentials | null | undefined,
  envClientId?: string,
  envClientSecret?: string,
): boolean {
  if (creds?.clientId && creds?.clientSecret) return true;
  return Boolean(envClientId && envClientSecret);
}
