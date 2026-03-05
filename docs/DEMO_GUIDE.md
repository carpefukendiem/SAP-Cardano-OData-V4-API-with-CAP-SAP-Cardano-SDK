# Step-by-Step Demo Guide

**You do not need blockchain knowledge to follow this guide.**

This demo walks you through real-world scenarios that the SAP–Cardano integration solves. Each scenario takes about 2–5 minutes and shows you the API in action with copy-paste commands.

---

## Before you start

Make sure the service is running:

```bash
npm run dev
```

You should see:
```
[cds] - server listening on { url: 'http://localhost:4004' }
```

Open a second terminal for the demo commands below.

> **Tip**: Add `| python3 -m json.tool` after any `curl` command to pretty-print the JSON output. On Windows, omit that part or use `| jq .`

---

## Scenario 1 — Track a Shipment on the Blockchain

**The story**: Your company ships industrial equipment from Hamburg, Germany to Singapore. You want an *unforgeable* record of every step of the journey that any party (buyer, customs, auditor) can independently verify.

### Step 1.1 — Create the shipment record

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "sapSystemId": "PRD",
    "productCode": "IND-PUMP-7700",
    "quantity": 12,
    "unitOfMeasure": "EA",
    "originAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "destAddress": "addr_test1qzjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj",
    "network": "preview"
  }' | python3 -m json.tool
```

**What you'll see**:
```json
{
  "success": true,
  "contractAddress": "addr_test1wq...",
  "unsignedTxCbor": "84a500818258205d677265...",
  "message": "Supply chain initialized. Sign and submit the transaction to record on Cardano.",
  "network": "preview"
}
```

> **What just happened?** The service built a Cardano transaction encoding your shipment. The `unsignedTxCbor` is a hex-encoded transaction ready for signing with your Cardano wallet.

### Step 1.2 — Read back the shipment record

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents(sapDocumentId='4500000001')" \
  | python3 -m json.tool
```

### Step 1.3 — Update status as it clears Hamburg port

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "newStatus": "Dispatched",
    "locationCode": "DEHAM",
    "locationName": "Port of Hamburg, Germany",
    "latitude": 53.5511,
    "longitude": 9.9937,
    "handlerPubKey": "ed25519_pk1abc...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 1.4 — Mark as in transit via Rotterdam

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "newStatus": "InTransit",
    "locationCode": "NLRTM",
    "locationName": "Port of Rotterdam, Netherlands",
    "latitude": 51.9225,
    "longitude": 4.4792,
    "handlerPubKey": "ed25519_pk1def...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 1.5 — Arrives at Singapore — under customs inspection

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "newStatus": "UnderInspection",
    "locationCode": "SGSIN",
    "locationName": "Port of Singapore",
    "latitude": 1.2644,
    "longitude": 103.8228,
    "handlerPubKey": "ed25519_pk1ghi...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 1.6 — Customs cleared and delivered

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "newStatus": "Received",
    "locationCode": "SGSIN",
    "locationName": "Buyer Warehouse, Singapore",
    "latitude": 1.3521,
    "longitude": 103.8198,
    "handlerPubKey": "ed25519_pk1jkl...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 1.7 — See the complete journey with all checkpoints

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents(sapDocumentId='4500000001')?\$expand=checkpoints(\$orderby=timestamp%20asc)" \
  | python3 -m json.tool
```

**What the smart contract enforces automatically (by code)**:
- Status can only move *forward*: `Created → Dispatched → InTransit → UnderInspection → Cleared → Received`
- You cannot mark something `Received` if it was never `Dispatched`
- Location codes must be valid 5-character UN/LOCODE format
- The handler must be an authorised party — nobody else can update

**Why this matters**: No one — not the shipping company, not the buyer, not even your IT department — can falsify the history. Every status change is cryptographically locked into the blockchain.

---

## Scenario 2 — Pharmaceutical Cold Chain Compliance

**The story**: A pharma company ships temperature-sensitive vaccines from Frankfurt to Mumbai. FDA and EMA regulations require an *unbroken* cold chain record with GPS coordinates and timestamps at every handoff.

### Step 2.1 — Initialise the cold chain shipment

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "PH-2024-00991",
    "sapSystemId": "PHR",
    "productCode": "VAC-MRNA-001",
    "quantity": 50000,
    "unitOfMeasure": "DOS",
    "originAddress": "addr_test1qpharma_frankfurt_warehouse_address...",
    "destAddress": "addr_test1qmumbai_distribution_center_address...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 2.2 — Record each handoff with GPS + temp data in metadata

```bash
# Frankfurt Airport handoff
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "PH-2024-00991",
    "newStatus": "InTransit",
    "locationCode": "DEFRA",
    "locationName": "Frankfurt Airport Cold Storage — Gate C12",
    "latitude": 50.0333,
    "longitude": 8.5706,
    "handlerPubKey": "ed25519_pk1lufthansa_cargo...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 2.3 — Query all pharma shipments currently in transit

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$filter=status%20eq%20'InTransit'%20and%20sapSystemId%20eq%20'PHR'&\$orderby=createdAt%20desc" \
  | python3 -m json.tool
```

### Step 2.4 — Get the full immutable audit trail for regulators

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents(sapDocumentId='PH-2024-00991')?\$expand=checkpoints" \
  | python3 -m json.tool
```

> **Regulatory value**: Any FDA or EMA inspector can independently verify this record on any Cardano blockchain explorer using just the transaction hashes. There is no central database to tamper with or subpoena.

---

## Scenario 3 — Issue and Retire Carbon Credits

**The story**: Your company runs a reforestation project in the Brazilian Amazon. You need to issue verifiable carbon credits under the VCS standard and later retire them when a corporate client uses them for their net-zero reporting.

### Step 3.1 — Issue 1,000 carbon credits

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditType": "CarbonCredit",
    "beneficiaryAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "amount": 1000,
    "unit": "tCO2e",
    "vintageYear": 2023,
    "verificationStandard": "VCS",
    "verificationBody": "Verra",
    "projectId": "VCS-BRA-12345",
    "projectName": "Amazon Reforestation Initiative",
    "countryCode": "BR",
    "sapCostCenter": "CC-ESG-001",
    "network": "preview"
  }' | python3 -m json.tool
```

> **VCS** = Verified Carbon Standard (the most widely used voluntary carbon standard, managed by Verra).
> **vintageYear** = the year the carbon was actually removed from the atmosphere.
> The smart contract validates: 1990 ≤ vintageYear ≤ 2100. Anything outside this range is rejected.

### Step 3.2 — Issue renewable energy certificates (RECs)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditType": "RenewableEnergyCertificate",
    "beneficiaryAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "amount": 5000,
    "unit": "MWh",
    "vintageYear": 2024,
    "verificationStandard": "I-REC",
    "verificationBody": "I-REC Standard",
    "projectId": "IREC-DE-00823",
    "projectName": "North Sea Offshore Wind Farm",
    "countryCode": "DE",
    "sapCostCenter": "CC-ESG-002",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 3.3 — See all active VCS credits not yet retired

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$filter=creditType%20eq%20'CarbonCredit'%20and%20isRetired%20eq%20false&\$orderby=amount%20desc" \
  | python3 -m json.tool
```

### Step 3.4 — Transfer a credit to a new beneficiary

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/TransferEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditId": "ESG-2024-VCS-001",
    "newBeneficiary": "addr_test1qclient_company_wallet_address...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 3.5 — Retire credits (permanent — cannot be undone)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RetireEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditId": "ESG-2024-VCS-001",
    "reason": "Retired on behalf of ACME Corp — 2023 Annual Net Zero Commitment, CDP Report Reference CDP-ACME-2024",
    "sapDocument": "4900000042",
    "network": "preview"
  }' | python3 -m json.tool
```

**What happens when you retire**: The UTxO (the digital "coin" holding the credit) is *burned* — permanently destroyed. No new output is created. Double-claiming is mathematically impossible. Any auditor or regulator can verify the retirement on any Cardano explorer using only the txHash.

### Step 3.6 — Confirm the credit is now retired

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits(creditId='ESG-2024-VCS-001')" \
  | python3 -m json.tool
```

You'll see `"isRetired": true` and `"retiredAt"` timestamp. The credit can never be used again.

### Step 3.7 — Try to issue with an invalid vintage year (see validation in action)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditType": "CarbonCredit",
    "beneficiaryAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "amount": 1000,
    "unit": "tCO2e",
    "vintageYear": 1850,
    "verificationStandard": "VCS",
    "projectId": "VCS-FAKE",
    "sapCostCenter": "CC-ESG-001",
    "network": "preview"
  }' | python3 -m json.tool
```

You'll get an error — vintage year 1850 is rejected because carbon accounting didn't exist before 1990.

### Step 3.8 — Use the convenience view for all active credits

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/ActiveEsgCredits?\$filter=sapCostCenter%20eq%20'CC-ESG-001'" \
  | python3 -m json.tool
```

---

## Scenario 4 — Escrow Payment Settlement

**The story**: You're buying €500,000 worth of industrial equipment. The seller won't ship until paid. You don't want to pay until the goods arrive. A smart contract holds the funds in escrow and releases them only when both parties approve — no bank, no legal firm, no intermediary fees.

### Step 4.1 — Create the escrow (buyer deposits funds)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/CreateSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "sapInvoiceId": "5100000001",
    "sapSystemId": "PRD",
    "parties": "[{\"address\":\"addr_test1qbuyer...\",\"amount\":500000000,\"sapPartnerNumber\":\"1000012345\"},{\"address\":\"addr_test1qseller...\",\"amount\":0,\"sapPartnerNumber\":\"1000067890\"}]",
    "deadline": "2025-06-30T23:59:59Z",
    "network": "preview"
  }' | python3 -m json.tool
```

> **500,000,000 Lovelace = 500 ADA** (in this test). Production systems would use a USD/EUR stablecoin on Cardano.

### Step 4.2 — Seller approves (goods dispatched)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/ApproveSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SET-PRD-5100000001",
    "signerPubKey": "ed25519_pk1seller_public_key...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 4.3 — Buyer approves (goods received in good condition)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/ApproveSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SET-PRD-5100000001",
    "signerPubKey": "ed25519_pk1buyer_public_key...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 4.4 — Execute the payment (funds released to seller automatically)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/ExecuteSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SET-PRD-5100000001",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 4.5 — Check settlement status

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/PaymentSettlements(settlementId='SET-PRD-5100000001')?\$expand=parties" \
  | python3 -m json.tool
```

### Step 4.6 — View all pending settlements for your SAP system

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/PaymentSettlements?\$filter=status%20eq%20'Pending'%20and%20sapSystemId%20eq%20'PRD'&\$orderby=deadline%20asc" \
  | python3 -m json.tool
```

**Why this beats traditional escrow**:
| Traditional | This |
|---|---|
| Requires a bank or legal firm | Smart contract is the escrow agent |
| 1–3% fees | Near-zero transaction fees (~0.2 ADA) |
| 3–10 business days to settle | Settles in ~20 seconds on Cardano |
| Single point of failure | Runs on thousands of nodes globally |
| Can be frozen/seized | Governed only by code logic |

---

## Scenario 5 — Register and Transfer Physical Assets on Blockchain

**The story**: A manufacturing company wants to track ownership of high-value production equipment (CNC machines, turbines) across multiple plants. When a machine moves between plants or is sold, the ownership record on blockchain is updated — creating a permanent, auditable chain of custody.

### Step 5.1 — Register a new machine asset

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RegisterAsset \
  -H "Content-Type: application/json" \
  -d '{
    "sapAssetNumber": "100000042",
    "sapPlant": "1000",
    "sapMaterialNumber": "CNC-MILL-5AXIS-V2",
    "ownerAddress": "addr_test1qplant_hamburg_wallet...",
    "quantity": 1,
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 5.2 — Register a second asset (vehicle fleet)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RegisterAsset \
  -H "Content-Type: application/json" \
  -d '{
    "sapAssetNumber": "200001337",
    "sapPlant": "2000",
    "sapMaterialNumber": "FORKLIFT-ELEC-3T",
    "ownerAddress": "addr_test1qwarehouse_berlin_wallet...",
    "quantity": 5,
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 5.3 — Transfer the CNC machine to another plant

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/TransferAsset \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "ASSET-1000-100000042",
    "newOwner": "addr_test1qplant_munich_wallet...",
    "sapTransferOrder": "0000012345",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 5.4 — Query all active assets at a specific plant

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/AssetRegistry?\$filter=sapPlant%20eq%20'1000'%20and%20state%20eq%20'Active'&\$select=assetId,sapAssetNumber,sapMaterialNumber,ownerAddress,quantity" \
  | python3 -m json.tool
```

### Step 5.5 — View all transferred assets (audit trail)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/AssetRegistry?\$filter=state%20eq%20'Transferred'&\$orderby=updatedAt%20desc&\$top=20" \
  | python3 -m json.tool
```

### Step 5.6 — Lock an asset (e.g. under maintenance or legal hold)

```bash
# Lock is represented by updating state through your service implementation
curl -s "http://localhost:4004/odata/v4/cardano-odata/AssetRegistry?\$filter=state%20eq%20'Locked'" \
  | python3 -m json.tool
```

---

## Scenario 6 — Oracle: Publish Live Exchange Rates to Blockchain

**The story**: A global trading company needs to record daily EUR/USD and ADA/EUR exchange rates on the blockchain so that smart contracts can reference provable price data when settling cross-currency invoices — without relying on a single API provider.

### Step 6.1 — Post the EUR/USD rate (from SAP Treasury)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/PostOracleValue \
  -H "Content-Type: application/json" \
  -d '{
    "oracleId": "FX-EURUSD-2024-03-15",
    "sapSystemId": "TRY",
    "dataType": "ExchangeRate",
    "fromCurrency": "EUR",
    "toCurrency": "USD",
    "value": 1087542,
    "denominator": 1000000,
    "validFrom": "2024-03-15T00:00:00Z",
    "validUntil": "2024-03-15T23:59:59Z",
    "network": "preview"
  }' | python3 -m json.tool
```

> **value / denominator = actual rate**: 1,087,542 / 1,000,000 = **1.087542 EUR/USD**. Integers are used on-chain because Cardano smart contracts don't support floating point.

### Step 6.2 — Post a commodity price (e.g. Brent crude oil)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/PostOracleValue \
  -H "Content-Type: application/json" \
  -d '{
    "oracleId": "CMDY-BRENT-2024-03-15",
    "sapSystemId": "TRY",
    "dataType": "CommodityPrice",
    "commodityCode": "273111",
    "toCurrency": "USD",
    "value": 81420000,
    "denominator": 1000000,
    "validFrom": "2024-03-15T00:00:00Z",
    "validUntil": "2024-03-16T00:00:00Z",
    "network": "preview"
  }' | python3 -m json.tool
```

> **81,420,000 / 1,000,000 = $81.42 per barrel of Brent crude**

### Step 6.3 — Post a SAP pricing condition type

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/PostOracleValue \
  -H "Content-Type: application/json" \
  -d '{
    "oracleId": "SAP-PR00-REGION-ASIA-2024-03",
    "sapSystemId": "PRD",
    "dataType": "SapConditionType",
    "conditionType": "PR00",
    "value": 2450000,
    "denominator": 100,
    "validFrom": "2024-03-01T00:00:00Z",
    "validUntil": "2024-03-31T23:59:59Z",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 6.4 — Query all non-expired exchange rates

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/OracleData?\$filter=dataType%20eq%20'ExchangeRate'%20and%20isExpired%20eq%20false&\$orderby=postedAt%20desc" \
  | python3 -m json.tool
```

### Step 6.5 — Get a specific oracle record

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/OracleData(oracleId='FX-EURUSD-2024-03-15')" \
  | python3 -m json.tool
```

---

## Scenario 7 — Build and Submit a Raw Cardano Transaction

**The story**: You want to send ADA programmatically from one address to another, the same way a payment system would.

### Step 7.1 — Build the transaction

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/BuildTransaction \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "toAddress": "addr_test1qzjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj",
    "lovelace": 2000000,
    "metadata": "{\"msg\":\"SAP Invoice 5100000001 payment\",\"sap\":{\"po\":\"4500000001\",\"co\":\"CC-1000\"}}",
    "network": "preview"
  }' | python3 -m json.tool
```

**Response**:
```json
{
  "txCborHex": "84a500...",
  "txHash": "a1b2c3...",
  "estimatedFee": 174321,
  "network": "preview"
}
```

> **2,000,000 Lovelace = 2 ADA**. The fee (~0.17 ADA) is calculated automatically by the protocol. The `metadata` field lets you attach SAP document references to the blockchain transaction — a powerful audit link.

### Step 7.2 — Check a transaction's status by hash

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/GetTransactionStatus(txHash='5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996',network='preview')" \
  | python3 -m json.tool
```

**Response**:
```json
{
  "txHash": "5d677265...",
  "status": "confirmed",
  "confirmations": 42,
  "blockHash": "a1b2c3...",
  "blockHeight": 1234567,
  "network": "preview"
}
```

### Step 7.3 — Submit a signed transaction

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/SubmitTransaction \
  -H "Content-Type: application/json" \
  -d '{
    "signedTxCbor": "84a500818258205d677265...SIGNED_CBOR_HERE",
    "network": "preview"
  }' | python3 -m json.tool
```

---

## Scenario 8 — Advanced OData Queries (Power User)

**The story**: Your SAP Analytics Cloud dashboard needs to pull Cardano data with the same OData filters it uses on all other SAP services.

### 8.1 — Filter supply chain by status + network

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$filter=status%20eq%20'InTransit'%20and%20network%20eq%20'preview'" \
  | python3 -m json.tool
```

### 8.2 — Sort, paginate, and count (standard SAP pagination pattern)

```bash
# Page 1: most recent 10 events
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$orderby=createdAt%20desc&\$top=10&\$skip=0&\$count=true" \
  | python3 -m json.tool

# Page 2
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$orderby=createdAt%20desc&\$top=10&\$skip=10&\$count=true" \
  | python3 -m json.tool
```

### 8.3 — Select only specific fields (reduce response payload)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$select=creditId,creditType,amount,unit,vintageYear,isRetired&\$top=10" \
  | python3 -m json.tool
```

### 8.4 — Combine multiple filters

```bash
# All large VCS carbon credits, not yet retired, from Germany
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$filter=creditType%20eq%20'CarbonCredit'%20and%20amount%20gt%20500%20and%20countryCode%20eq%20'DE'%20and%20isRetired%20eq%20false&\$orderby=amount%20desc" \
  | python3 -m json.tool
```

### 8.5 — Expand related data in a single request

```bash
# Get all supply chain events and their full checkpoint history in one call
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$expand=checkpoints&\$filter=status%20eq%20'Received'" \
  | python3 -m json.tool
```

### 8.6 — Nested expand with select

```bash
# Events with only specific checkpoint fields
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$expand=checkpoints(\$select=locationCode,locationName,timestamp,txHash)&\$top=5" \
  | python3 -m json.tool
```

### 8.7 — Filter settlements by deadline (overdue payments)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/PaymentSettlements?\$filter=status%20eq%20'Pending'%20and%20deadline%20lt%202024-12-31T00:00:00Z&\$orderby=deadline%20asc" \
  | python3 -m json.tool
```

### 8.8 — Multi-party settlement with parties detail

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/PaymentSettlements?\$expand=parties&\$filter=status%20eq%20'Approved'" \
  | python3 -m json.tool
```

> **This is standard OData V4** — the same query language used by SAP S/4HANA, Microsoft Dynamics, and Power BI. No Cardano knowledge needed to query the data.

---

## Scenario 9 — Live Cardano Blockchain Data

**The story**: You want to see what's actually happening on the Cardano blockchain right now — blocks being produced, transactions flowing, network health.

### Step 9.1 — Check service health

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/HealthCheck('health')" \
  | python3 -m json.tool
```

You'll see:
```json
{
  "id": "health",
  "status": "ok",
  "version": "2.0.0",
  "blockchain": "connected",
  "cache": "active"
}
```

### Step 9.2 — Get the current chain tip (latest block)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Blocks?\$orderby=blockHeight%20desc&\$top=1" \
  | python3 -m json.tool
```

You'll see:
- **blockHeight**: how many blocks since genesis (~10+ million on mainnet)
- **slot**: Cardano's internal clock (1 slot = 1 second, every slot *can* have a block)
- **txCount**: how many transactions in this block
- **epoch**: the current 5-day period (Cardano groups blocks into epochs)
- **fees**: total fees collected in this block (in lovelace)

### Step 9.3 — Look up a specific block

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Blocks(blockHash='5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996')" \
  | python3 -m json.tool
```

### Step 9.4 — Get current epoch statistics

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Epochs?\$orderby=epochNo%20desc&\$top=3" \
  | python3 -m json.tool
```

### Step 9.5 — Look up a real transaction (with inputs and outputs)

```bash
# Replace with a real preprod tx hash from https://preview.cardanoscan.io
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996')?\$expand=inputs,outputs,metadata" \
  | python3 -m json.tool
```

### Step 9.6 — Check an address balance

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Addresses('addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz')?\$expand=assets" \
  | python3 -m json.tool
```

### Step 9.7 — Get network-wide stats

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/NetworkInformation('preview')" \
  | python3 -m json.tool
```

You'll see total circulating supply, active stake, protocol version, and current epoch.

### Step 9.8 — Check a stake account (for staking pool operators)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Accounts('stake_test1uqhf84t3r6tmlwga5cg79p4rdtcqjrk4wnvfzf8tq3nxkss6akfe')" \
  | python3 -m json.tool
```

---

## Scenario 10 — Error Handling (What Happens When Things Go Wrong)

Understanding error responses is just as important as the happy path.

### 10.1 — Invalid transaction hash format (400 Bad Request)

```bash
curl -s -v "http://localhost:4004/odata/v4/cardano-odata/Transactions('this-is-not-a-real-hash')" 2>&1 | grep -E "< HTTP|{" | python3 -m json.tool
```

Response: `HTTP 400` with a structured error explaining what's wrong.

### 10.2 — Transaction doesn't exist on the blockchain (404 Not Found)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('0000000000000000000000000000000000000000000000000000000000000000')" \
  | python3 -m json.tool
```

Response: `HTTP 404` — the hash format is valid, but this transaction doesn't exist on-chain.

### 10.3 — Missing required field (400 Bad Request)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{
    "sapSystemId": "PRD"
  }' | python3 -m json.tool
```

Response: `HTTP 400` listing which required fields are missing.

### 10.4 — Try to retire an already-retired credit (409 Conflict)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RetireEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditId": "ESG-2024-VCS-001",
    "reason": "Trying to retire twice",
    "network": "preview"
  }' | python3 -m json.tool
```

Response: `HTTP 409` — the credit was already burned. This is enforced on-chain.

### 10.5 — Invalid supply chain status transition (400 Bad Request)

```bash
# Try to jump from Created straight to Received (skipping intermediate states)
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "newStatus": "Received",
    "locationCode": "SGSIN",
    "locationName": "Singapore",
    "handlerPubKey": "ed25519_pk1...",
    "network": "preview"
  }' | python3 -m json.tool
```

Response: `HTTP 400` — the smart contract rejects invalid state transitions.

---

## Scenario 11 — Food Safety Traceability

**The story**: A supermarket chain needs to track fresh produce from farm to shelf to comply with the EU Food Safety Regulation. In the event of a recall, they need to identify every impacted product within 4 hours.

### Step 11.1 — Record harvest at the farm

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "BATCH-TOMATO-2024-0315-FRM01",
    "sapSystemId": "AGR",
    "productCode": "VEG-TOMATO-CHERRY-KG",
    "quantity": 2500,
    "unitOfMeasure": "KG",
    "originAddress": "addr_test1qfarm_andalucia_spain...",
    "destAddress": "addr_test1qdistribution_madrid...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 11.2 — Cold storage arrival (temperature must be ≤4°C)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "BATCH-TOMATO-2024-0315-FRM01",
    "newStatus": "InTransit",
    "locationCode": "ESMAD",
    "locationName": "Madrid Cold Distribution Hub — Zone A",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "handlerPubKey": "ed25519_pk1distributor...",
    "network": "preview"
  }' | python3 -m json.tool
```

### Step 11.3 — Find all batches of this product currently in transit

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$filter=productCode%20eq%20'VEG-TOMATO-CHERRY-KG'%20and%20status%20eq%20'InTransit'&\$expand=checkpoints" \
  | python3 -m json.tool
```

### Step 11.4 — Emergency recall: find every batch that passed through Madrid

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainCheckpoints?\$filter=locationCode%20eq%20'ESMAD'&\$expand=event&\$orderby=timestamp%20desc" \
  | python3 -m json.tool
```

> **Real-world value**: With blockchain-anchored records, a recall that used to take days now takes minutes. Every batch, every handoff, every handler is cryptographically proven.

---

## Quick Reference: All Endpoints

### Entity Sets (GET)

| Endpoint | Description |
|---|---|
| `/Transactions` | Cardano transactions |
| `/TransactionInputs` | Transaction inputs (UTxOs spent) |
| `/TransactionOutputs` | Transaction outputs (UTxOs created) |
| `/TransactionMetadata` | On-chain metadata labels |
| `/Blocks` | Cardano blocks |
| `/Epochs` | Cardano epochs (5-day periods) |
| `/Addresses` | Address balances |
| `/AddressAssets` | Native tokens at an address |
| `/Accounts` | Stake account info |
| `/NetworkInformation` | Chain-wide statistics |
| `/HealthCheck` | Service health |
| `/SupplyChainEvents` | SAP supply chain records |
| `/SupplyChainCheckpoints` | Location history for each shipment |
| `/EsgCredits` | Carbon/REC/ESG credits |
| `/PaymentSettlements` | Escrow payment contracts |
| `/SettlementParties` | Parties in each settlement |
| `/AssetRegistry` | Tokenised physical assets |
| `/OracleData` | On-chain price/rate feeds |
| `/ActiveSupplyChain` | View: only non-delivered shipments |
| `/ActiveEsgCredits` | View: only non-retired credits |

### Actions (POST)

| Action | Description |
|---|---|
| `BuildTransaction` | Build an unsigned ADA transfer |
| `SubmitTransaction` | Submit a signed transaction |
| `InitSupplyChain` | Start a new supply chain event |
| `UpdateSupplyChainStatus` | Move shipment to next status |
| `IssueEsgCredit` | Issue a new ESG/carbon credit |
| `RetireEsgCredit` | Permanently burn a credit |
| `TransferEsgCredit` | Move credit to new beneficiary |
| `CreateSettlement` | Create an escrow payment |
| `ApproveSettlement` | Add a party's approval |
| `ExecuteSettlement` | Release funds when all approved |
| `RegisterAsset` | Register a physical asset on-chain |
| `TransferAsset` | Transfer asset ownership |
| `PostOracleValue` | Publish a price/rate to blockchain |

### Functions (GET with parameters)

| Function | Description |
|---|---|
| `GetTransactionStatus(txHash,network)` | Poll confirmation status |

---

## Summary — What You Can Do With This API

You can:

1. **Track anything** moving through a supply chain with tamper-proof location history
2. **Issue and retire ESG/carbon credits** with a permanent, auditor-verifiable trail
3. **Manage escrow payments** using code instead of banks
4. **Register and transfer ownership** of physical assets (equipment, vehicles, documents)
5. **Publish price data** to the blockchain for smart contracts to consume
6. **Send ADA programmatically** with SAP document references embedded in metadata
7. **Query all data** using standard OData V4 syntax (same as SAP S/4HANA)
8. **Read live Cardano blockchain data** (blocks, epochs, transactions, addresses) through a standard enterprise API

All of this happens through **standard HTTP** — the same technology used by every web app on the internet. The complexity of blockchain (validators, UTxOs, CBOR encoding, consensus) is hidden behind a clean OData V4 interface.

---

## Next Steps

- **Import the Postman collection**: `scripts/CARDANO_SAP_API.postman_collection.json`
- **Connect to a real SAP system**: [SAP Integration Guide](guides/SAP_INTEGRATION_GUIDE.md)
- **Understand the smart contracts**: [Aiken Contracts](concepts%20%26%20architecture/AIKEN_CONTRACTS.md)
- **Deploy to production**: [Docker Deployment](guides/DOCKER_DEPLOYMENT.md)
- **Get a free test ADA**: https://docs.cardano.org/cardano-testnet/tools/faucet
