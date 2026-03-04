# Security Architecture — Key Management & HSM Patterns

This document explains how the SAP–Cardano integration handles private keys, transaction signing, and the security model that keeps sensitive material out of the application layer.

---

## The Core Security Principle

**Private keys NEVER enter this service.**

This is not a limitation — it is a deliberate design choice. The service builds *unsigned* transactions (expressed as CBOR hex). The signature happens externally, using one of several patterns:

```
SAP CAP Service (this codebase)
   │
   │ 1. BuildTransaction → returns unsignedCborHex
   │
   ▼
External Signer (wallet / HSM / MPC)
   │
   │ 2. Sign unsignedCborHex → signedCborHex
   │
   ▼
SAP CAP Service
   │
   │ 3. SubmitTransaction(signedCborHex) → txHash
   │
   ▼
Cardano Network
```

---

## Signing Patterns

### Pattern A — Browser wallet (development / user-facing apps)

The unsigned CBOR is sent to the user's browser, where a Cardano wallet extension (Nami, Eternl, Lace, Flint) signs it:

```typescript
// JavaScript — browser wallet integration
const unsignedTx = await api.post('/BuildTransaction', payload);
const wallet = await window.cardano.nami.enable();
const signedTx = await wallet.signTx(unsignedTx.cborHex, true);
await api.post('/SubmitTransaction', { signedCbor: signedTx });
```

**Use for**: SAP Fiori applications where end-users approve individual transactions.

### Pattern B — HSM (Hardware Security Module)

For automated, unattended signing in enterprise environments:

```
SAP CAP Service
   │  unsigned CBOR
   ▼
AWS CloudHSM / Azure Dedicated HSM / Thales Luna
   │  sign with stored Ed25519 key
   ▼
signedCbor returned to service
   │
   ▼
SubmitTransaction → Cardano network
```

HSM integration using AWS KMS example:

```typescript
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';

async function signWithKMS(unsignedCborHex: string, keyId: string): Promise<string> {
  const kms = new KMSClient({ region: 'eu-west-1' });
  const txBody = Buffer.from(unsignedCborHex, 'hex');

  const response = await kms.send(new SignCommand({
    KeyId: keyId,
    Message: txBody,
    MessageType: 'RAW',
    SigningAlgorithm: 'ECDSA_SHA_256', // or Ed25519 if using custom KMS
  }));

  // Wrap signature in Cardano witness set structure
  return buildSignedTx(unsignedCborHex, response.Signature!);
}
```

**Use for**: Supply chain state updates, oracle postings, automated ESG credit issuance.

### Pattern C — Multi-party computation (MPC)

For highest-security enterprise use cases (treasury releases, board approvals):

```
Transaction requires governance approval (m-of-n)
   │
   ├── Signer 1 (CFO's hardware key)
   ├── Signer 2 (Board member's key)
   └── Signer 3 (Legal counsel's key)

All partial signatures assembled → submit to Cardano
```

This maps directly to the `multi_sig_governance.ak` validator, which enforces quorum on-chain.

---

## API Key Management

### Blockfrost API Keys

Never hardcode. Store as:

| Environment | Storage |
|---|---|
| Local development | `.env` file (git-ignored) |
| SAP BTP Cloud Foundry | CF user-provided service or Credential Store |
| Kubernetes | Kubernetes Secrets / Vault |
| AWS | AWS Secrets Manager |

```bash
# CF — create credential binding
cf create-user-provided-service cardano-blockfrost -p '{
  "mainnet": "mainnetXXXXXXXXXXXXXXXXXXXXXXXX",
  "preprod": "preprodXXXXXXXXXXXXXXXXXXXXXXXX"
}'
cf bind-service cardano-odata-api cardano-blockfrost
```

The service reads these via `config/config.ts`:

```typescript
const BLOCKFROST_KEY = process.env['BLOCKFROST_API_KEY_MAINNET']
  ?? vcapCredentials?.mainnet
  ?? throwMissing('BLOCKFROST_API_KEY_MAINNET');
```

### Koios (no key required)

Koios is a community-run, open API — no authentication required. It serves as the automatic fallback when Blockfrost is unavailable.

---

## Network Isolation

| Network | Purpose | Risk |
|---|---|---|
| `preprod` | Development and testing | Zero — uses test ADA with no value |
| `preview` | Protocol upgrade testing | Zero |
| `mainnet` | Production | Real ADA, real assets |

The `network` parameter is validated at the API boundary (`validateNetwork()` in `validators.ts`). Requests cannot accidentally route to mainnet from a test environment.

---

## OData Security

### Authentication (production)

XSUAA OAuth2 JWT — see [SAP_INTEGRATION_GUIDE.md](../guides/SAP_INTEGRATION_GUIDE.md).

### Authorization scopes

```
cardano.read  → GET requests only
cardano.write → POST actions (contract calls)
cardano.admin → Health, cache eviction
```

### Input validation

All inputs are validated before any blockchain or contract operation:

- Transaction hashes: 64-char hex regex
- Addresses: bech32 with prefix check (addr1 / addr_test1)
- Lovelace amounts: positive integer, max 45 billion (total ADA supply)
- SAP document IDs: 10-digit numeric
- Vintage years: 1990–2100 range
- Oracle values: 1–100,000,000,000,000

Validation errors return HTTP 400 before any external call is made.

---

## Threat Model

| Threat | Mitigation |
|---|---|
| Stolen Blockfrost key | Automatic fallback to Koios; rotate key via Secrets Manager |
| MITM on Blockfrost/Koios | HTTPS enforced; response integrity verified by tx hash |
| Replay attacks | Cardano's UTxO model makes replay impossible (each UTxO spendable once) |
| Double-spend attempt | Cardano consensus handles this; UTxO uniqueness is protocol-enforced |
| Invalid contract state transition | Aiken validators enforce state machines on-chain |
| Unauthorized contract call | Requires correct spending key; service never has private keys |
| API abuse / DoS | Rate limiting via SAP API Management; Koios fallback absorbs Blockfrost limits |
| SQL injection | SAP CAP ORM prevents injection; no raw SQL in application code |
| XSS in responses | JSON-only API; no HTML rendered by service |

---

## Audit Trail

Every contract interaction produces an immutable on-chain record:

1. `InitSupplyChain` → UTxO created with SAP PO number in datum
2. `UpdateSupplyChainStatus` → UTxO consumed and new one created with updated state
3. `RetireEsgCredit` → UTxO permanently burned (no new output)
4. All operations include: transaction hash, block height, timestamp

These records cannot be altered or deleted. Any party can independently verify the history using any Cardano explorer (e.g., [Cardanoscan](https://cardanoscan.io), [pool.pm](https://pool.pm)).
