FROM node:20-alpine AS base
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY .env.example ./

# Create non-root user
RUN addgroup -g 1001 -S growos && \
    adduser -S growos -u 1001 -G growos && \
    mkdir -p logs && chown -R growos:growos /app

USER growos

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "backend/server.js"]
