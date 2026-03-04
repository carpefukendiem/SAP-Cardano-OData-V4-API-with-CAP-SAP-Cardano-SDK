# Step-by-Step Demo Guide

**You do not need blockchain knowledge to follow this guide.**

This demo walks you through 5 real-world scenarios that the SAP–Cardano integration solves. Each scenario takes about 2–3 minutes and shows you the API in action.

---

## Before you start

Make sure the service is running (see [QUICK_START.md](QUICK_START.md)):

```bash
npm start
```

You should see:
```
[cds] - server listening on { url: 'http://localhost:4004' }
```

Open a second terminal for the demo commands below.

---

## Scenario 1 — Track a Shipment on the Blockchain

**The story**: Your company ships industrial equipment from Hamburg, Germany to Singapore. You want an *unforgeable* record of every step of the journey.

### Step 1.1 — Create the shipment record

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "sapSystemId": "PRD",
    "initiatorAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "originLocation": "DEHAM",
    "destinationLocation": "SGSIN",
    "network": "preprod"
  }' | python3 -m json.tool
```

**What you'll see**: A JSON response containing:
- `success: true`
- `unsignedTxCbor`: A long hex string — this is the Cardano transaction, ready to be signed

> **What just happened?** The service built a Cardano transaction that encodes your shipment details. The `DEHAM` is the UN/LOCODE for the Port of Hamburg; `SGSIN` is Singapore. These 5-character codes are validated by the smart contract.

### Step 1.2 — Check the shipment status

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$filter=sapDocumentId%20eq%20'4500000001'" \
  | python3 -m json.tool
```

### Step 1.3 — Update status as it moves through customs

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996",
    "newStatus": "InTransit",
    "location": "NLRTM",
    "updaterAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "network": "preprod"
  }' | python3 -m json.tool
```

> **`NLRTM`** is the Port of Rotterdam — a common transit hub between Hamburg and Singapore.

**What the smart contract enforces** (automatically, by code):
- Status can only move *forward*: `Created → Dispatched → InTransit → Cleared → Received`
- You cannot mark something as `Received` if it hasn't been `Dispatched`
- Location codes must be valid 5-character format
- The updater must be the authorised party

**Why this matters**: No one — not the shipping company, not the buyer, not even your own IT department — can go back and falsify the history. Every status change is cryptographically locked in.

---

## Scenario 2 — Issue and Retire Carbon Credits

**The story**: Your company runs a reforestation project in Brazil. You need to issue verifiable carbon credits and later retire them on behalf of a corporate client.

### Step 2.1 — Issue 1,000 carbon credits

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "VCS",
    "vintageYear": 2023,
    "quantity": 1000,
    "projectId": "VCS-BRA-12345",
    "issuerAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "sapDocumentId": "4500000002",
    "network": "preprod"
  }' | python3 -m json.tool
```

> **VCS** = Verified Carbon Standard (the most widely used voluntary carbon standard).
> **vintageYear** = the year the carbon was actually removed from the atmosphere (not the issuance year).
> The smart contract validates: 1990 ≤ vintageYear ≤ 2100.

### Step 2.2 — See all active VCS credits

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$filter=standard%20eq%20'VCS'%20and%20status%20eq%20'active'&\$count=true" \
  | python3 -m json.tool
```

### Step 2.3 — Retire credits (permanent — cannot be undone)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RetireEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996",
    "retirementBeneficiary": "ACME Corporation — 2023 Net Zero Commitment",
    "retiredByAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "network": "preprod"
  }' | python3 -m json.tool
```

**What happens when you retire a credit**: The UTxO (the digital "coin" holding the credit) is *burned* — permanently destroyed. No new output is created. This makes double-claiming impossible. Any auditor can verify the retirement on any Cardano blockchain explorer.

### Step 2.4 — Try to issue with an invalid vintage year (error demo)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "VCS",
    "vintageYear": 1850,
    "quantity": 1000,
    "projectId": "VCS-FAKE",
    "issuerAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "sapDocumentId": "4500000099",
    "network": "preprod"
  }' | python3 -m json.tool
```

You'll get an error response — vintage year 1850 is rejected because carbon accounting didn't exist before 1990.

---

## Scenario 3 — Escrow Payment Settlement

**The story**: You're buying €500,000 worth of equipment. The seller won't ship until they're paid. You don't want to pay until the goods arrive. The solution: a smart contract holds the funds until both parties agree.

### Step 3.1 — Create the escrow

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/CreateSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "5000000001",
    "buyerAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "sellerAddress": "addr_test1qzjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj",
    "totalAmountLovelace": "500000000",
    "network": "preprod"
  }' | python3 -m json.tool
```

> **500,000,000 Lovelace = 500 ADA** (in this test scenario). In production, stablecoin integration would be used for EUR/USD settlements.

### Step 3.2 — Buyer approves (goods received)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/ApproveSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996",
    "approverAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "network": "preprod"
  }' | python3 -m json.tool
```

### Step 3.3 — Execute payment (funds released to seller)

```bash
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/ExecuteSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996",
    "executorAddress": "addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz",
    "network": "preprod"
  }' | python3 -m json.tool
```

**Why this is better than traditional escrow**: Traditional escrow requires a trusted third party (bank, legal firm) who charges fees and can be a single point of failure. The smart contract *is* the escrow agent — the code enforces the rules with zero possibility of fraud or error.

---

## Scenario 4 — Query blockchain data with OData filters

**The story**: Your SAP analyst wants to see all in-transit shipments with more than 100kg carbon footprint, sorted by date.

### Step 4.1 — Filter + sort + paginate

```bash
# All InTransit shipments, sorted newest first, first page of 10
curl -s "http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?\$filter=status%20eq%20'InTransit'&\$orderby=createdAt%20desc&\$top=10&\$skip=0&\$count=true" \
  | python3 -m json.tool
```

### Step 4.2 — Select only specific fields (reduce payload size)

```bash
# Only fetch what you need — faster, smaller response
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$select=creditId,standard,vintageYear,quantity,status&\$top=5" \
  | python3 -m json.tool
```

### Step 4.3 — Combine filters (ESG credits with quantity > 500 and VCS standard)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/EsgCredits?\$filter=quantity%20gt%20500%20and%20standard%20eq%20'VCS'&\$orderby=quantity%20desc" \
  | python3 -m json.tool
```

> **This is standard OData V4** — the same query language used by SAP S/4HANA, Microsoft Dynamics, and thousands of other enterprise systems. No Cardano knowledge needed to query the data.

---

## Scenario 5 — Live blockchain data

**The story**: You want to see what's actually happening on the Cardano blockchain right now.

### Step 5.1 — Get the current chain tip (latest block)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Blocks('latest')" \
  -H "x-cardano-network: preprod" \
  | python3 -m json.tool
```

You'll see:
- **Block height**: how many blocks have been added since genesis
- **Slot**: Cardano's internal clock (1 slot = 1 second)
- **Transaction count**: how many transactions in this block
- **Epoch**: the current 5-day period (Cardano groups blocks into epochs)

### Step 5.2 — Look up a real transaction

```bash
# This is a real preprod transaction hash — it will work if you have a Blockfrost key
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996')" \
  -H "x-cardano-network: preprod" \
  | python3 -m json.tool
```

### Step 5.3 — Check service health

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/health" \
  | python3 -m json.tool
```

You'll see blockchain connectivity status, cache statistics, and service uptime.

---

## Scenario 6 — Error handling (what happens when things go wrong)

### Wrong format (400 Bad Request)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('this-is-not-a-tx-hash')" \
  | python3 -m json.tool
```

Response: `HTTP 400` with a clear error message explaining what's wrong.

### Transaction doesn't exist (404 Not Found)

```bash
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('0000000000000000000000000000000000000000000000000000000000000000')" \
  -H "x-cardano-network: preprod" \
  | python3 -m json.tool
```

Response: `HTTP 404` — the hash is valid format, but doesn't exist on-chain.

---

## Summary — What you just did

You used an API to:

1. **Create a global shipment record** that no one can falsify
2. **Issue and retire carbon credits** with a permanent, auditable trail
3. **Manage an escrow payment** using code instead of a bank
4. **Query blockchain data** using familiar SQL-like filter syntax
5. **Read live Cardano blockchain data** through a standard enterprise API

All of this happened through **standard HTTP requests** — the same technology used by every web app on the internet. The complexity of blockchain (validators, UTxOs, CBOR encoding, consensus) is hidden behind a clean OData V4 interface.

---

## Next steps

- **Import the Postman collection** for a clickable API explorer: `scripts/CARDANO_SAP_API.postman_collection.json`
- **Run all examples automatically**: `npx tsx scripts/request_examples.ts all`
- **Connect to a real SAP system**: [SAP Integration Guide](guides/SAP_INTEGRATION_GUIDE.md)
- **Understand the smart contracts**: [Aiken Contracts](concepts%20%26%20architecture/AIKEN_CONTRACTS.md)
- **Deploy to production**: [Docker Deployment](guides/DOCKER_DEPLOYMENT.md)
