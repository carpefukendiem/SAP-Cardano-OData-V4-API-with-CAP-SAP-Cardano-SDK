# SAP–Cardano OData V4 API with CAP & Aiken Smart Contracts

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-263%20passing-brightgreen)](#testing)
[![Aiken](https://img.shields.io/badge/Aiken-v1.1-purple.svg)](https://aiken-lang.org)
[![OData V4](https://img.shields.io/badge/OData-V4-green.svg)](https://www.odata.org/documentation/)
[![SAP CAP](https://img.shields.io/badge/SAP%20CAP-8.x-0070f3.svg)](https://cap.cloud.sap)

> **Open-source enterprise bridge between SAP and the Cardano blockchain.**
> Funded by [Project Catalyst Fund 14](https://projectcatalyst.io/funds/14) — Proposal #1400109.

---

## What is this?

This project lets **SAP enterprise systems** — ERP, supply chain, finance, ESG — interact with the **Cardano blockchain** using a standard **OData V4 API**. No blockchain knowledge is needed to use it; it speaks the same language as every SAP system.

**In plain English**: Imagine you could notarise your purchase orders, shipments, and payments on a tamper-proof public ledger, automatically, from within SAP — with full audit trails that any auditor can independently verify. That's what this does.

---

## Why Cardano?

Cardano is one of the few blockchains with:
- **Formal verification** — smart contracts can be mathematically proven correct
- **Deterministic fees** — no gas spikes, predictable enterprise costs
- **Extended UTxO model** — safer concurrency without race conditions
- **Governance on-chain** — integrated treasury and protocol voting (CIP-1694)
- **Native token standard** — first-class asset support without ERC-20 complexity

---

## Features at a glance

| Feature | Details |
|---|---|
| **7 Aiken smart contracts** | Supply chain, ESG credits, payment settlement, asset registry, oracle, vesting, governance |
| **263 automated tests** | 10 test suites, zero live network calls required |
| **OData V4 full spec** | `$filter`, `$select`, `$expand`, `$top`, `$skip`, `$count`, `$orderby` |
| **Multi-provider failover** | Blockfrost primary → Koios fallback, automatic |
| **13 OData actions** | One per contract operation |
| **External signing** | Private keys never enter the service |
| **TTL cache** | Configurable per entity type (tx: 60s, addr: 15s, block: 20s) |
| **SAP BTP ready** | XSUAA auth, CF manifest, HANA Cloud support |
| **Docker included** | Single `docker compose up` for local development |
| **Full documentation** | For non-technical, technical, and SAP-specialist audiences |

---

## Smart Contracts

All contracts are written in [Aiken](https://aiken-lang.org) — Cardano's purpose-built smart contract language. Each validator has embedded tests runnable with `aiken test`.

### Core contracts

| Contract | File | Embedded Tests | Use Case |
|---|---|---|---|
| Supply Chain Tracker | `supply_chain_tracker.ak` | 12 | Shipment provenance, status state machine |
| ESG Compliance | `esg_compliance.ak` | 8 | Carbon credit issuance, transfer, retirement |
| Payment Settlement | `payment_settlement.ak` | 10 | Multi-party escrow, dispute resolution |
| Asset Registry | `asset_registry.ak` | 8 | Physical asset tokenisation |
| SAP Oracle | `sap_oracle.ak` | 10 | SAP-sourced on-chain data feeds |

### Bonus contracts

| Contract | File | Embedded Tests | Use Case |
|---|---|---|---|
| Vesting Contract | `vesting_contract.ak` | 9 | Time-locked milestone payments, cliff schedules |
| Multi-sig Governance | `multi_sig_governance.ak` | 10 | Board/committee m-of-n approvals |

**Total: 67 embedded Aiken tests**

---

## Architecture

```
SAP System (ABAP / Fiori / BTP / Integration Suite)
         │
         │  OData V4 (HTTP + JSON)
         ▼
┌─────────────────────────────────────────────┐
│          SAP CAP Service (Port 4004)         │
│                                              │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  OData V4 Layer │  │  Contract Manager│  │
│  │  $filter/select │  │  Unsigned CBOR   │  │
│  │  $expand/count  │  │  tx builder      │  │
│  └────────┬────────┘  └────────┬─────────┘  │
│           │                    │             │
│  ┌────────▼────────────────────▼─────────┐  │
│  │         Cardano Client + Indexer       │  │
│  │   TTL Cache │ Multi-provider failover  │  │
│  └────────┬────────────────┬─────────────┘  │
└───────────┼────────────────┼────────────────┘
            │                │
     ┌──────▼──────┐  ┌──────▼──────┐
     │  Blockfrost │  │    Koios    │
     │  (primary)  │  │ (fallback)  │
     └──────┬──────┘  └──────┬──────┘
            └────────┬────────┘
                     ▼
          Cardano Blockchain
          (mainnet / preprod / preview)
```

**Key design decisions:**
- Private keys **never** enter the service — unsigned CBOR is returned for external signing
- Multi-provider fallover: only `BlockchainConnectivityError` and `TimeoutError` trigger failover (not 404s)
- OData entity schema mirrors Blockfrost/Koios response structures with SAP field naming

---

## Quick Start

### Prerequisites
- Node.js 18+
- Free [Blockfrost API key](https://blockfrost.io) (choose "Cardano preprod")

### Run in 3 commands

```bash
git clone https://github.com/carpefukendiem/SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK.git
cd SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK
npm install && cp .env.example .env
# Edit .env — add your Blockfrost key
npm start
```

### Or with Docker

```bash
cp .env.example .env  # add your key
docker compose up
```

Service available at: `http://localhost:4004/odata/v4/cardano-odata`

---

## Testing

```bash
npm test
```

```
Test Suites: 10 passed, 10 total
Tests:       263 passed, 263 total
```

All tests are mocked — no Blockfrost key or internet access needed for tests.

```bash
# Aiken contract tests (requires Aiken CLI)
cd aiken-contracts && aiken test
```

---

## API Overview

### Read entities (GET)

| Endpoint | Description |
|---|---|
| `/Transactions('{hash}')` | Transaction by hash |
| `/Addresses('{addr}')` | Balance + UTxO set |
| `/Blocks('latest')` | Current chain tip |
| `/Blocks('{hash}')` | Block by hash |
| `/Epochs({n})` | Epoch statistics |
| `/Accounts('{stake}')` | Staking account |
| `/SupplyChainEvents` | All supply chain records |
| `/EsgCredits` | Carbon credit registry |
| `/PaymentSettlements` | Payment escrow records |
| `/AssetRegistry` | Registered physical assets |
| `/OracleData` | Oracle value history |
| `/health` | Service health + blockchain status |

### Actions (POST)

| Action | Description |
|---|---|
| `InitSupplyChain` | Create shipment UTxO |
| `UpdateSupplyChainStatus` | Advance state machine |
| `IssueEsgCredit` | Mint carbon credit token |
| `RetireEsgCredit` | Permanently burn credits |
| `TransferEsgCredit` | Transfer to new holder |
| `CreateSettlement` | Create payment escrow |
| `ApproveSettlement` | Approve payment release |
| `ExecuteSettlement` | Release funds to seller |
| `RegisterAsset` | Tokenise physical SAP asset |
| `TransferAsset` | Transfer asset ownership |
| `PostOracleValue` | Publish SAP data to oracle |
| `BuildTransaction` | Build raw unsigned CBOR |
| `SubmitTransaction` | Submit signed transaction |

### OData query examples

```
# Paginated confirmed transactions
GET /Transactions?$filter=status eq 'confirmed'&$top=10&$skip=0&$count=true

# Active ESG credits, sorted by quantity
GET /EsgCredits?$filter=status eq 'active' and standard eq 'VCS'&$orderby=quantity desc

# Shipments in transit, only key fields
GET /SupplyChainEvents?$filter=status eq 'InTransit'&$select=id,sapDocumentId,originLocation,destinationLocation

# Expand checkpoints inline
GET /SupplyChainEvents?$top=5&$expand=checkpoints
```

---

## Documentation

| Document | Audience |
|---|---|
| [QUICK_START.md](docs/QUICK_START.md) | First-time setup, any background |
| [DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | Step-by-step scenarios, no blockchain knowledge needed |
| [DELIVERABLES.md](docs/DELIVERABLES.md) | Maps every file to the Project Catalyst proposal |
| [DEVELOPER_GUIDE.md](docs/guides/DEVELOPER_GUIDE.md) | Architecture, coding standards |
| [USER_GUIDE.md](docs/guides/USER_GUIDE.md) | API usage for business analysts |
| [SAP_INTEGRATION_GUIDE.md](docs/guides/SAP_INTEGRATION_GUIDE.md) | ABAP, BTP, Integration Suite |
| [DOCKER_DEPLOYMENT.md](docs/guides/DOCKER_DEPLOYMENT.md) | Production Docker deployment |
| [AIKEN_CONTRACTS.md](docs/concepts%20%26%20architecture/AIKEN_CONTRACTS.md) | Smart contract deep-dive |
| [SECURITY.md](docs/concepts%20%26%20architecture/SECURITY.md) | Key management, HSM patterns |
| [ERROR_HANDLING.md](docs/concepts%20%26%20architecture/ERROR_HANDLING.md) | Error hierarchy, OData mapping |
| [INDEXING.md](docs/concepts%20%26%20architecture/INDEXING.md) | Caching strategy |
| [test/README.md](test/README.md) | Test suite guide |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

---

## Improvements & Additions (v1.1)

Added beyond the original proposal scope:

| Addition | What it adds |
|---|---|
| **Vesting Contract** (`vesting_contract.ak`) | Time-locked milestone payment releases linked to SAP project milestones with cliff schedules and SAP approver role |
| **Multi-sig Governance** (`multi_sig_governance.ak`) | Corporate board/committee m-of-n approval — TreasuryRelease, ProcurementApproval, ESG batch retirement |
| **OData V4 test suite** | 35 tests for `$filter`, `$select`, `$orderby`, `$top/$skip`, `$count`, combined queries, Cardano-specific patterns |
| **Blockfrost integration tests** | 24 tests covering URL construction, HTTP mapping, error translation, response integrity |
| **Koios integration tests** | 24 tests covering array unwrapping, structural differences vs Blockfrost, network isolation |
| **Postman collection** | 30+ pre-built requests covering all endpoints and error scenarios |
| **TypeScript request examples** | `scripts/request_examples.ts` — runnable demos for each use case |
| **Contract deployment script** | `scripts/deploy_contracts.ts` — compiles Aiken, derives addresses, outputs ready-to-paste config |
| **Health check endpoint** | `/health` — blockchain connectivity, cache stats, service version |
| **`getCacheStats()`** | Exposes live cache state through health endpoint |
| **Security architecture doc** | HSM patterns, threat model, audit trail |
| **SAP Integration Guide** | ABAP snippets, iFlow templates, XSUAA setup |
| **Demo Guide** | 6 step-by-step scenarios with `curl` commands, no blockchain knowledge required |
| **`.env.example`** | Documented environment variable reference |
| **`CONTRIBUTING.md`** | Contribution guide with Aiken and TypeScript conventions |
| **`test/README.md`** | Test strategy, mock patterns, coverage thresholds |

---

## Project Catalyst

This project is funded by [Project Catalyst Fund 14](https://projectcatalyst.io/funds/14), Cardano's community innovation fund.

- **Proposal**: #1400109
- **Title**: SAP–Cardano OData V4 API with CAP & SAP-Cardano SDK
- **Milestones**: tracked in [docs/requirements & milestones/MILESTONES_FINAL.md](docs/requirements%20%26%20milestones/MILESTONES_FINAL.md)
- **Deliverables**: [docs/DELIVERABLES.md](docs/DELIVERABLES.md)

---

## License

[Apache 2.0](./LICENSE) — free to use, modify, and distribute.
