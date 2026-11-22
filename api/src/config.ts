/**
 * App settings, read once from environment variables at startup.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  redisUrl: process.env.REDIS_URL || "",
};
