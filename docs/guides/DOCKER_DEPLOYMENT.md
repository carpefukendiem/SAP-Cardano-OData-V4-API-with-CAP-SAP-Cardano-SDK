# Docker Deployment Guide

## Prerequisites
- Docker 24+
- Docker Compose 2+

## Quick Start

```bash
# Copy environment template
cp .env.example .env
# Edit .env with your Blockfrost keys

# Start the service
docker compose up -d

# Check logs
docker compose logs -f sap-cardano-odata

# Verify health
curl http://localhost:4004/odata/v4/cardano-odata/$metadata
```

## Environment Variables

```env
BLOCKFROST_PROJECT_ID_PREVIEW=previewXXXXXXXXXXXXXXXX
BLOCKFROST_PROJECT_ID_MAINNET=mainnetXXXXXXXXXXXXXXXX
DEFAULT_CARDANO_NETWORK=preview
ENABLE_KOIOS_FALLBACK=true
```

## Production Hardening

1. Use Docker secrets for API keys
2. Put behind a reverse proxy (nginx/Traefik) with TLS
3. Configure XSUAA for SAP BTP authentication
4. Set `NODE_ENV=production`
