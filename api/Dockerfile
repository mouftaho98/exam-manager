# Production image for the RollCall API.
# Two stages: "build" compiles the TypeScript, and the final stage keeps only
# what's needed to run, so the image stays small.

# ---- build ----
FROM node:22-bookworm-slim AS build
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy the package files first so Docker can cache `npm ci` when only source code changes.
COPY package.json package-lock.json ./
# The schema is needed here because `npm ci` runs `prisma generate` (postinstall).
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# Compile to dist/, then remove dev-only packages (TypeScript, Vitest, ...).
RUN npm run build && npm prune --omit=dev

# ---- run ----
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Migrations live in prisma/, and they run at startup.
COPY prisma ./prisma
# Don't run as root.
USER node
EXPOSE 3000
# Apply pending migrations, then start. Prisma takes a database lock while
# migrating, so several pods starting at once is safe.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
