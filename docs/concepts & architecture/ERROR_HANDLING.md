# Error Handling Strategy

## Overview

All errors in the SAP-Cardano OData service follow the OData 4.0 error format and map to standardized HTTP status codes. Every error response includes a machine-readable `code` field so SAP systems and monitoring tools can react programmatically.

---

## Error Hierarchy

```
SapCardanoError (base)
├── ValidationError (400)
│   ├── InvalidAddressError (400)
│   ├── InvalidTxHashError (400)
│   └── InvalidNetworkError (400)
├── ResourceNotFoundError (404)
├── UnauthorizedError (401)
├── ForbiddenError (403)
├── ContractStateError (409)
├── BlockchainConnectivityError (503)
│   └── AllProvidersFailedError (503)
├── TimeoutError (504)
└── InternalError (500)
```

---

## The 5 Core Error Scenarios

### 1. Invalid input format → HTTP 400

Triggered by malformed request parameters.

```json
{
  "error": {
    "code": "SAP-CARDANO-002",
    "message": "Invalid Cardano address: 0xdeadbeef",
    "innererror": {
      "timestamp": "2024-01-15T10:30:00Z",
      "details": { "address": "0xdeadbeef" }
    }
  }
}
```

**Common triggers**:

| Field | Valid example | Invalid example | Error code |
|---|---|---|---|
| Cardano address | `addr_test1qpkxr3...` | `0xdeadbeef` | SAP-CARDANO-002 |
| Transaction hash | `5d677265fa5bb2...` (64 hex chars) | `abc123` (too short) | SAP-CARDANO-003 |
| Network | `preview`, `preprod`, `mainnet` | `testnet`, `rinkeby` | SAP-CARDANO-004 |
| SAP document ID | `4500000001` (1–35 chars) | (empty string) | SAP-CARDANO-001 |
| Vintage year | `2023` | `1850` | SAP-CARDANO-040 |
| LOCODE | `DEHAM` (exactly 5 chars) | `HAMBURG` | SAP-CARDANO-040 |

**Try it yourself**:
```bash
# Invalid Cardano address
curl -s "http://localhost:4004/odata/v4/cardano-odata/Addresses('0xdeadbeef')" | python3 -m json.tool
# → 400: Invalid Cardano address

# Invalid tx hash (too short)
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('abc123')" | python3 -m json.tool
# → 400: Invalid transaction hash

# Unknown network
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/InitSupplyChain \
  -H "Content-Type: application/json" \
  -d '{"sapDocumentId":"PO-001","sapSystemId":"PRD","network":"rinkeby","originAddress":"addr_test1q...","destAddress":"addr_test1q..."}' \
  | python3 -m json.tool
# → 400: Invalid network identifier: rinkeby
```

---

### 2. Data not found → HTTP 404

```json
{
  "error": {
    "code": "SAP-CARDANO-010",
    "message": "Transaction not found: aaaa...bbbb",
    "innererror": {
      "timestamp": "2024-01-15T10:31:00Z",
      "details": { "resource": "Transaction", "identifier": "aaaa...bbbb" }
    }
  }
}
```

**When does this happen?**

| Scenario | Example |
|---|---|
| Transaction hash is valid format but doesn't exist on-chain | All-zeros hash |
| Supply chain event ID not yet created | Querying before `InitSupplyChain` was called |
| ESG credit ID doesn't exist | Wrong creditId in `RetireEsgCredit` |
| Block hash not found | Block was orphaned or hash is wrong |
| Address has no UTxOs (no balance) | Address has never received ADA |

**Try it yourself**:
```bash
# Valid format, but transaction doesn't exist
curl -s "http://localhost:4004/odata/v4/cardano-odata/Transactions('0000000000000000000000000000000000000000000000000000000000000000')" \
  | python3 -m json.tool
# → 404: Transaction not found
```

---

### 3. Cardano API connectivity failure → HTTP 503

```json
{
  "error": {
    "code": "SAP-CARDANO-030",
    "message": "Cardano provider 'blockfrost' unavailable: connection refused. Please retry later.",
    "innererror": {
      "timestamp": "2024-01-15T10:32:00Z",
      "details": { "provider": "blockfrost", "fallbackAttempted": true }
    }
  }
}
```

**Failover flow**:
```
1. Call Blockfrost API
   ├── Success → return result
   └── Failure (timeout / 500 / connection refused)
         │
         ▼
2. Automatically retry with Koios (fallback)
   ├── Success → return result
   └── Failure → return AllProvidersFailedError (HTTP 503)
```

**Causes**:
- Blockfrost API key expired or quota exceeded
- Network partition between BTP and Blockfrost servers
- Cardano mainnet/testnet experiencing degraded performance
- `ENABLE_KOIOS_FALLBACK=false` and Blockfrost is down

**How to diagnose**:
```bash
# Check health endpoint first
curl -s "http://localhost:4004/odata/v4/cardano-odata/HealthCheck('health')" | python3 -m json.tool
# Look at "blockchain" field: "connected" vs "degraded" vs "unavailable"

# Test Blockfrost directly
curl -H "project_id: YOUR_KEY" https://cardano-preview.blockfrost.io/api/v0/health
```

---

### 4. Unauthorized access → HTTP 401/403

```json
{
  "error": {
    "code": "SAP-CARDANO-020",
    "message": "Authentication required"
  }
}
```

**Development mode**: Auth is disabled. All requests are allowed.

**Production mode (SAP BTP)**:
- Missing `Authorization: Bearer <token>` header → **HTTP 401**
- Token valid but scope missing (e.g. `cardano.read` scope needed for GETs) → **HTTP 403**
- Token expired → **HTTP 401**

**Getting a token**:
```bash
# Fetch token from XSUAA
curl -s -X POST \
  https://YOUR-SUBDOMAIN.authentication.eu10.hana.ondemand.com/oauth/token \
  -d "grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET" \
  | python3 -m json.tool

# Use token in subsequent calls
curl -H "Authorization: Bearer eyJhbG..." \
  https://cardano-odata-api.cfapps.eu10.hana.ondemand.com/odata/v4/cardano-odata/HealthCheck\('health'\)
```

---

### 5. Internal server error → HTTP 500

```json
{
  "error": {
    "code": "SAP-CARDANO-050",
    "message": "An unexpected internal error occurred"
  }
}
```

Generic message — no internal details exposed to callers (security). Full error with stack trace is logged server-side in BTP Application Logging Service or local console.

**To see the full error in development**:
```bash
# Watch the dev server terminal — full stack traces appear there
npm run dev
# Then trigger the failing request in another terminal
```

---

### 6. Contract state conflict → HTTP 409

Returned when a blockchain state machine transition is invalid.

```json
{
  "error": {
    "code": "SAP-CARDANO-041",
    "message": "Cannot retire credit ESG-2024-VCS-001: already retired",
    "innererror": {
      "details": {
        "creditId": "ESG-2024-VCS-001",
        "currentStatus": "Retired"
      }
    }
  }
}
```

**Real-world triggers**:

| Action | Trigger | Error message |
|---|---|---|
| `RetireEsgCredit` | Credit already retired | "Cannot retire: already retired" |
| `UpdateSupplyChainStatus` | Invalid status transition | "Cannot move from Received to InTransit" |
| `ExecuteSettlement` | Not all parties approved | "Settlement requires all party approvals before execution" |
| `TransferAsset` | Asset is Locked | "Cannot transfer: asset is locked (reason: legal hold)" |
| `ApproveSettlement` | Settlement already executed | "Cannot approve: settlement is in Executed state" |

**Try it yourself**:
```bash
# First retire a credit
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RetireEsgCredit \
  -H "Content-Type: application/json" \
  -d '{"creditId":"ESG-2024-VCS-001","reason":"first retirement","network":"preview"}'

# Then try to retire again
curl -s -X POST http://localhost:4004/odata/v4/cardano-odata/RetireEsgCredit \
  -H "Content-Type: application/json" \
  -d '{"creditId":"ESG-2024-VCS-001","reason":"second attempt","network":"preview"}'
# → 409: Cannot retire: already retired
```

---

## Error Code Reference

| Code | HTTP | Description | Common cause |
|------|------|-------------|-------------|
| SAP-CARDANO-001 | 400 | Generic validation error | Missing required field, value out of range |
| SAP-CARDANO-002 | 400 | Invalid Cardano address | Wrong prefix, wrong length, Ethereum address used |
| SAP-CARDANO-003 | 400 | Invalid transaction hash | Not 64 hex chars, contains non-hex characters |
| SAP-CARDANO-004 | 400 | Invalid network identifier | Typo in network name, Ethereum network name used |
| SAP-CARDANO-010 | 404 | Resource not found | Transaction/block/address doesn't exist on-chain |
| SAP-CARDANO-020 | 401 | Unauthorized | Missing or expired JWT token (production only) |
| SAP-CARDANO-021 | 403 | Forbidden | Token valid but missing required XSUAA scope |
| SAP-CARDANO-030 | 503 | Blockchain provider unavailable | Blockfrost + Koios both unreachable |
| SAP-CARDANO-031 | 504 | Request timeout | Blockchain query took too long |
| SAP-CARDANO-040 | 400 | Contract validation error | Datum field invalid (vintage year, LOCODE format, etc.) |
| SAP-CARDANO-041 | 409 | Contract state conflict | Invalid state machine transition, double-spend attempt |
| SAP-CARDANO-050 | 500 | Internal server error | Unexpected crash — check server logs |

---

## Handling Errors in SAP ABAP

```abap
" Pattern: check HTTP status code and parse error code
IF lo_http_client->response->get_status_code( ) <> 200.
  DATA(lv_resp) = lo_http_client->response->get_cdata( ).

  " Parse error code from JSON (simplified — use proper JSON parser in production)
  IF lv_resp CS 'SAP-CARDANO-010'.
    " Resource not found — supply chain event doesn't exist yet
    MESSAGE 'Blockchain record not found. Initialise with InitSupplyChain first.' TYPE 'W'.
  ELSEIF lv_resp CS 'SAP-CARDANO-030'.
    " Blockchain connectivity issue — retry later
    MESSAGE 'Blockchain temporarily unavailable. Retry in 30 seconds.' TYPE 'W'.
  ELSEIF lv_resp CS 'SAP-CARDANO-041'.
    " State conflict — cannot perform this action
    MESSAGE 'Operation rejected by smart contract. Check current state.' TYPE 'E'.
  ELSE.
    MESSAGE lv_resp TYPE 'E'.
  ENDIF.
ENDIF.
```

---

## Handling Errors in SAP UI5 / Fiori

```javascript
oModel.callFunction("/InitSupplyChain", {
    method: "POST",
    urlParameters: { ... },
    success: (data) => {
        MessageToast.show("Shipment recorded on Cardano. TX: " + data.txHash);
    },
    error: (oError) => {
        let oResponse;
        try {
            oResponse = JSON.parse(oError.responseText);
        } catch (e) {
            MessageBox.error("Unexpected error: " + oError.message);
            return;
        }

        const code = oResponse?.error?.code;
        switch (code) {
            case "SAP-CARDANO-002":
                MessageBox.error("Invalid wallet address. Please check the Cardano address format.");
                break;
            case "SAP-CARDANO-030":
                MessageBox.warning("Blockchain temporarily unavailable. Please try again in 30 seconds.");
                break;
            case "SAP-CARDANO-041":
                MessageBox.error("This action is not allowed in the current blockchain state: " +
                    oResponse.error.message);
                break;
            default:
                MessageBox.error("Error " + code + ": " + oResponse.error.message);
        }
    }
});
```

---

## Monitoring and Alerting

Configure SAP Alert Notification Service to alert on 503 errors:

```json
{
  "condition": {
    "propertyKey": "error.code",
    "propertyValue": "SAP-CARDANO-030",
    "operator": "EQUALS"
  },
  "action": {
    "type": "EMAIL",
    "recipients": ["blockchain-ops@company.com"],
    "subject": "Cardano API Connectivity Alert",
    "body": "Blockfrost and Koios are both unreachable. Check API keys and network connectivity."
  }
}
```
