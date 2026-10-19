# Production Dockerfile for ToolFlow
FROM node:20-alpine AS base

# Install dumb-init for proper PID 1 signal forwarding (graceful shutdown)
RUN apk add --no-cache dumb-init curl

WORKDIR /app

# Install production dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# Ensure storage directories exist and have node permissions
RUN mkdir -p runs && chown -R node:node /app

USER node

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
