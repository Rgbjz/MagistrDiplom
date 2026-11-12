# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-slim AS runtime
# ffmpeg transcodes uploaded lesson videos to HLS (background "video" queue).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
# Local (non-Blob) video sources and HLS outputs; ephemeral on Render.
RUN mkdir -p /app/private
EXPOSE 5000
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
