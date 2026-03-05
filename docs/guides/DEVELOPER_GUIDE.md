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

---

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

---

## Running Tests

```bash
npm run test:unit         # 200+ unit tests (mocked backends)
npm run test:integration  # Integration tests (contract logic)
npm run test:coverage     # Coverage report

cd aiken-contracts
aiken check               # 48 on-chain validator tests
```

---

## Key Development Patterns

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

---

## Real-World Development Examples

### Example 1: Adding a new OData action (e.g. `NotarizeDocument`)

**Step 1: Define in `srv/cardano-service.cds`**

```cds
// Add to CardanoODataService
action NotarizeDocument(
  sapDocumentId : String(35) @mandatory,
  sapSystemId   : String(3)  @mandatory,
  documentHash  : String(64) @mandatory,  // SHA-256 hex
  network       : String
) returns {
  success         : Boolean;
  txHash          : String;
  notarizationId  : String;
  network         : String;
  message         : String;
};
```

**Step 2: Implement in `srv/cardano-service.ts`**

```typescript
this.on('NotarizeDocument', async (req: Request) => {
  const { sapDocumentId, sapSystemId, documentHash, network } = req.data as NotarizeDocumentParams;
  const resolvedNetwork = resolveNetwork(network);

  // Validate inputs
  if (!/^[0-9a-f]{64}$/i.test(documentHash)) {
    throw new ValidationError(`documentHash must be a 64-character hex string`);
  }

  // Build the unsigned CBOR via ContractManager
  const result = await contractManager.notarizeDocument({
    sapDocumentId,
    sapSystemId,
    documentHash,
    network: resolvedNetwork,
  });

  return {
    success: true,
    txHash: result.txHash,
    notarizationId: `NOTARY-${sapSystemId}-${sapDocumentId}`,
    network: resolvedNetwork,
    message: 'Document notarization transaction built. Sign and submit to record on Cardano.',
  };
});
```

**Step 3: Add to ContractManager**

```typescript
// In srv/blockchain/contract-manager.ts
async notarizeDocument(params: {
  sapDocumentId: string;
  sapSystemId: string;
  documentHash: string;
  network: CardanoNetwork;
}): Promise<{ txCborHex: string; txHash: string }> {
  // Build datum
  const datum = {
    document_hash: Buffer.from(params.documentHash, 'hex'),
    sap_document_id: Buffer.from(params.sapDocumentId),
    sap_system_id: Buffer.from(params.sapSystemId),
    notarized_at: Date.now(),
    schema_version: 1,
  };

  // Fetch UTxOs at contract address and build unsigned tx
  return this.buildContractTx(datum, 'notarize', params.network);
}
```

**Step 4: Write unit test**

```typescript
// In test/unit/notarize-document.test.ts
describe('NotarizeDocument action', () => {
  it('returns success with valid inputs', async () => {
    const result = await POST('/odata/v4/cardano-odata/NotarizeDocument', {
      sapDocumentId: '4500000001',
      sapSystemId: 'PRD',
      documentHash: 'a'.repeat(64),
      network: 'preview',
    });
    expect(result.data.success).toBe(true);
    expect(result.data.notarizationId).toBe('NOTARY-PRD-4500000001');
  });

  it('rejects invalid document hash', async () => {
    const result = await POST('/odata/v4/cardano-odata/NotarizeDocument', {
      sapDocumentId: '4500000001',
      sapSystemId: 'PRD',
      documentHash: 'not-a-valid-hash',
      network: 'preview',
    });
    expect(result.status).toBe(400);
  });
});
```

---

### Example 2: Adding a new entity set (e.g. `DocumentNotarizations`)

**Step 1: Add to `db/schema.cds`**

```cds
entity DocumentNotarizations : cuid, managed {
  sapDocumentId     : String(35) not null;
  sapSystemId       : String(3)  not null;
  documentHash      : String(64) not null;
  txHash            : String(64);
  network           : String(10);
  notarizationId    : String(100);
  status            : String(20) default 'Pending';
}
```

**Step 2: Expose in `srv/cardano-service.cds`**

```cds
entity DocumentNotarizations as projection on db.DocumentNotarizations;
```

**Step 3: Handle READ in `srv/cardano-service.ts`**

```typescript
this.on('READ', 'DocumentNotarizations', async (req: Request) => {
  return cds.run(req.query);
});
```

Now `GET /odata/v4/cardano-odata/DocumentNotarizations` works automatically, including full OData V4 filtering, sorting, and pagination.

---

### Example 3: Adding a new Blockfrost API method

**Step 1: Add to `srv/blockchain/backends/blockfrost-backend.ts`**

```typescript
// Fetch Cardano native scripts (e.g. for NFT policy verification)
async getNativeScript(scriptHash: string): Promise<NativeScript> {
  const response = await this.fetch(`/scripts/${scriptHash}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new ResourceNotFoundError('NativeScript', scriptHash);
    }
    throw new BlockchainConnectivityError('blockfrost', `HTTP ${response.status}`);
  }
  return response.json();
}
```

**Step 2: Add the same method signature to `koios-backend.ts` (for failover)**

**Step 3: Wire through `cardano-client.ts`**

```typescript
async getNativeScript(scriptHash: string): Promise<NativeScript> {
  return this.withFailover(
    () => this.primary.getNativeScript(scriptHash),
    () => this.fallback?.getNativeScript(scriptHash),
  );
}
```

**Step 4: Expose via OData service**

```typescript
this.on('READ', 'NativeScripts', async (req: Request) => {
  const { scriptHash } = req.params[0] as { scriptHash: string };
  const client = createCardanoClient(resolveNetwork(req.headers['x-cardano-network']));
  return client.getNativeScript(scriptHash);
});
```

---

### Example 4: Writing a new Aiken contract test

Aiken tests live inside the validator files, using the `test` keyword:

```aiken
// In aiken-contracts/validators/supply_chain_tracker.ak

test valid_dispatch_from_created() {
  let datum = SupplyChainDatum {
    sap_document_id: "4500000001",
    sap_system_id: "PRD",
    product_code: "PUMP-7700",
    quantity: 12,
    status: Created,
    checkpoints: [],
    created_at: 1710000000000,
    updated_at: 1710000000000,
    schema_version: 1,
  }

  let redeemer = UpdateStatus {
    new_status: Dispatched,
    location_code: "DEHAM",
    location_name: "Port of Hamburg",
    latitude: 53551100,   // 53.5511 * 1_000_000
    longitude: 9993700,   // 9.9937  * 1_000_000
    handler_pub_key: #"ed25519abc...",
  }

  // The validator should accept this transition
  supply_chain_tracker.spend(datum, redeemer, mock_ctx()) == True
}

test rejects_status_skip_to_received() {
  let datum = SupplyChainDatum {
    ...,
    status: Created,   // Just created
  }

  let redeemer = UpdateStatus {
    new_status: Received,  // Trying to skip directly to Received
    ...
  }

  // Must be rejected — cannot skip Dispatched and InTransit
  supply_chain_tracker.spend(datum, redeemer, mock_ctx()) == False
}
```

Run with:
```bash
cd aiken-contracts
aiken check
# All 48 tests must pass
```

---

### Example 5: Testing the OData filters locally

```bash
# Ensure the server is running
npm run dev

# Test complex filter with expand
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$filter=status%20eq%20'InTransit'&\$expand=checkpoints&\$top=5" \
  | python3 -m json.tool

# Test count
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$count=true&\$filter=isRetired%20eq%20false" \
  | python3 -m json.tool

# Test $select to minimize payload
curl -s "http://localhost:4004/odata/v4/cardano-odata/AssetRegistry?\$select=assetId,state,sapPlant&\$top=10" \
  | python3 -m json.tool
```

---

### Example 6: Debugging a failing action

When an action returns unexpected results, check both the HTTP response and the server logs.

**Terminal 1 (server)**:
```
npm run dev
# Watch for lines like:
# [ERROR] ContractStateError: Cannot transition from Received to Dispatched
# [ERROR] InvalidAddressError: 0xdeadbeef is not a valid Cardano address
```

**Terminal 2 (request)**:
```bash
curl -sv -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{"sapDocumentId":"4500000001","newStatus":"Dispatched",...}'
```

Common error codes and their causes:

| HTTP | Code | Likely cause |
|---|---|---|
| 400 | SAP-CARDANO-001 | Missing required field in request body |
| 400 | SAP-CARDANO-002 | `addr1...` format invalid, or Ethereum address used |
| 400 | SAP-CARDANO-003 | TX hash not 64 hex chars |
| 400 | SAP-CARDANO-040 | Aiken contract rejects the state transition |
| 404 | SAP-CARDANO-010 | Transaction / supply chain event ID not found |
| 409 | SAP-CARDANO-041 | Trying to retire an already-retired credit |
| 503 | SAP-CARDANO-030 | Blockfrost + Koios both unreachable (check API key) |

---

## Adding a New Aiken Validator (Full Workflow)

1. Create `aiken-contracts/validators/my_contract.ak`
2. Import from `sap_cardano/types` and `sap_cardano/utils`
3. Follow the `validator my_contract { spend(...) { ... } }` pattern
4. Add embedded tests at the bottom using `test test_name() { ... }`
5. Run `aiken check` to verify
6. Run `aiken build` to produce updated `plutus.json`
7. Derive the contract address: `cardano-cli address build --payment-script-file plutus.json ...`
8. Add address to `srv/blockchain/contract-manager.ts` under the appropriate network
9. Add corresponding TypeScript action in `ContractManager`
10. Expose via `cardano-service.cds` and `cardano-service.ts`
11. Write unit + integration tests
12. Update `docs/concepts & architecture/AIKEN_CONTRACTS.md`

---

## TypeScript Patterns

### Resolving the network parameter

```typescript
import { resolveNetwork } from '../utils/validators';

// In any action handler:
const resolvedNetwork = resolveNetwork(req.data.network);
// Defaults to DEFAULT_CARDANO_NETWORK from config if not provided
// Throws InvalidNetworkError if an unrecognized value is passed
```

### Typed OData request handling

```typescript
this.on('READ', 'SupplyChainEvents', async (req: Request) => {
  // Let CDS handle the OData query automatically
  return cds.run(req.query);
});

this.on('InitSupplyChain', async (req: Request) => {
  const params = req.data as InitSupplyChainParams;
  // TypeScript enforces all required fields via the interface
  const { sapDocumentId, sapSystemId, productCode, quantity } = params;
  ...
});
```

### Cache layer (TTL-based)

```typescript
// cardano-indexer.ts wraps all blockchain calls with a TTL cache
// Default TTL: 30 seconds for transactions, 10 seconds for blocks
const indexer = new CardanoIndexer(client);
const tx = await indexer.getTransaction(hash, network);
// First call hits Blockfrost; subsequent calls within TTL return cached data
```
