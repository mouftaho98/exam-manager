# Production image for the RollCall web app.
# Two stages: "build" compiles the Vite app to static files, and the final
# stage serves them with nginx, so the image holds no Node or source code.

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Copy the package files first so Docker can cache `npm ci` when only source code changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite bakes this into the bundle at build time, so it must be the API address
# the *browser* will use (e.g. https://api.example.com), not an in-cluster name.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- run ----
# The unprivileged nginx image runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
