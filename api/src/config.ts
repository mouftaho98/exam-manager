/**
 * App settings, read once from environment variables at startup.
 * Every setting has a default so the API runs locally with no setup,
 * except secrets, which must be set in production.
 */
const isProduction = process.env.NODE_ENV === "production";

/**
 * Read a setting that must be set in production (like a secret).
 * In development and tests it falls back to devDefault; in production a
 * missing value crashes the app at startup instead of running insecurely.
 */
function required(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`Missing required environment variable ${name}`);
  return devDefault;
}

export const config = {
  // Port the HTTP server listens on.
  port: Number(process.env.PORT ?? 3000),
  // Secret used to sign login tokens. Anyone with it can forge a login, so keep it secret.
  jwtSecret: required("JWT_SECRET", "dev-only-secret"),
  // How long a login lasts before the user has to sign in again, e.g. "7d" or "12h".
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  // Comma-separated list of allowed browser origins, or "*".
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  // Base URL of the web app, used to build invite links.
  webUrl: (process.env.WEB_URL ?? "http://localhost:5173").replace(/\/$/, ""),
};
