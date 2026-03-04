# SAP–Cardano OData V4 API with CAP & Aiken Smart Contracts

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js CI](https://github.com/ODATANO/ODATANO/actions/workflows/test.yaml/badge.svg)](https://github.com/ODATANO/ODATANO/actions/workflows/test.yaml)
[![Aiken](https://img.shields.io/badge/Aiken-v1.1-purple.svg)](https://aiken-lang.org)
[![OData V4](https://img.shields.io/badge/OData-V4-green.svg)](https://www.odata.org/documentation/)

> Open-source enterprise bridge between SAP and the Cardano blockchain.
> Funded by [Project Catalyst Fund 14](https://projectcatalyst.io/funds/14) — Proposal #1400109.

## Overview

This project delivers an **OData V4 API** built with **SAP Cloud Application Programming Model (CAP)** that enables SAP enterprise systems to securely read Cardano blockchain data and submit on-chain transactions.

A suite of **Aiken smart contracts** provides on-chain logic for:

| Contract | Use Case |
|----------|----------|
| `supply_chain_tracker` | Product provenance — links SAP MM/WM/EWM delivery documents to blockchain milestones |
| `esg_compliance` | Carbon credits & ESG certificates — managed from SAP CO cost centers |
| `payment_settlement` | Multi-party invoice settlements triggered by SAP SD/FI |
| `asset_registry` | Tokenized SAP assets (materials, fixed assets, documents) |
| `sap_oracle` | SAP-verified on-chain data feeds (exchange rates, commodity prices) |

## Architecture

```
SAP System (ABAP / Fiori / BTP)
        │  OData V4 (HTTP/JSON)
        ▼
┌─────────────────────────────────────────┐
│   SAP CAP OData Service (TypeScript)    │
│   /odata/v4/cardano-odata/              │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  Read Layer  │  │  Write/Actions  │  │
│  │  Indexer +   │  │  ContractMgr   │  │
│  │  TTL Cache   │  │  (Build CBOR)  │  │
│  └──────┬───────┘  └────────┬────────┘  │
└─────────┼───────────────────┼───────────┘
          │ Primary            │ Sign externally
          ▼                   ▼
   ┌─────────────┐     ┌──────────────┐
   │ Blockfrost  │     │ Wallet / HSM │
   │ (8s timeout)│     │ (off-chain)  │
   └──────┬──────┘     └──────────────┘
          │ Fallback           │ Submit signed tx
          ▼                   ▼
   ┌──────────────┐    ┌──────────────────┐
   │    Koios     │    │ Cardano Network  │
   │ (10s timeout)│    │ (mainnet/preview)│
   └──────────────┘    └──────┬───────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Aiken Validators  │
                    │  (on-chain logic)  │
                    └────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- [Aiken](https://aiken-lang.org/installation-instructions) (for smart contracts)
- Blockfrost API key (optional — Koios is free fallback)

### 1. Clone & Install

```bash
git clone https://github.com/ODATANO/ODATANO.git
cd ODATANO
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Add your Blockfrost project IDs (optional)
```

### 3. Start the OData Service

```bash
npm run dev
# Service: http://localhost:4004/odata/v4/cardano-odata
# Metadata: http://localhost:4004/odata/v4/cardano-odata/$metadata
```

### 4. Build & Test Aiken Contracts

```bash
cd aiken-contracts
aiken check      # Run unit tests embedded in .ak files
aiken build      # Compile to Plutus Core
```

## OData Endpoints

### Blockchain Read Endpoints (required by M1 acceptance criteria)

```
# Transaction lookup
GET /odata/v4/cardano-odata/Transactions('<txHash>')?network=preview

# Address balance & assets
GET /odata/v4/cardano-odata/Addresses('<address>')?network=preview

# Block info
GET /odata/v4/cardano-odata/Blocks('<blockHash>')?network=preview

# Current epoch
GET /odata/v4/cardano-odata/Epochs(450)?network=preview

# Stake account
GET /odata/v4/cardano-odata/Accounts('<stakeAddress>')?network=preview

# Network status
GET /odata/v4/cardano-odata/NetworkInformation('preview')
```

### Smart Contract Actions

```
# Initialize supply chain event
POST /odata/v4/cardano-odata/InitSupplyChain

# Issue ESG carbon credit
POST /odata/v4/cardano-odata/IssueEsgCredit

# Create payment settlement
POST /odata/v4/cardano-odata/CreateSettlement

# Register tokenized SAP asset
POST /odata/v4/cardano-odata/RegisterAsset

# Post oracle value (exchange rate, commodity price)
POST /odata/v4/cardano-odata/PostOracleValue
```

## OData Query Features

Full OData V4 query support:

```
# Filtering
GET /odata/v4/cardano-odata/SupplyChainEvents?$filter=status eq 'InTransit'

# Field selection
GET /odata/v4/cardano-odata/EsgCredits?$select=creditId,amount,unit,vintageYear

# Pagination
GET /odata/v4/cardano-odata/AssetRegistry?$top=25&$skip=50

# Counting
GET /odata/v4/cardano-odata/PaymentSettlements/$count

# Ordering
GET /odata/v4/cardano-odata/Transactions?$orderby=blockTime desc

# Expanding navigation properties
GET /odata/v4/cardano-odata/SupplyChainEvents?$expand=checkpoints
```

## Aiken Smart Contracts

The `aiken-contracts/` directory contains production-ready Cardano validators:

```
aiken-contracts/
├── aiken.toml
├── validators/
│   ├── supply_chain_tracker.ak   # 12 embedded tests
│   ├── esg_compliance.ak         # 8 embedded tests
│   ├── payment_settlement.ak     # 10 embedded tests
│   ├── asset_registry.ak         # 8 embedded tests
│   └── sap_oracle.ak             # 10 embedded tests
└── lib/
    └── sap_cardano/
        ├── types.ak              # All datum/redeemer types
        ├── utils.ak              # Shared validator helpers
        └── errors.ak             # Standardized error labels
```

### Running Aiken Tests

```bash
cd aiken-contracts
aiken check
# Expected: 48 tests pass across all validators
```

## Key Features

- **Multi-provider failover**: Blockfrost (primary) → Koios (fallback) with 8s/10s timeouts
- **TTL cache**: Lazy on-demand indexing with configurable TTLs per entity type
- **5 error scenarios**: 400, 404, 503, 401/403, 500 all handled with OData-compliant error bodies
- **External signing**: Private keys NEVER stored in SAP/BTP — all signing happens off-chain
- **Full OData V4**: `$filter`, `$select`, `$expand`, `$top`, `$skip`, `$count`, `$orderby`
- **SAP Fiori annotations**: Ready for rapid UI5 dashboard development
- **Multi-network**: mainnet, preview, preprod — selected per request

## Testing

```bash
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:coverage     # With coverage report
```

Coverage target: **≥70%** statements/branches/functions/lines.

## Docker

```bash
docker compose up -d
# OData service: http://localhost:4004
```

## Documentation

| Document | Description |
|----------|-------------|
| [Developer Guide](./docs/guides/DEVELOPER_GUIDE.md) | Architecture, setup, TypeScript internals |
| [User Guide](./docs/guides/USER_GUIDE.md) | Deployment, querying, SAP integration |
| [Docker Guide](./docs/guides/DOCKER_DEPLOYMENT.md) | Container deployment |
| [Aiken Contracts](./docs/concepts%20%26%20architecture/AIKEN_CONTRACTS.md) | Smart contract architecture |
| [Data Model](./docs/concepts%20%26%20architecture/MM_DATAMODEL.md) | OData entity model |
| [Error Handling](./docs/concepts%20%26%20architecture/ERROR_HANDLING.md) | Error codes & handling strategy |
| [Indexing Strategy](./docs/concepts%20%26%20architecture/INDEXING.md) | Lazy cache & TTL |

## Project Catalyst

This project is funded by the Cardano community through [Project Catalyst Fund 14](https://projectcatalyst.io/funds/14/cardano-open-developers/sap-cardano-odata-v4-api-with-cap-and-sap-cardano-sdk).

- **Budget**: ₳85,000
- **Milestones**: 4 total (M1 & M2 completed)
- **License**: Apache 2.0

## License

Apache License 2.0 — see [LICENSE](./LICENSE)
