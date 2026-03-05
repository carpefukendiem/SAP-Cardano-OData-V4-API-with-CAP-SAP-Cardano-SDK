# User Guide — SAP Cardano OData V4 API

## Before You Start

You need **one free API key** from Blockfrost. This is what connects the app to the Cardano blockchain.

---

## Step 1 — Get Your Free Blockfrost API Key

1. Go to **https://blockfrost.io** and create a free account
2. After logging in, click **"+ New project"**
3. Name it anything (e.g. `my-cardano-project`)
4. For **Network**, choose **"Cardano Preview"** (this is the safe testing network — no real money)
5. Click **Create project**
6. Copy the **Project ID** — it looks like: `previewABCDEF1234567890abcdef1234567890`

> **What is Preview?** It's a test version of Cardano. You can do everything the real network does, but with fake ADA. Perfect for development.

---

## Step 2 — Download the Code

Open **Terminal** (press **Cmd+Space**, type `Terminal`, press Enter).

Make sure you are in your home folder first — copy and paste this **entire block** at once:

```bash
cd ~
git clone https://github.com/carpefukendiem/SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK.git
cd SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK
git pull origin claude/cardano-blockchain-solution-t4wNO
```

> **Important:** The `cd ~` at the start ensures you download the project to your home folder (`/Users/yourname/`), not inside another folder by mistake. Do not skip this line.

After this you will be inside the project folder. **Stay in this folder** for all the remaining steps — do not `cd` anywhere else and do not run `git clone` again.

---

## Step 3 — Create Your Configuration File

This creates a private file called `.env` where you store your API key.

```bash
cp .env.example .env
```

Now open it:

```bash
open -e .env
```

> This opens the file in **TextEdit** on Mac.

Inside the file, find this line:

```
BLOCKFROST_API_KEY_PREVIEW=previewYOURKEYHERE
```

**Delete** `previewYOURKEYHERE` and **paste your Project ID** from Step 1. It should look like:

```
BLOCKFROST_API_KEY_PREVIEW=previewABCDEF1234567890abcdef1234567890
```

Save the file (**Cmd+S**) and close TextEdit.

> **Important:** The `.env` file is private — never share it or upload it to GitHub. It is already listed in `.gitignore` so this is handled automatically.

---

## Step 4 — Install Dependencies

```bash
npm install
```

This downloads all required packages. It only needs to run once.

---

## Step 5 — Start the Server

```bash
npm run dev
```

You should see output ending with something like:

```
[cds] - server listening on { url: 'http://localhost:4004' }
```

The API is now running locally.

---

## Step 6 — Verify It Works

Open your browser and go to:

```
http://localhost:4004/odata/v4/cardano-odata/$metadata
```

If you see a large XML document, everything is working.

---

## Using the API

### Open the Service Index (Browser)

```
http://localhost:4004/odata/v4/cardano-odata/
```

Shows all available entity sets as a JSON list.

---

### Blockchain Data Examples

#### Get the latest block

```
GET http://localhost:4004/odata/v4/cardano-odata/Blocks?$orderby=blockHeight desc&$top=1
```

#### Look up a specific Cardano transaction

```
GET http://localhost:4004/odata/v4/cardano-odata/Transactions('5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996')
```

#### Get transaction with all inputs and outputs

```
GET http://localhost:4004/odata/v4/cardano-odata/Transactions('5d677265...')?$expand=inputs,outputs,metadata
```

#### Check an address balance and its tokens

```
GET http://localhost:4004/odata/v4/cardano-odata/Addresses('addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz')?$expand=assets
```

#### Get network-wide statistics

```
GET http://localhost:4004/odata/v4/cardano-odata/NetworkInformation('preview')
```

#### Get current epoch info

```
GET http://localhost:4004/odata/v4/cardano-odata/Epochs?$orderby=epochNo desc&$top=1
```

#### Check service health

```
GET http://localhost:4004/odata/v4/cardano-odata/HealthCheck('health')
```

---

### Supply Chain Examples

#### Start a new shipment from Hamburg to Singapore

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "sapSystemId": "PRD",
    "productCode": "WIDGET-PRO-2000",
    "quantity": 500,
    "unitOfMeasure": "EA",
    "originAddress": "addr_test1q...",
    "destAddress": "addr_test1q...",
    "network": "preview"
  }'
```

#### Move a shipment to the next status (Dispatched)

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/UpdateSupplyChainStatus \
  -H "Content-Type: application/json" \
  -d '{
    "sapDocumentId": "4500000001",
    "newStatus": "Dispatched",
    "locationCode": "DEHAM",
    "locationName": "Port of Hamburg",
    "latitude": 53.5511,
    "longitude": 9.9937,
    "handlerPubKey": "ed25519_pk1...",
    "network": "preview"
  }'
```

**Valid status sequence**: `Created → Dispatched → InTransit → UnderInspection → Cleared → Received`

You cannot skip steps. The smart contract enforces the order.

#### View all shipments currently in transit

```
GET http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?$filter=status eq 'InTransit'
```

#### View active shipments only (convenience view)

```
GET http://localhost:4004/odata/v4/cardano-odata/ActiveSupplyChain
```

#### Get a shipment with its full checkpoint history

```
GET http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents(sapDocumentId='4500000001')?$expand=checkpoints($orderby=timestamp asc)
```

#### Find all shipments by SAP system

```
GET http://localhost:4004/odata/v4/cardano-odata/SupplyChainEvents?$filter=sapSystemId eq 'PRD'&$orderby=createdAt desc
```

---

### ESG and Carbon Credit Examples

#### Issue a carbon credit

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditType": "CarbonCredit",
    "beneficiaryAddress": "addr_test1q...",
    "amount": 1000,
    "unit": "tCO2e",
    "vintageYear": 2023,
    "verificationStandard": "VCS",
    "projectId": "VCS-BRA-12345",
    "sapCostCenter": "CC-1000",
    "network": "preview"
  }'
```

**Valid credit types**: `CarbonCredit`, `RenewableEnergyCertificate`, `WaterCredit`, `BiodiversityCredit`, `SocialImpact`

#### Issue renewable energy certificates

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditType": "RenewableEnergyCertificate",
    "beneficiaryAddress": "addr_test1q...",
    "amount": 5000,
    "unit": "MWh",
    "vintageYear": 2024,
    "verificationStandard": "I-REC",
    "projectId": "IREC-DE-00823",
    "sapCostCenter": "CC-2000",
    "network": "preview"
  }'
```

#### Transfer a credit to a new beneficiary

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/TransferEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditId": "ESG-2024-VCS-001",
    "newBeneficiary": "addr_test1q...",
    "network": "preview"
  }'
```

#### Retire a credit permanently (for net-zero reporting)

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/RetireEsgCredit \
  -H "Content-Type: application/json" \
  -d '{
    "creditId": "ESG-2024-VCS-001",
    "reason": "Annual net-zero commitment — ACME Corp 2023",
    "sapDocument": "4900000042",
    "network": "preview"
  }'
```

#### View all active (non-retired) credits

```
GET http://localhost:4004/odata/v4/cardano-odata/ActiveEsgCredits
```

#### Filter credits by type and cost center

```
GET http://localhost:4004/odata/v4/cardano-odata/EsgCredits?$filter=creditType eq 'CarbonCredit' and isRetired eq false and sapCostCenter eq 'CC-1000'&$orderby=amount desc
```

---

### Payment Settlement Examples

#### Create an escrow payment

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/CreateSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "sapInvoiceId": "5100000001",
    "sapSystemId": "PRD",
    "parties": "[{\"address\":\"addr_test1qbuyer...\",\"amount\":2000000000,\"sapPartnerNumber\":\"1000012345\"},{\"address\":\"addr_test1qseller...\",\"amount\":0,\"sapPartnerNumber\":\"1000067890\"}]",
    "deadline": "2025-12-31T23:59:59Z",
    "network": "preview"
  }'
```

#### Approve a settlement (both parties must approve)

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/ApproveSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SET-PRD-5100000001",
    "signerPubKey": "ed25519_pk1...",
    "network": "preview"
  }'
```

#### Execute (release funds) once all parties have approved

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/ExecuteSettlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SET-PRD-5100000001",
    "network": "preview"
  }'
```

**Valid settlement statuses**: `Pending → Approved → Executed` (or `Disputed` / `Expired` / `Refunded`)

#### View pending settlements with parties

```
GET http://localhost:4004/odata/v4/cardano-odata/PaymentSettlements?$filter=status eq 'Pending'&$expand=parties&$orderby=deadline asc
```

---

### Asset Registry Examples

#### Register a physical asset (e.g. a CNC machine)

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/RegisterAsset \
  -H "Content-Type: application/json" \
  -d '{
    "sapAssetNumber": "100000042",
    "sapPlant": "1000",
    "sapMaterialNumber": "CNC-MILL-5AXIS",
    "ownerAddress": "addr_test1q...",
    "quantity": 1,
    "network": "preview"
  }'
```

#### Transfer an asset to a new owner

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/TransferAsset \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "ASSET-1000-100000042",
    "newOwner": "addr_test1q...",
    "sapTransferOrder": "0000012345",
    "network": "preview"
  }'
```

#### View all active assets at a plant

```
GET http://localhost:4004/odata/v4/cardano-odata/AssetRegistry?$filter=sapPlant eq '1000' and state eq 'Active'
```

**Valid asset states**: `Active`, `Locked`, `Transferred`, `Decommissioned`

---

### Oracle Data Examples

#### Publish an exchange rate

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/PostOracleValue \
  -H "Content-Type: application/json" \
  -d '{
    "oracleId": "FX-EURUSD-20240315",
    "sapSystemId": "TRY",
    "dataType": "ExchangeRate",
    "fromCurrency": "EUR",
    "toCurrency": "USD",
    "value": 1087542,
    "denominator": 1000000,
    "validFrom": "2024-03-15T00:00:00Z",
    "validUntil": "2024-03-15T23:59:59Z",
    "network": "preview"
  }'
```

> `value / denominator = actual rate`: 1,087,542 / 1,000,000 = **1.087542 EUR/USD**

#### View all current (non-expired) rates

```
GET http://localhost:4004/odata/v4/cardano-odata/OracleData?$filter=isExpired eq false&$orderby=postedAt desc
```

---

### Transaction Examples

#### Build an ADA transfer (get unsigned CBOR)

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/BuildTransaction \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": "addr_test1q...",
    "toAddress": "addr_test1q...",
    "lovelace": 5000000,
    "metadata": "{\"sap\":{\"inv\":\"5100000001\",\"co\":\"CC-1000\"}}",
    "network": "preview"
  }'
```

> **5,000,000 Lovelace = 5 ADA**. The `metadata` field lets you link SAP document numbers directly to blockchain transactions.

#### Submit a signed transaction

```bash
curl -X POST http://localhost:4004/odata/v4/cardano-odata/SubmitTransaction \
  -H "Content-Type: application/json" \
  -d '{
    "signedTxCbor": "84a500...",
    "network": "preview"
  }'
```

#### Poll a transaction for confirmation

```
GET http://localhost:4004/odata/v4/cardano-odata/GetTransactionStatus(txHash='5d677265...',network='preview')
```

---

## OData Query Cheat Sheet

| Pattern | URL |
|---|---|
| All records | `/SupplyChainEvents` |
| Filter by field | `/SupplyChainEvents?$filter=status eq 'InTransit'` |
| Multiple filters | `?$filter=status eq 'Active' and sapPlant eq '1000'` |
| Sort descending | `?$orderby=createdAt desc` |
| First 10 records | `?$top=10` |
| Skip first 10 (page 2) | `?$top=10&$skip=10` |
| Count total matches | `?$count=true` |
| Select specific fields | `?$select=sapDocumentId,status,productCode` |
| Expand related data | `?$expand=checkpoints` |
| Expand with filter | `?$expand=checkpoints($orderby=timestamp asc)` |
| Combined example | `?$filter=status eq 'InTransit'&$expand=checkpoints&$orderby=createdAt desc&$top=5` |

---

## Stopping the Server

Press **Ctrl+C** in the terminal where the server is running.

---

## Option B: Run with Docker (alternative to Steps 4–5)

If you have Docker installed, you can skip `npm install` and `npm run dev` and just run:

```bash
docker compose up -d
```

The API will be available at the same URL: `http://localhost:4004`

To stop it:

```bash
docker compose down
```

---

## Option C: Deploy to SAP BTP Cloud Foundry

```bash
cf push sap-cardano-odata --buildpack nodejs_buildpack
```

---

## Get Free Test ADA

To submit real transactions on the preview testnet you need test ADA (no real value):

1. Go to: **https://docs.cardano.org/cardano-testnet/tools/faucet**
2. Select **Preview Testnet**
3. Enter your wallet address
4. Click **Request funds**

You'll receive 10,000 test ADA within a few seconds. Use this freely — it has no monetary value.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `cp: .env.example: No such file or directory` | Run `git pull origin claude/cardano-blockchain-solution-t4wNO` first |
| `npm: command not found` | Install Node.js from https://nodejs.org (choose the LTS version) |
| `Cannot find module 'sqlite3'` | Run `npm install` — the `@cap-js/sqlite` package is missing |
| `EACCES: permission denied` on `node_modules` | Run: `cd ~/SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK && sudo chown -R $(whoami) . && npm install` |
| Path contains folder name twice (e.g. `.../SAP-.../SAP-.../`) | You cloned inside the project folder. Run `cd ~` first, then `git clone ...` again |
| `401 Unauthorized` from blockchain calls | Your Blockfrost key is wrong or expired — double-check Steps 1 and 3 |
| Port 4004 already in use | Run `lsof -ti:4004 \| xargs kill` to free the port |
| TextEdit opens in rich text mode | In TextEdit go to Format → Make Plain Text before editing |
| `{ "value": [] }` on GET (empty results) | The in-memory DB starts fresh each run. POST something first, then GET it. |
| Actions return `success: false` | Check the terminal running `npm run dev` for the detailed error log |

---

## Known Limitations

- Transaction building produces unsigned CBOR. Use `cardano-serialization-lib` or `lucid-cardano` / `mesh.js` to sign and submit from a wallet.
- Aiken smart contracts require deployment to a Cardano testnet for end-to-end on-chain testing.
- The in-memory SQLite database resets every time you restart the server. For persistence use a file-based SQLite or HANA Cloud.
- Authentication is disabled in development mode. In production on SAP BTP, XSUAA is injected automatically.
