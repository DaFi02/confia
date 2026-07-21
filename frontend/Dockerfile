# confIA frontend (Next.js). Cloud Run container contract:
# https://docs.cloud.google.com/run/docs/container-contract
#
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, not
# runtime, so NEXT_PUBLIC_API_URL must be passed as a --build-arg here.
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Cloud Run injects PORT (default 8080) and requires listening on 0.0.0.0.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["node", "server.js"]
