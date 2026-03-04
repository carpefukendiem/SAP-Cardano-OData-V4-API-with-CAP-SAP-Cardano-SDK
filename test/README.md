# Test Suite

All 263 tests run with `npm test`. No network access required — all blockchain calls are mocked.

---

## Structure

```
test/
├── __mocks__/
│   └── @sap/cds.ts          Mock for SAP CDS (unavailable in test env)
├── unit/                    Fast, isolated unit tests
│   ├── validators.test.ts   Input validation (45 tests)
│   ├── errors.test.ts       Error class hierarchy (29 tests)
│   ├── cardano-client.test.ts  Multi-provider failover (14 tests)
│   ├── contract-manager.test.ts  Smart contract tx builder (25 tests)
│   └── blockfrost-backend.test.ts  Blockfrost HTTP layer (14 tests)
└── integration/             End-to-end flow tests (all mocked)
    ├── error-handling-service.test.ts  5 error scenarios (27 tests)
    ├── smart-contracts.test.ts         Cross-contract flows (26 tests)
    ├── odata_features.test.ts          OData V4 query operators (35 tests)
    ├── core.blockfrost.test.ts         Blockfrost full pipeline (24 tests)
    └── core.koios.test.ts              Koios full pipeline (24 tests)
```

---

## Running tests

```bash
# All tests
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# A single test file
npm test -- --testPathPattern="validators"

# With coverage report
npm run test:coverage

# Verbose output (see every test name)
npm test -- --verbose
```

---

## Test philosophy

### No live network calls

All tests use `jest.fn()` and `global.fetch` mocks. You can run the full suite with no Blockfrost key, no internet access, and no Cardano node.

### Unit tests

Each module is tested in complete isolation. Dependencies are injected as mocks. Unit tests run in < 1 second each.

### Integration tests

Integration tests compose multiple modules together but still mock the final HTTP boundary (fetch). They test:

- Complete request → response flows
- Error propagation through all layers
- OData query semantics ($filter, $select, $orderby, $top/$skip, $count)
- Structural differences between Blockfrost and Koios response formats
- Cross-contract scenarios (e.g. ESG credit issue → retire)

### 5 required error scenarios

Per the acceptance criteria, these error scenarios are explicitly tested:

| HTTP Code | Trigger | Test file |
|---|---|---|
| 400 Bad Request | Invalid tx hash / address format | `error-handling-service.test.ts` |
| 404 Not Found | Tx/block/address doesn't exist on chain | `error-handling-service.test.ts` |
| 401 Unauthorized | Missing JWT in production mode | `error-handling-service.test.ts` |
| 403 Forbidden | Valid JWT, insufficient scope | `error-handling-service.test.ts` |
| 503 Service Unavailable | Both Blockfrost and Koios fail | `error-handling-service.test.ts` |

---

## Mock patterns

### Mocking fetch (Blockfrost / Koios)

```typescript
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ hash: 'abc...', fees: '170000' }),
  })
) as unknown as typeof fetch;
```

### Injecting mock backends into CardanoClient

```typescript
const mockPrimary = { getTransaction: jest.fn().mockResolvedValue(txFixture) };
const client = new CardanoClient('preprod');
(client as Record<string, unknown>)['primary'] = mockPrimary;
```

### CDS mock (`test/__mocks__/@sap/cds.ts`)

SAP CDS is not available in the test environment. The mock provides:
- `cds.error()` — creates OData-compatible error objects
- `cds.emit()` — no-op event emitter
- Entity metadata stubs

---

## Coverage thresholds

Configured in `jest.config.cjs`:

```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 85,
    lines: 85,
    statements: 85,
  }
}
```

Run `npm run test:coverage` to generate an HTML report in `coverage/`.

---

## Adding new tests

1. Unit test → `test/unit/<module>.test.ts`
2. Integration test → `test/integration/<feature>.test.ts`
3. Follow the existing patterns for mock setup / teardown
4. Always clean up `global.fetch` in `afterEach` using `jest.restoreAllMocks()`
5. Target new error paths and boundary conditions

For new Aiken validators, add tests in `test/integration/smart-contracts.test.ts` covering:
- Valid state transitions
- Invalid state transitions (should throw `ContractValidationError`)
- Boundary values for numeric fields
