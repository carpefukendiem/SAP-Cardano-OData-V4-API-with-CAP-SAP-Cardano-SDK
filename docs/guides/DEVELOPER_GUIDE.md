# Developer Guide

## Project Structure

```
SAP-Cardano-OData-V4-API/
├── aiken-contracts/           # Cardano smart contracts (Aiken)
│   ├── aiken.toml
│   ├── validators/            # 5 spending validators
│   └── lib/sap_cardano/       # Shared types, utils, errors
├── db/schema.cds              # CDS database schema (all entities)
├── srv/
│   ├── cardano-service.cds    # OData service definition
│   ├── cardano-service.ts     # Service implementation
│   ├── blockchain/
│   │   ├── cardano-client.ts  # Multi-provider orchestration
│   │   ├── cardano-indexer.ts # TTL cache layer
│   │   ├── contract-manager.ts # Unsigned tx builder
│   │   └── backends/
│   │       ├── blockfrost-backend.ts
│   │       └── koios-backend.ts
│   └── utils/
│       ├── types.ts           # TypeScript interfaces
│       ├── mappers.ts         # API response normalisation
│       ├── validators.ts      # Input validation
│       ├── errors.ts          # Error class hierarchy
│       └── error-codes.ts     # Error code enum
├── test/
│   ├── unit/                  # Unit tests (mock-based)
│   └── integration/           # Integration tests
├── config/config.ts           # Environment configuration
└── docs/                      # Documentation
```

## Local Development

```bash
npm install
npm run dev       # starts SAP CAP with hot reload on :4004
```

Required env vars (`.env`):
```
BLOCKFROST_PROJECT_ID_PREVIEW=preview...
BLOCKFROST_PROJECT_ID_MAINNET=mainnet...
DEFAULT_CARDANO_NETWORK=preview
```

## Adding a New Aiken Validator

1. Create `aiken-contracts/validators/my_contract.ak`
2. Import from `sap_cardano/types` and `sap_cardano/utils`
3. Follow the `validator my_contract { spend(...) { ... } }` pattern
4. Add embedded tests at the bottom using `test test_name() { ... }`
5. Run `aiken check` to verify
6. Add corresponding TypeScript action in `ContractManager`
7. Expose via `cardano-service.cds` and `cardano-service.ts`

## Running Tests

```bash
npm run test:unit         # 200+ unit tests (mocked backends)
npm run test:integration  # Integration tests (contract logic)
npm run test:coverage     # Coverage report

cd aiken-contracts
aiken check               # 48 on-chain validator tests
```

## TypeScript Patterns

### Error Handling
Always use typed errors from `srv/utils/errors.ts`:
```typescript
import { InvalidAddressError, ResourceNotFoundError } from '../utils/errors';

validateAddress(addr);           // throws InvalidAddressError if invalid
const tx = await indexer.getTransaction(hash, network);  // throws ResourceNotFoundError if not found
```

### Multi-provider calls
All blockchain calls go through `CardanoClient` which handles failover:
```typescript
const client = createCardanoClient('preview');
const tx = await client.getTransaction(hash);  // auto-retries with Koios on failure
```
