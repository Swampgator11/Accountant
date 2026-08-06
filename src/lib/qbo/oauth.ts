import { randomBytes } from "crypto";
import { getConfig } from "@/lib/config";
import {
  clearOAuthState,
  clearTokens,
  getOAuthState,
  getTokens,
  saveOAuthState,
  saveTokens,
} from "@/lib/storage/store";
import type { TokenSet } from "@/lib/qbo/types";
import { unsealJson } from "@/lib/storage/crypto";

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

export async function createAuthorizationUrl(baseUrl?: string): Promise<{
  url: string;
  state: string;
}> {
  const config = await getConfig({ baseUrl });
  if (!config.qboConfigured) {
    throw new Error(
      "QuickBooks credentials are not configured. Enter your Client ID and Secret on the login screen.",
    );
  }

  const state = randomBytes(16).toString("hex");
  await saveOAuthState(state);

  const params = new URLSearchParams({
    client_id: config.QBO_CLIENT_ID,
    redirect_uri: config.QBO_REDIRECT_URI,
    response_type: "code",
    scope: config.scopes,
    state,
  });

  return {
    url: `${config.authBaseUrl}?${params.toString()}`,
    state,
  };
}

async function exchangeToken(
  body: URLSearchParams,
  baseUrl?: string,
): Promise<TokenSet & { refresh_token?: string }> {
  const config = await getConfig({ baseUrl });
  const basic = Buffer.from(
    `${config.QBO_CLIENT_ID}:${config.QBO_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    x_refresh_token_expires_in?: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000 - 60_000,
    realmId: "",
    tokenType: json.token_type,
  };
}

async function readStateFromRequestCookies(
  requestCookies?: CookieReader,
): Promise<string | null> {
  if (!requestCookies) return null;

  const single = requestCookies.get("aa_oauth")?.value;
  if (single) {
    const data = await unsealJson<{ state?: string }>(single);
    if (data?.state) return data.state;
  }

  const count = Number(requestCookies.get("aa_oauth_n")?.value ?? 0);
  if (!count) return null;
  let combined = "";
  for (let i = 0; i < count; i++) {
    const part = requestCookies.get(`aa_oauth_${i}`)?.value;
    if (!part) return null;
    combined += part;
  }
  const data = await unsealJson<{ state?: string }>(combined);
  return data?.state ?? null;
}

export async function handleOAuthCallback(params: {
  code: string;
  state: string;
  realmId: string;
  baseUrl?: string;
  requestCookies?: CookieReader;
}): Promise<TokenSet> {
  const savedState =
    (await readStateFromRequestCookies(params.requestCookies)) ||
    (await getOAuthState());

  if (!savedState || savedState !== params.state) {
    throw new Error("Invalid OAuth state. Please try connecting again.");
  }

  const config = await getConfig({ baseUrl: params.baseUrl });
  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: config.QBO_REDIRECT_URI,
    }),
    params.baseUrl,
  );

  return {
    ...tokens,
    realmId: params.realmId,
  };
}

export async function refreshAccessToken(existing: TokenSet): Promise<TokenSet> {
  const refreshed = await exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
    }),
  );

  const saved: TokenSet = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || existing.refreshToken,
    expiresAt: refreshed.expiresAt,
    realmId: existing.realmId,
    tokenType: refreshed.tokenType,
  };
  await saveTokens(saved);
  return saved;
}

export async function getValidTokens(): Promise<TokenSet | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens;
  try {
    return await refreshAccessToken(tokens);
  } catch {
    await clearTokens();
    return null;
  }
}

export async function disconnectQuickBooks(): Promise<void> {
  await clearTokens();
  await clearOAuthState();
}
