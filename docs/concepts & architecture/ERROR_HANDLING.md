# Error Handling Strategy

## Overview

All errors in the SAP-Cardano OData service follow the OData 4.0 error format and map to standardized HTTP status codes.

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

## The 5 Required Error Scenarios

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

**Triggers**: Invalid address, transaction hash, network, SAP doc ID, SAP SID, CBOR hex

### 2. Data not found → HTTP 404

```json
{
  "error": {
    "code": "SAP-CARDANO-010",
    "message": "Transaction not found: aaaa...bbbb",
    "innererror": {
      "details": { "resource": "Transaction", "identifier": "aaaa...bbbb" }
    }
  }
}
```

### 3. Cardano API connectivity failure → HTTP 503

```json
{
  "error": {
    "code": "SAP-CARDANO-030",
    "message": "Cardano provider 'blockfrost' unavailable: connection refused. Please retry later.",
    "innererror": {
      "details": { "provider": "blockfrost" }
    }
  }
}
```

**Failover flow**: Blockfrost fails → automatically retry with Koios → if both fail, return `AllProvidersFailedError`.

### 4. Unauthorized access → HTTP 401/403

```json
{
  "error": {
    "code": "SAP-CARDANO-020",
    "message": "Authentication required"
  }
}
```

Production: XSUAA (SAP BTP OAuth2) enforces role-based access.

### 5. Internal server error → HTTP 500

```json
{
  "error": {
    "code": "SAP-CARDANO-050",
    "message": "An unexpected internal error occurred"
  }
}
```

Generic message — no internal details exposed. Full error logged server-side.

## Error Code Reference

| Code | HTTP | Description |
|------|------|-------------|
| SAP-CARDANO-001 | 400 | Generic validation error |
| SAP-CARDANO-002 | 400 | Invalid Cardano address |
| SAP-CARDANO-003 | 400 | Invalid transaction hash |
| SAP-CARDANO-004 | 400 | Invalid network identifier |
| SAP-CARDANO-010 | 404 | Resource not found |
| SAP-CARDANO-020 | 401 | Unauthorized |
| SAP-CARDANO-021 | 403 | Forbidden |
| SAP-CARDANO-030 | 503 | Blockchain provider unavailable |
| SAP-CARDANO-031 | 504 | Request timeout |
| SAP-CARDANO-040 | 400 | Contract validation error |
| SAP-CARDANO-041 | 409 | Contract state conflict |
| SAP-CARDANO-050 | 500 | Internal server error |
