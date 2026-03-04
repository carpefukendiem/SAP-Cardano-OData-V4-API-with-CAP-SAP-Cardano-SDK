# Aiken Smart Contract Architecture

## Overview

The SAP-Cardano integration uses five Aiken validators deployed on the Cardano blockchain to provide on-chain logic for enterprise use cases. Each validator enforces strict business rules that cannot be bypassed, creating a trust-minimized layer between SAP and the blockchain.

## Validators

### 1. supply_chain_tracker

**Purpose**: Records product provenance milestones, linking SAP MM/WM/EWM documents to blockchain state.

**State Machine**:
```
Created → Dispatched → InTransit ↔ UnderInspection → Cleared → Received
                                    ↓
                                  Rejected
```

**Key constraints enforced on-chain**:
- Status transitions strictly follow the state machine (no skipping states)
- Checkpoints require valid 5-char IATA/UN LOCODE
- Immutable fields (SAP document ID, product code, quantity) cannot change
- Only origin address or checkpoint handler can sign updates
- Finalized (Received/Rejected) UTxOs cannot be modified

**Datum structure** (`SupplyChainDatum`):
```
sap_document_id  : ByteArray    -- SAP PO/delivery doc (max 35 chars)
sap_system_id    : ByteArray    -- 3-char SAP SID
product_code     : ByteArray
quantity         : Int
status           : SupplyChainStatus
checkpoints      : List<Checkpoint>
created_at       : Timestamp    -- milliseconds
updated_at       : Timestamp
schema_version   : Int (= 1)
```

---

### 2. esg_compliance

**Purpose**: Manages carbon credits and ESG certificates on-chain, integrated with SAP CO cost centers.

**Operations**:
- `Transfer` — change beneficiary (owner), only current beneficiary or issuer
- `Retire` — permanent offset, burns UTxO (requires SAP document ref)
- `Split` — divide credit across two SAP cost centers
- `UpdateMetadata` — reassign SAP cost center/WBS element (only issuer)

**Key constraints**:
- Retired credits cannot be used again
- Split amounts must sum exactly to original
- Vintage year: 1990–2100
- Credit amount must always be positive

---

### 3. payment_settlement

**Purpose**: Multi-party invoice payment settlement for SAP FI/AP/AR scenarios.

**State Machine**:
```
Pending → Approved → Executed
    ↓          ↓
  Disputed → Refunded
    ↓
  Expired (after deadline)
```

**Key constraints**:
- All party amounts must sum to `total_amount`
- Execute only when all parties have individually signed `Approve`
- Refund requires dispute or passed deadline
- Cancel only possible before any approval
- Party amounts are distributed to correct addresses on execution

---

### 4. asset_registry

**Purpose**: Tokenizes SAP materials, fixed assets, and documents as Cardano UTxOs.

**States**: `Active` | `Locked { reason }` | `Transferred` | `Decommissioned`

**Key constraints**:
- Only owner can transfer or decommission
- Owner or custodian can lock/unlock
- SAP transfer order required for transfers
- SAP document reference required for decommission (triggers SAP goods issue)

---

### 5. sap_oracle (minting + spending)

**Purpose**: Posts trusted SAP data on-chain (exchange rates, commodity prices, condition types).

**Key constraints**:
- Only whitelisted oracle operator can post/update
- Values must be in range [1, 100_000_000_000_000]
- Validity window: minimum 1 hour, maximum 7 days
- No backdating (new valid_from ≥ old valid_from)
- Consumers must use oracle within its validity window

**Usage pattern** (reference input):
```
Transaction with:
  reference_inputs: [oracle_utxo]  -- read without spending
  redeemer: UseValue { consumer_tx_ref }
```

## Security Model

### Key Management
All private keys stay off-chain:
1. SAP/BTP builds unsigned CBOR transaction (via ContractManager)
2. External wallet/HSM signs the transaction
3. Signed CBOR submitted via `SubmitTransaction` action

### Validator Hardening
- `no_other_scripts` check prevents draining attacks in UTxO-heavy flows
- All datum fields validated on every spend (not just on create)
- Schema version field enables future upgrades
- Error trace labels map directly to OData error codes

## Deployment

```bash
cd aiken-contracts

# Run all embedded tests (48 tests)
aiken check

# Build to Plutus Core (plutus.json)
aiken build

# Generate API docs
aiken docs --output ../docs/aiken-api
```

The compiled `plutus.json` contains the validator hashes needed to derive contract addresses for each network.

## Contract Addresses

After `aiken build`, derive addresses using:
```bash
cardano-cli address build \
  --payment-script-file plutus.json \
  --testnet-magic 2 \
  --out-file supply_chain_tracker.addr
```

Preview testnet addresses are configured in `srv/blockchain/contract-manager.ts`.
