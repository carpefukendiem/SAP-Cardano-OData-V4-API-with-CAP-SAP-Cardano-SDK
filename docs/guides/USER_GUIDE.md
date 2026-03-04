# User Guide

## Deploying the Service

### Option 1: Local (npm)
```bash
npm install
npm run dev
# Available at: http://localhost:4004/odata/v4/cardano-odata/
```

### Option 2: Docker
```bash
docker compose up -d
# Available at: http://localhost:4004/odata/v4/cardano-odata/
```

### Option 3: SAP BTP Cloud Foundry
```bash
cf push sap-cardano-odata --buildpack nodejs_buildpack
```

## Querying the API

### Verify Service is Running

```http
GET http://localhost:4004/odata/v4/cardano-odata/$metadata
```

### Transaction Lookup

```http
GET http://localhost:4004/odata/v4/cardano-odata/Transactions('a7b2c3d4e5f6...64chars')?network=preview
```

Response:
```json
{
  "txHash": "a7b2c3d4...",
  "blockHash": "b1c2d3...",
  "blockHeight": 9234567,
  "blockTime": "2024-01-15T10:30:00Z",
  "fees": "180000",
  "confirmations": 25
}
```

### Address Balance

```http
GET http://localhost:4004/odata/v4/cardano-odata/Addresses('addr1qxy5...')?network=preview
```

### Network Status

```http
GET http://localhost:4004/odata/v4/cardano-odata/NetworkInformation('preview')
```

## Smart Contract Workflows

### Supply Chain Tracking

```http
POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain
Content-Type: application/json

{
  "sapDocumentId": "PO-2024-001",
  "sapSystemId": "PRD",
  "productCode": "STEEL-BEAM-A",
  "quantity": 100,
  "unitOfMeasure": "KG",
  "originAddress": "addr1qxy...",
  "destAddress": "addr1qab...",
  "network": "preview"
}
```

Response includes `unsignedTxCbor` — sign with your wallet and submit via `SubmitTransaction`.

### ESG Credit Issuance

```http
POST http://localhost:4004/odata/v4/cardano-odata/IssueEsgCredit
Content-Type: application/json

{
  "creditType": "CarbonCredit",
  "beneficiaryAddress": "addr1qxy...",
  "amount": 1000000,
  "unit": "kgCO2e",
  "vintageYear": 2023,
  "verificationStandard": "VCS",
  "projectId": "VCS-1234",
  "sapCostCenter": "CC-LOGISTICS-001",
  "network": "preview"
}
```

## Known Limitations

- Transaction building uses mock CBOR in this version. Use `cardano-serialization-lib` or `lucid-cardano` for production.
- Aiken contracts require deployment on Cardano testnet for end-to-end testing.
- `$metadata` reflects the CDS schema; smart contract entities need separate SAP CAP database entries for full persistence.
