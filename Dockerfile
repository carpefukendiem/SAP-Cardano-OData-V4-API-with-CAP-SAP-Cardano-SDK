FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production=false

# Copy source
COPY tsconfig.json ./
COPY srv/ ./srv/
COPY db/ ./db/
COPY config/ ./config/
COPY .cdsrc.json ./

# Build TypeScript
RUN npm run build || true

# ============================================================
# Production image
# ============================================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4004

# Install production dependencies only
COPY package*.json ./
RUN npm ci --production=true

# Copy compiled output and CDS files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/srv ./srv
COPY --from=builder /app/db ./db
COPY --from=builder /app/config ./config

# Expose OData port
EXPOSE 4004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4004/odata/v4/cardano-odata/\$metadata || exit 1

USER node

CMD ["node", "-e", "require('@sap/cds').serve('CardanoODataService').from('./srv/cardano-service')"]
