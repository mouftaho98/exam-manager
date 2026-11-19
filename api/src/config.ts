export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Comma-separated list of allowed browser origins, or "*".
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
