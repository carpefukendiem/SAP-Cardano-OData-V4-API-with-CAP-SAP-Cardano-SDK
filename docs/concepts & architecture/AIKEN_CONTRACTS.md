# Aiken Smart Contract Architecture

## Overview

The SAP-Cardano integration uses five Aiken validators deployed on the Cardano blockchain to provide on-chain logic for enterprise use cases. Each validator enforces strict business rules that cannot be bypassed, creating a trust-minimized layer between SAP and the blockchain.

**Why Aiken?** Aiken is a functional language purpose-built for writing Cardano smart contracts (Plutus validators). It compiles to Plutus Core, which runs on Cardano nodes. Like SAP ABAP for business logic, Aiken is the language of record for on-chain business rules.

---

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
- Checkpoints require valid 5-char IATA/UN LOCODE (e.g. `DEHAM`, `SGSIN`, `NLRTM`)
- Immutable fields (SAP document ID, product code, quantity) cannot change after creation
- Only origin address or checkpoint handler can sign updates
- Finalized (Received/Rejected) UTxOs cannot be modified

**Datum structure** (`SupplyChainDatum`):
```
sap_document_id  : ByteArray    -- SAP PO/delivery doc (max 35 chars, e.g. "4500000001")
sap_system_id    : ByteArray    -- 3-char SAP SID (e.g. "PRD", "QAS", "DEV")
product_code     : ByteArray    -- SAP material/product code
quantity         : Int          -- quantity (positive integer)
status           : SupplyChainStatus
checkpoints      : List<Checkpoint>
created_at       : Timestamp    -- milliseconds since Unix epoch
updated_at       : Timestamp
schema_version   : Int (= 1)
```

**Real-world example — auto-enforced rules**:

| Attempt | What happens |
|---|---|
| Mark `Received` before `Dispatched` | **Rejected by contract** — invalid state transition |
| Change `quantity` from 500 to 450 after creation | **Rejected** — quantity is immutable |
| Post a checkpoint with location `HAMBURG` (8 chars) | **Rejected** — must be exactly 5 chars (DEHAM) |
| Sign an update from an address not in the handler list | **Rejected** — unauthorized signer |
| Add another checkpoint after status is `Received` | **Rejected** — terminal state |

**Use case: Hamburg → Singapore shipment**

When a Purchase Order is created in SAP MM for industrial pumps going from Hamburg to Singapore, the supply chain tracker is initialized with PO number `4500000001`. Five status updates follow — one at each port of call — each cryptographically signed and timestamped. Any discrepancy between the SAP record and the blockchain record immediately flags a data integrity issue.

---

### 2. esg_compliance

**Purpose**: Manages carbon credits and ESG certificates on-chain, integrated with SAP CO cost centers.

**Operations**:
- `Transfer` — change beneficiary (owner), only current beneficiary or issuer can sign
- `Retire` — permanent offset, burns UTxO (requires SAP document ref)
- `Split` — divide credit across two SAP cost centers
- `UpdateMetadata` — reassign SAP cost center/WBS element (only issuer)

**Key constraints**:
- Retired credits cannot be used again (mathematically impossible — UTxO is destroyed)
- Split amounts must sum exactly to original (prevents inflation)
- Vintage year: 1990–2100 (rejects credits with invalid dates)
- Credit amount must always be positive (no zero or negative credits)

**Datum structure** (`EsgCreditDatum`):
```
credit_id            : ByteArray    -- unique identifier
credit_type          : EsgCreditType  -- CarbonCredit | REC | Water | Biodiversity | Social
beneficiary          : PubKeyHash   -- current owner
issuer               : PubKeyHash   -- original issuer (can never change)
amount               : Int          -- quantity (always positive)
unit                 : ByteArray    -- tCO2e | MWh | m3 | ha | USD
vintage_year         : Int          -- 1990–2100
verification_standard: ByteArray   -- VCS | Gold Standard | I-REC | etc.
project_id           : ByteArray    -- registry project ID
sap_cost_center      : ByteArray    -- e.g. "CC-ESG-001"
is_retired           : Bool
schema_version       : Int (= 1)
```

**Real-world example — double spend prevention**:

A company has 1,000 tCO2e of VCS carbon credits. They attempt to retire the same credits twice (once in their SAP system, once manually). The first `RetireEsgCredit` call succeeds and burns the UTxO. The second attempt fails at the blockchain level because **the UTxO no longer exists** — there is nothing to spend. No reconciliation process, no human check — the blockchain simply has no input to consume.

**Use case: Corporate net-zero reporting (CDP / SBTi)**

Each year during the carbon accounting period, a company's SAP CO-PA settlement triggers an automatic batch that retires carbon credits proportional to their Scope 1+2 emissions. Each retirement transaction includes the CDP report reference in its metadata. Auditors receive a single transaction hash per cost center — they can verify the retirement on any Cardano explorer without needing access to SAP.

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
- All party amounts must sum to `total_amount` (prevents fund creation/destruction)
- Execute only when all parties have individually signed `Approve`
- Refund requires dispute or passed deadline
- Cancel only possible before any approval
- Party amounts are distributed to correct addresses on execution (not to a single recipient)

**Datum structure** (`SettlementDatum`):
```
settlement_id  : ByteArray
sap_invoice_id : ByteArray    -- e.g. "5100000001"
sap_system_id  : ByteArray
parties        : List<Party>  -- [{ address, amount, has_approved }]
total_amount   : Int          -- sum of all party amounts (in Lovelace)
status         : SettlementStatus
deadline       : Timestamp    -- Unix ms; if expired before Execute, funds refunded
schema_version : Int (= 1)
```

**Real-world example — international machinery purchase**:

A UK buyer purchases €2.5 million of CNC machines from a German seller. Traditionally this requires a letter of credit (L/C), which costs ~1% of the contract value (~€25,000 in bank fees) and takes 5–7 days. With the payment_settlement contract:

1. Buyer and seller agree on terms — smart contract created (5 minutes)
2. Funds locked in escrow — on-chain, visible to both (immediate)
3. Seller ships goods — signs `Approve` (immediate)
4. Buyer confirms receipt — signs `Approve` (immediate)
5. Contract automatically executes — funds released to seller (~20 seconds on Cardano)

**Total cost**: ~0.2 ADA in transaction fees (~€0.08). **Total time**: days → hours.

---

### 4. asset_registry

**Purpose**: Tokenizes SAP materials, fixed assets, and documents as Cardano UTxOs.

**States**: `Active` | `Locked { reason }` | `Transferred` | `Decommissioned`

**Key constraints**:
- Only owner can transfer or decommission
- Owner or custodian can lock/unlock
- SAP transfer order required for transfers (linking to SAP MM/WM document)
- SAP document reference required for decommission (triggers SAP goods issue)

**Datum structure** (`AssetRegistryDatum`):
```
asset_id           : ByteArray    -- e.g. "ASSET-1000-100000042"
sap_asset_number   : ByteArray    -- SAP fixed asset number
sap_plant          : ByteArray    -- SAP plant code
sap_material_number: ByteArray    -- SAP material/equipment type
owner              : PubKeyHash   -- current owner
custodian          : Option<PubKeyHash>  -- optional custodian (warehouse)
quantity           : Int
state              : AssetState
sap_transfer_order : Option<ByteArray>
schema_version     : Int (= 1)
```

**Real-world example — manufacturing equipment fleet tracking**:

A global manufacturer has 3,000 CNC machines across 40 plants in 12 countries. When a machine moves from Plant 1000 (Hamburg) to Plant 2000 (Munich) for capacity rebalancing, the plant manager creates a SAP Transfer Order (TO). The system automatically:

1. Verifies the TO number on-chain
2. Updates the asset_registry UTxO to new owner address (Plant 2000 wallet)
3. Records the transfer timestamp permanently

An insurance company auditing the fleet can verify every machine's location history without accessing SAP at all — they just need the asset ID and a Cardano explorer.

**Use case: Construction equipment rental tracking**

A construction equipment rental company tokenizes its fleet of excavators, cranes, and forklifts. When equipment is rented to a construction site, it's `Locked` with the rental contract reference. When returned and inspected, it's `Active` again. If written off in an accident, it's `Decommissioned` with the insurance claim number. Every event is permanent and auditable.

---

### 5. sap_oracle (minting + spending)

**Purpose**: Posts trusted SAP data on-chain (exchange rates, commodity prices, SAP condition types).

**Key constraints**:
- Only whitelisted oracle operator can post/update (verified via multi-sig)
- Values must be in range [1, 100,000,000,000,000]
- Validity window: minimum 1 hour, maximum 7 days
- No backdating (new valid_from ≥ old valid_from)
- Consumers must use oracle within its validity window
- Denominator must be positive (prevents division by zero)

**Datum structure** (`OracleDatum`):
```
oracle_id     : ByteArray       -- e.g. "FX-EURUSD-20240315"
data_type     : OracleDataType  -- ExchangeRate | CommodityPrice | SapConditionType
from_currency : Option<ByteArray>   -- for FX rates
to_currency   : Option<ByteArray>
value         : Int             -- integer representation (e.g. 1087542)
denominator   : Int             -- scaling factor (e.g. 1000000)
valid_from    : Timestamp
valid_until   : Timestamp
operator      : PubKeyHash      -- whitelisted oracle operator
schema_version: Int (= 1)
```

**Why integers?** Cardano smart contracts don't support floating point. Instead, values are expressed as `value / denominator`. For example: EUR/USD rate of 1.087542 is stored as `value=1087542, denominator=1000000`.

**Usage pattern** (reference input — read without spending):
```
Transaction with:
  reference_inputs: [oracle_utxo]  -- read without consuming
  redeemer: UseValue { consumer_tx_ref }
```

**Real-world example — cross-currency invoice settlement**:

A German company sells goods to a US customer. The invoice is in EUR but the payment smart contract needs a verifiable EUR/USD rate. The SAP Treasury module posts the daily ECB fixing rate as an oracle UTxO at 4pm CET. Settlement contracts reference this UTxO as a `reference_input` — they read the rate without consuming it, then calculate the USD equivalent and release funds accordingly. The rate used is permanently recorded in the settlement transaction, giving both parties a provable audit trail of the FX conversion.

---

## Security Model

### Key Management

All private keys stay off-chain:

```
SAP BTP / CAP Service              External Wallet / HSM
        │                                    │
        │  1. Build unsigned CBOR            │
        │─────────────────────────────────►  │
        │                                    │  2. Sign with private key
        │  3. Return signed CBOR             │
        │◄─────────────────────────────────  │
        │
        │  4. Submit via SubmitTransaction
        ▼
   Cardano Node (via Blockfrost)
```

This means: even if the SAP BTP environment is fully compromised, the attacker cannot move funds or change contract state — they don't have the signing keys.

### Validator Hardening

- `no_other_scripts` check prevents draining attacks in UTxO-heavy flows
- All datum fields validated on every spend (not just on create)
- Schema version field enables future upgrades without re-deploying dependent contracts
- Error trace labels map directly to OData error codes for clean debugging

### Aiken Test Suite

48 on-chain tests cover every state transition and constraint:

```bash
cd aiken-contracts
aiken check
```

Example test output:
```
Testing supply_chain_tracker ...
  ✓ valid_status_transition_created_to_dispatched  (0.12ms)
  ✓ valid_status_transition_dispatched_to_intransit  (0.09ms)
  ✓ rejects_invalid_status_skip  (0.08ms)
  ✓ rejects_immutable_field_change  (0.11ms)
  ✓ rejects_unauthorized_signer  (0.07ms)
  ✓ allows_legitimate_handler_update  (0.10ms)

Testing esg_compliance ...
  ✓ retires_credit_successfully  (0.09ms)
  ✓ rejects_double_retirement  (0.08ms)
  ✓ rejects_invalid_vintage_year_past  (0.07ms)
  ✓ rejects_invalid_vintage_year_future  (0.08ms)
  ✓ split_amounts_must_sum_to_original  (0.11ms)
  ✓ transfer_requires_beneficiary_signature  (0.09ms)
  ...

48 tests, 0 failures
```

---

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

cat supply_chain_tracker.addr
# addr_test1wq...
```

Preview testnet addresses are configured in `srv/blockchain/contract-manager.ts`.

---

## Data Flow: SAP → Aiken Contract → Blockchain

```
1. SAP triggers action (e.g. PO creation in ME21N)
         │
         ▼
2. CAP service builds datum + redeemer (ContractManager)
         │
         ▼
3. Blockfrost: fetch UTxOs at contract address to find the right input
         │
         ▼
4. Build unsigned transaction CBOR (inputs, outputs, datum, redeemer)
         │
         ▼
5. Return CBOR to SAP/caller — signing happens externally (HSM / wallet)
         │
         ▼
6. Signed CBOR submitted via SubmitTransaction
         │
         ▼
7. Cardano node evaluates the Aiken validator
   - Validator returns True  → transaction confirmed in ~20 seconds
   - Validator returns False → transaction rejected, no state change
         │
         ▼
8. Blockfrost confirms → CAP updates local SQLite/HANA record
         │
         ▼
9. SAP Event Mesh publishes event → downstream SAP consumers notified
```

---

## Extending the Contracts

### Adding a new Aiken validator

1. Create `aiken-contracts/validators/my_contract.ak`
2. Import from `sap_cardano/types` and `sap_cardano/utils`
3. Follow the `validator my_contract { spend(...) { ... } }` pattern
4. Add embedded tests at the bottom using `test test_name() { ... }`
5. Run `aiken check` to verify all tests pass
6. Add corresponding TypeScript action in `ContractManager` (`srv/blockchain/contract-manager.ts`)
7. Expose via `cardano-service.cds` and `cardano-service.ts`

### Example: Adding a new `document_notarization` validator

This would allow SAP documents (invoices, contracts, certificates) to be notarized on-chain:

```
Notarize: hash(document) → UTxO on Cardano
Verify:   fetch UTxO, compare hash → cryptographic proof of existence at timestamp
```

The Aiken contract would store:
```
document_hash    : ByteArray    -- SHA-256 of the document bytes
notarizer        : PubKeyHash   -- who notarized it
sap_document_id  : ByteArray    -- SAP doc reference
timestamp        : Int          -- when it was notarized
```
