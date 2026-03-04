# Data Model Documentation

## Core Blockchain Entities

| Entity | Key | Description |
|--------|-----|-------------|
| Transactions | txHash | Full transaction with inputs, outputs, metadata |
| Addresses | address | Balance, assets, UTxO/tx counts |
| Blocks | blockHash | Block metadata, tx count, fees |
| Epochs | epochNo | Epoch stats, active stake |
| Accounts | stakeAddress | Stake account rewards, delegation |
| NetworkInformation | network | Current protocol parameters |

## Smart Contract Entities

| Entity | Key | SAP Integration |
|--------|-----|-----------------|
| SupplyChainEvents | sapDocumentId | SAP MM/WM Purchase Orders, Deliveries |
| EsgCredits | creditId | SAP CO Cost Centers, WBS Elements |
| PaymentSettlements | settlementId | SAP FI Invoices (AP/AR) |
| AssetRegistry | assetId | SAP MM Materials, FI-AA Fixed Assets |
| OracleData | oracleId | SAP condition types, exchange rates |

## Entity Relationships

```
SupplyChainEvents 1──* SupplyChainCheckpoints
PaymentSettlements 1──* SettlementParties
Transactions 1──* TransactionInputs
Transactions 1──* TransactionOutputs
Transactions 1──* TransactionMetadata
Addresses 1──* AddressAssets
```

## Field Conventions

- All ADA amounts stored as `Integer64` in **lovelace** (1 ADA = 1,000,000 lovelace)
- Timestamps as OData `Timestamp` (ISO 8601)
- Hashes as `String(64)` hex
- SAP document IDs as `String(35)` (per SAP CHAR35 type)
- SAP system IDs as `String(3)` (3-char SID: PRD, DEV, QAS)
