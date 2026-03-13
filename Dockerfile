# ---- Build stage -----------------------------------------------------------
FROM --platform=linux/arm64 node:20-alpine AS builder

# Native build tools for better-sqlite3 and @node-rs/argon2
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ------------------------------------------------------
FROM --platform=linux/arm64 node:20-alpine AS runner

# Same native tools needed to compile better-sqlite3 at install time
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app and migrations
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle

# Data directory for the SQLite file (mount a volume here)
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "build"]
