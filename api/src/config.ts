/**
 * App settings, read once from environment variables at startup.
 * Every setting has a default so the API runs locally with no setup.
 */
export const config = {
  // Port the HTTP server listens on.
  port: Number(process.env.PORT ?? 3000),
  // Comma-separated list of allowed browser origins, or "*".
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
