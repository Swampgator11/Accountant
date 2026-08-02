import { z } from "zod";
import { getCredentials } from "@/lib/storage/store";

const envSchema = z.object({
  QBO_CLIENT_ID: z.string().optional().default(""),
  QBO_CLIENT_SECRET: z.string().optional().default(""),
  QBO_REDIRECT_URI: z.string().optional().default(""),
  QBO_ENVIRONMENT: z
    .enum(["sandbox", "production"])
    .optional()
    .default("production"),
  DEMO_MODE: z.string().optional().default("false"),
  APP_BASE_URL: z.string().optional().default(""),
  /** Shared secret for cron/morning webhook calls (Authorization: Bearer …) */
  CRON_SECRET: z.string().optional().default(""),
  APP_SECRET: z.string().optional().default(""),
});

export type AppConfig = Omit<z.infer<typeof envSchema>, "DEMO_MODE"> & {
  DEMO_MODE: boolean;
  qboConfigured: boolean;
  apiBaseUrl: string;
  authBaseUrl: string;
  tokenUrl: string;
  scopes: string;
};

function envConfig() {
  return envSchema.parse({
    QBO_CLIENT_ID: process.env.QBO_CLIENT_ID,
    QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET,
    QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI,
    QBO_ENVIRONMENT: process.env.QBO_ENVIRONMENT,
    DEMO_MODE: process.env.DEMO_MODE ?? "false",
    APP_BASE_URL: process.env.APP_BASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    APP_SECRET: process.env.APP_SECRET,
  });
}

/** Resolve the public site URL from the incoming request (Vercel-friendly). */
export function baseUrlFromRequest(request: Request): string {
  const env = envConfig();
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, "");

  const headers = new Headers(request.headers);
  const host =
    headers.get("x-forwarded-host") ||
    headers.get("host") ||
    "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function redirectUriForBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/auth/callback`;
}

/**
 * Runtime config. Prefers credentials saved via the login screen,
 * then falls back to environment variables.
 */
export async function getConfig(options?: {
  baseUrl?: string;
}): Promise<AppConfig> {
  const parsed = envConfig();
  const stored = await getCredentials();

  const clientId = stored?.clientId || parsed.QBO_CLIENT_ID;
  const clientSecret = stored?.clientSecret || parsed.QBO_CLIENT_SECRET;
  const environment = stored?.environment || parsed.QBO_ENVIRONMENT;
  const isSandbox = environment === "sandbox";

  const baseUrl =
    options?.baseUrl ||
    parsed.APP_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";

  const redirectUri =
    stored?.redirectUri ||
    parsed.QBO_REDIRECT_URI ||
    redirectUriForBase(baseUrl);

  const qboConfigured = Boolean(clientId && clientSecret);

  // Demo mode only when explicitly enabled AND not configured for live QBO.
  const demoFlag = parsed.DEMO_MODE === "true" || parsed.DEMO_MODE === "1";
  const DEMO_MODE = demoFlag && !qboConfigured;

  return {
    ...parsed,
    QBO_CLIENT_ID: clientId,
    QBO_CLIENT_SECRET: clientSecret,
    QBO_ENVIRONMENT: environment,
    QBO_REDIRECT_URI: redirectUri,
    APP_BASE_URL: baseUrl.replace(/\/$/, ""),
    DEMO_MODE,
    qboConfigured,
    apiBaseUrl: isSandbox
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com",
    authBaseUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: "com.intuit.quickbooks.accounting",
  };
}
