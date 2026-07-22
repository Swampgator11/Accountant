import { z } from "zod";

const envSchema = z.object({
  QBO_CLIENT_ID: z.string().optional().default(""),
  QBO_CLIENT_SECRET: z.string().optional().default(""),
  QBO_REDIRECT_URI: z
    .string()
    .optional()
    .default("http://localhost:3000/api/auth/callback"),
  QBO_ENVIRONMENT: z.enum(["sandbox", "production"]).optional().default("sandbox"),
  DEMO_MODE: z.string().optional().default("true"),
  APP_BASE_URL: z.string().optional().default("http://localhost:3000"),
});

export type AppConfig = Omit<z.infer<typeof envSchema>, "DEMO_MODE"> & {
  DEMO_MODE: boolean;
  qboConfigured: boolean;
  apiBaseUrl: string;
  authBaseUrl: string;
  tokenUrl: string;
  scopes: string;
};

export function getConfig(): AppConfig {
  const parsed = envSchema.parse({
    QBO_CLIENT_ID: process.env.QBO_CLIENT_ID,
    QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET,
    QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI,
    QBO_ENVIRONMENT: process.env.QBO_ENVIRONMENT,
    DEMO_MODE: process.env.DEMO_MODE ?? "true",
    APP_BASE_URL: process.env.APP_BASE_URL,
  });

  const isSandbox = parsed.QBO_ENVIRONMENT === "sandbox";
  const qboConfigured = Boolean(
    parsed.QBO_CLIENT_ID && parsed.QBO_CLIENT_SECRET,
  );

  return {
    ...parsed,
    DEMO_MODE: parsed.DEMO_MODE === "true" || parsed.DEMO_MODE === "1",
    qboConfigured,
    apiBaseUrl: isSandbox
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com",
    authBaseUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: "com.intuit.quickbooks.accounting",
  };
}
