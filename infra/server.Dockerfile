ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}-bookworm-slim AS build
RUN npm install -g pnpm@12.6.0
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY apps/server/package.json ./apps/server/package.json
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm build:server
RUN pnpm --filter @tongzhang/server deploy --prod /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 3300
CMD ["node", "dist/server.js"]
