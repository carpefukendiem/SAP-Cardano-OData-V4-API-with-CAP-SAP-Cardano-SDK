# SAP Integration Guide

How to connect this Cardano OData V4 API to your SAP systems.

---

## Overview

This service exposes a standard **OData V4** interface, which means it integrates natively with:

- SAP S/4HANA (via OData consumption in ABAP)
- SAP Integration Suite (API Management / Cloud Integration)
- SAP Build Apps / SAP AppGyver
- SAP Analytics Cloud
- Any SAP Fiori / UI5 frontend

The service runs on **SAP BTP (Business Technology Platform)** Cloud Foundry and uses **SAP CAP (Cloud Application Programming Model)** — so it speaks the same language as your existing SAP landscape.

---

## Deployment on SAP BTP

### 1. Prerequisites

- SAP BTP trial or paid account
- BTP CLI installed: `brew install btp` or download from [tools.hana.ondemand.com](https://tools.hana.ondemand.com)
- CF CLI: `brew install cloudfoundry/tap/cf-cli@8`
- SAP HANA Cloud instance (optional — SQLite used in development)

### 2. Login to BTP

```bash
btp login
cf login -a https://api.cf.eu10.hana.ondemand.com
```

### 3. Create required services

```bash
# XSUAA for authentication
cf create-service xsuaa application cardano-xsuaa -c '{"xsappname":"cardano-odata","tenant-mode":"dedicated"}'

# Destination service (for SAP system connections)
cf create-service destination lite cardano-destination

# SAP HANA Cloud (for production DB)
cf create-service hana hdi-shared cardano-hana
```

### 4. Set Blockfrost credentials as user-provided service

```bash
cf create-user-provided-service cardano-blockfrost -p '{"mainnet":"mainnetXXXXX","preprod":"preprodXXXXX"}'
```

### 5. Deploy

```bash
npm run build
cf push cardano-odata-api
```

The app binds all services automatically via `manifest.yml`.

---

## Authentication (XSUAA / OAuth2)

In production, the service uses **SAP XSUAA** for OAuth2 JWT authentication.

### Service scopes

| Scope | Who needs it | What it grants |
|---|---|---|
| `cardano.read` | Read-only consumers | GET requests to all entity sets |
| `cardano.write` | Trusted SAP systems | POST actions (InitSupplyChain, etc.) |
| `cardano.admin` | Platform admins | Health check, cache management |

### Getting a token (from ABAP or API Management)

```abap
" ABAP example — fetch OAuth token from XSUAA
DATA: lv_token TYPE string.

CALL METHOD cl_oauth2_client=>create_using_client_credentials
  EXPORTING
    iv_token_endpoint = 'https://YOUR-SUBDOMAIN.authentication.eu10.hana.ondemand.com/oauth/token'
    iv_client_id      = 'YOUR_CLIENT_ID'
    iv_client_secret  = 'YOUR_CLIENT_SECRET'
    iv_scope          = 'cardano.read'
  IMPORTING
    ev_access_token   = lv_token.
```

Then include `Authorization: Bearer <token>` in all API calls.

---

## Consuming from ABAP (ABAP for SAP BTP)

### Reading blockchain data

```abap
" Read a Cardano transaction from ABAP
DATA: lo_http_client TYPE REF TO if_http_client.

CALL METHOD cl_http_client=>create_by_url
  EXPORTING
    url    = 'https://cardano-odata-api.cfapps.eu10.hana.ondemand.com/odata/v4/cardano-odata/Transactions(''<tx-hash>'')'
  IMPORTING
    client = lo_http_client.

lo_http_client->request->set_header_field(
  name  = 'Authorization'
  value = |Bearer { lv_token }|
).
lo_http_client->request->set_header_field(
  name  = 'x-cardano-network'
  value = 'mainnet'
).

lo_http_client->send( ).
lo_http_client->receive( ).

DATA(lv_response) = lo_http_client->response->get_cdata( ).
```

### Initiating a supply chain event from a Purchase Order

```abap
" Triggered from a SAP purchase order (ME21N / MM01)
FORM post_to_cardano_on_po_create
  USING iv_po_number TYPE ebeln.

  " Build request body
  DATA(lv_body) = |\{ "sapDocumentId": "{ iv_po_number }", |
               & |"sapSystemId": "PRD", |
               & |"initiatorAddress": "{ gv_company_wallet_address }", |
               & |"originLocation": "DEHAM", |
               & |"destinationLocation": "SGSIN", |
               & |"network": "mainnet" \}|.

  " POST to InitSupplyChain
  " ... (same HTTP client setup as above)
  lo_http_client->request->set_cdata( lv_body ).
  lo_http_client->request->set_method( 'POST' ).

ENDFORM.
```

---

## Consuming from SAP Integration Suite (Cloud Integration)

Use a **HTTP Receiver Adapter** in your iFlow:

1. **Address**: `https://cardano-odata-api.cfapps.eu10.hana.ondemand.com`
2. **Path**: `/odata/v4/cardano-odata/InitSupplyChain`
3. **Method**: POST
4. **Authentication**: OAuth2 Client Credentials
5. **Headers**: `Content-Type: application/json`, `x-cardano-network: mainnet`

Map fields from your SAP payload using a Message Mapping or XSLT:

```xml
<!-- XSLT: Map SAP IDoc SHIPMENT → Cardano InitSupplyChain -->
<xsl:template match="/">
  <xsl:text>{</xsl:text>
  <xsl:text>"sapDocumentId": "</xsl:text>
  <xsl:value-of select="//E1EDL20/VBELN"/>
  <xsl:text>",</xsl:text>
  <xsl:text>"originLocation": "</xsl:text>
  <xsl:value-of select="//E1EDL20/ABRVW"/>
  <xsl:text>"</xsl:text>
  <xsl:text>}</xsl:text>
</xsl:template>
```

---

## OData V4 Query Examples from SAP Fiori / UI5

```javascript
// Fetch active supply chain events with $filter + $expand
const oModel = this.getOwnerComponent().getModel("cardano");
oModel.read("/SupplyChainEvents", {
    filters: [
        new Filter("status", FilterOperator.EQ, "InTransit"),
        new Filter("network", FilterOperator.EQ, "mainnet")
    ],
    expand: "checkpoints",
    sorters: [new Sorter("createdAt", true)],
    success: (data) => {
        this.getView().getModel().setProperty("/shipments", data.results);
    }
});
```

---

## Event-driven integration with SAP Event Mesh

When a transaction is confirmed on Cardano, the service can publish an event to SAP Event Mesh:

```
Cardano blockchain confirms tx
       │
       ▼
CAP AfterRead handler polls indexer
       │
       ▼
Publish event: sap.cardano.supply-chain.updated
       │
       ▼
SAP Event Mesh → trigger SAP workflow / alert
```

Configure in `srv/cardano-service.ts`:

```typescript
// After successful supply chain update
await cds.emit('sap.cardano.supply-chain.updated', {
  sapDocumentId,
  newStatus,
  txHash,
  network,
  timestamp: new Date().toISOString(),
});
```

---

## Testing the SAP connection locally

Use the SAP CAP mock server:

```bash
# Start mock server with in-memory SQLite (no Blockfrost needed)
CDS_ENV=test npm start

# Test OData from SAP Fiori preview
open http://localhost:4004/$fiori-preview
```

---

## Production checklist

- [ ] XSUAA service bound and scopes configured
- [ ] Blockfrost API keys stored as CF user-provided service (not in code)
- [ ] HANA Cloud bound (not SQLite)
- [ ] `CARDANO_NETWORK=mainnet` set in production
- [ ] Rate limiting enabled in API Management
- [ ] Alerting configured for `BlockchainConnectivityError` events
- [ ] SAP Connectivity service configured for on-premise S/4HANA integration
- [ ] Wallet/HSM addresses configured for each contract
