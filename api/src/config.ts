const isProduction = process.env.NODE_ENV === "production";

function required(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`Missing required environment variable ${name}`);
  return devDefault;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: required("JWT_SECRET", "dev-only-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  // Redis is optional locally; without it live updates only reach clients on this instance.
  redisUrl: process.env.REDIS_URL,
  // Comma-separated list of allowed browser origins, or "*".
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  // Base URL of the web app, used to build invite links.
  webUrl: (process.env.WEB_URL ?? "http://localhost:5173").replace(/\/$/, ""),
};
