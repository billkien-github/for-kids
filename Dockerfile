# ---- build: cài toàn bộ dependency, build web + api ----
FROM node:22-slim AS build
RUN npm i -g pnpm@12.15.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime: chỉ dependency production của api ----
FROM node:22-slim AS runtime
RUN npm i -g pnpm@12.15.0
ENV NODE_ENV=production
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @for-kids/api...
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
WORKDIR /app/apps/api
ENV WEB_DIST_DIR=/app/apps/web/dist \
    UPLOADS_DIR=/data/uploads
EXPOSE 3000
# Migration tự chạy khi khởi động (src/server.ts).
CMD ["node", "dist/server.js"]
