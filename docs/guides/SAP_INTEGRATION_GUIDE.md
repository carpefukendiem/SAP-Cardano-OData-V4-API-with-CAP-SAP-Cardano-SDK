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

## Real-World Integration Scenarios

### Scenario A: Auto-record a Delivery on Cardano when a GR is posted in SAP (MM)

When a goods receipt (GR) is posted in SAP (transaction MIGO), a user-exit or BAdI fires a background job that calls the Cardano OData service to record the event on-chain.

```
SAP S/4HANA
 └── User posts GR (MIGO / MIGO_GR)
       └── BAdI: MB_MIGO_BADI → AfterSave
             └── RFC → SAP Integration Suite iFlow
                   └── POST /InitSupplyChain  →  Cardano blockchain
```

**What the auditor sees**: Every goods receipt has an immutable timestamp and location on Cardano. The blockchain record can be verified independently — no need to trust your SAP system.

---

### Scenario B: Trigger Carbon Credit Issuance from SAP CO Cost Center Settlement

When a period-end cost center settlement completes, the ESG module issues carbon credits proportional to emissions data stored in SAP CO.

```
SAP S/4HANA CO
 └── Period-end settlement (KSU5 / F.5D)
       └── Custom enhancement: read emission factor from CO-PA
             └── POST /IssueEsgCredit → Cardano blockchain
                   └── Credit linked to SAP WBS element / cost center
```

---

### Scenario C: Block Invoice Release Until Blockchain Delivery Confirmed

Before the accounts payable team releases an invoice for payment, a custom Fiori app checks the Cardano supply chain record. Payment is only released when the delivery status is `Received` on-chain.

```
SAP Fiori — Approve Invoice app
 └── Custom check: GET /SupplyChainEvents(sapDocumentId='4500000001')
       └── If status != 'Received' → show warning, block approval button
       └── If status == 'Received' → show blockchain TX link, allow approval
```

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
cf create-service xsuaa application cardano-xsuaa \
  -c '{"xsappname":"cardano-odata","tenant-mode":"dedicated"}'

# Destination service (for SAP system connections)
cf create-service destination lite cardano-destination

# SAP HANA Cloud (for production DB)
cf create-service hana hdi-shared cardano-hana
```

### 4. Set Blockfrost credentials as user-provided service

```bash
cf create-user-provided-service cardano-blockfrost \
  -p '{"mainnet":"mainnetXXXXX","preview":"previewXXXXX"}'
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

### Example 1: Read a Cardano transaction from ABAP

```abap
DATA: lo_http_client TYPE REF TO if_http_client.

CALL METHOD cl_http_client=>create_by_url
  EXPORTING
    url    = 'https://cardano-odata-api.cfapps.eu10.hana.ondemand.com/odata/v4/cardano-odata/Transactions(''5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996'')'
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
" lv_response now contains the full JSON of the transaction
```

### Example 2: Initiate a supply chain event from a Purchase Order (ME21N)

```abap
" Triggered from a SAP purchase order BAdI (ME_PROCESS_PO_CUST)
FORM post_to_cardano_on_po_create
  USING iv_po_number TYPE ebeln.

  " Fetch PO header data
  SELECT SINGLE lifnr bukrs FROM ekko
    INTO @DATA(ls_po_header)
    WHERE ebeln = @iv_po_number.

  " Build JSON body
  DATA(lv_body) = |\{ |
               & |"sapDocumentId": "{ iv_po_number }", |
               & |"sapSystemId": "PRD", |
               & |"initiatorAddress": "{ gv_company_wallet_address }", |
               & |"originLocation": "DEHAM", |
               & |"destinationLocation": "SGSIN", |
               & |"network": "mainnet" \}|.

  " POST to InitSupplyChain
  CALL METHOD cl_http_client=>create_by_url
    EXPORTING
      url    = 'https://cardano-odata-api.cfapps.eu10.hana.ondemand.com/odata/v4/cardano-odata/InitSupplyChain'
    IMPORTING
      client = lo_http_client.

  lo_http_client->request->set_method( 'POST' ).
  lo_http_client->request->set_header_field( name = 'Content-Type' value = 'application/json' ).
  lo_http_client->request->set_header_field( name = 'Authorization' value = |Bearer { lv_token }| ).
  lo_http_client->request->set_cdata( lv_body ).
  lo_http_client->send( ).
  lo_http_client->receive( ).

ENDFORM.
```

### Example 3: Check blockchain delivery status before releasing an invoice (FI-AP)

```abap
" Called from invoice approval workflow (custom Workflow step)
FUNCTION check_cardano_delivery_status.
  *"-------------------------------------------------------------------
  *"  IMPORTING: iv_po_number TYPE ebeln
  *"  RETURNING: rv_blockchain_confirmed TYPE abap_bool
  *"-------------------------------------------------------------------

  " Call Cardano OData
  DATA(lv_url) = |https://cardano-odata-api.cfapps.eu10.hana.ondemand.com| &&
                 |/odata/v4/cardano-odata/SupplyChainEvents(sapDocumentId='{ iv_po_number }')|.

  " ... (HTTP call as above)

  " Parse JSON — check status field
  DATA(lo_json_parser) = NEW cl_sxml_string_reader( lo_http_client->response->get_data( ) ).
  " ... navigate to /value/status ...

  " Return whether blockchain confirms delivery
  rv_blockchain_confirmed = COND #( WHEN lv_status = 'Received' THEN abap_true ELSE abap_false ).

ENDFUNCTION.
```

### Example 4: Retire carbon credits from CO-PA period-end processing

```abap
" Called from period-end batch job (report ZCARBON_RETIREMENT)
FORM retire_carbon_credits_for_period
  USING iv_period    TYPE monat
        iv_year      TYPE gjahr
        iv_cost_ctr  TYPE kostl.

  " Fetch credit IDs associated with this cost center from our custom Z-table
  SELECT credit_id FROM zblockchain_credits
    INTO TABLE @DATA(lt_credits)
    WHERE cost_center = @iv_cost_ctr
      AND is_retired = @abap_false
      AND period = @iv_period
      AND fiscal_year = @iv_year.

  LOOP AT lt_credits INTO DATA(ls_credit).

    DATA(lv_body) = |\{ |
                 & |"creditId": "{ ls_credit-credit_id }", |
                 & |"reason": "Period-end retirement — Cost center { iv_cost_ctr }, |
                 & |Period { iv_period }/{ iv_year } — CDP Report { gv_cdp_ref }", |
                 & |"sapDocument": "{ lv_co_document }", |
                 & |"network": "mainnet" \}|.

    " POST to RetireEsgCredit ...
    " Update Z-table after successful response

  ENDLOOP.

ENDFORM.
```

---

## Consuming from SAP Integration Suite (Cloud Integration)

### iFlow: SAP Shipment → Cardano Supply Chain

Use a **HTTP Receiver Adapter** in your iFlow:

1. **Address**: `https://cardano-odata-api.cfapps.eu10.hana.ondemand.com`
2. **Path**: `/odata/v4/cardano-odata/InitSupplyChain`
3. **Method**: POST
4. **Authentication**: OAuth2 Client Credentials
5. **Headers**: `Content-Type: application/json`, `x-cardano-network: mainnet`

Map fields from your SAP payload using a Message Mapping or XSLT:

```xml
<!-- XSLT: Map SAP IDoc DELVRY03 (Outbound Delivery) → Cardano InitSupplyChain -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text" encoding="UTF-8"/>
  <xsl:template match="/">
    <xsl:text>{</xsl:text>
    <xsl:text>"sapDocumentId": "</xsl:text><xsl:value-of select="//E1EDL20/VBELN"/><xsl:text>",</xsl:text>
    <xsl:text>"sapSystemId": "</xsl:text><xsl:value-of select="//EDI_DC40/SNDLGD"/><xsl:text>",</xsl:text>
    <xsl:text>"productCode": "</xsl:text><xsl:value-of select="//E1EDL24/MATNR"/><xsl:text>",</xsl:text>
    <xsl:text>"quantity": </xsl:text><xsl:value-of select="//E1EDL24/LFIMG"/><xsl:text>,</xsl:text>
    <xsl:text>"unitOfMeasure": "</xsl:text><xsl:value-of select="//E1EDL24/VRKME"/><xsl:text>",</xsl:text>
    <xsl:text>"originAddress": "addr1mainnet_warehouse_address_here",</xsl:text>
    <xsl:text>"destAddress": "addr1mainnet_customer_address_here",</xtml:text>
    <xsl:text>"network": "mainnet"</xsl:text>
    <xsl:text>}</xsl:text>
  </xsl:template>
</xsl:stylesheet>
```

### iFlow: SAP FI Invoice → Cardano Settlement Approval

```xml
<!-- Map SAP Invoice IDoc FIDCCP02 → Cardano ApproveSettlement -->
<xsl:template match="/">
  <xsl:text>{"settlementId": "SET-PRD-</xsl:text>
  <xsl:value-of select="//E1FIKPF/BELNR"/>
  <xsl:text>", "signerPubKey": "</xsl:text>
  <xsl:value-of select="//E1FIKPF/USNAM"/>
  <xsl:text>", "network": "mainnet"}</xsl:text>
</xsl:template>
```

### iFlow: Real-time supply chain checkpoint from SAP EWM

When SAP Extended Warehouse Management confirms a transfer order (TO), trigger a Cardano status update:

```xml
<!-- Map SAP WM TO confirmation → Cardano UpdateSupplyChainStatus -->
<xsl:template match="/">
  <xsl:text>{</xsl:text>
  <xsl:text>"sapDocumentId": "</xsl:text><xsl:value-of select="//TANUM"/><xsl:text>",</xsl:text>
  <xsl:text>"newStatus": "InTransit",</xsl:text>
  <xsl:text>"locationCode": "</xsl:text><xsl:value-of select="//LGPLA"/><xsl:text>",</xsl:text>
  <xsl:text>"locationName": "SAP WM Location </xsl:text><xsl:value-of select="//LGPLA"/><xsl:text>",</xsl:text>
  <xsl:text>"handlerPubKey": "ed25519_pk1system_key...",</xsl:text>
  <xsl:text>"network": "mainnet"</xsl:text>
  <xsl:text>}</xsl:text>
</xsl:template>
```

---

## OData V4 Query Examples from SAP Fiori / UI5

### Example 1: Track active shipments on a live map

```javascript
// Fetch all in-transit shipments with GPS checkpoints for a map view
const oModel = this.getOwnerComponent().getModel("cardano");
oModel.read("/SupplyChainEvents", {
    filters: [
        new Filter("status", FilterOperator.EQ, "InTransit"),
        new Filter("network", FilterOperator.EQ, "mainnet")
    ],
    urlParameters: {
        "$expand": "checkpoints($orderby=timestamp desc;$top=1)",
        "$select": "sapDocumentId,productCode,status,quantity,unitOfMeasure",
        "$top": "100"
    },
    success: (data) => {
        // data.results contains shipments with last known GPS position
        this._updateMapMarkers(data.results);
    }
});
```

### Example 2: Carbon credit dashboard (SAP Analytics Cloud data source)

```javascript
// Fetch all non-retired VCS credits grouped by vintage year
oModel.read("/EsgCredits", {
    filters: [
        new Filter("creditType", FilterOperator.EQ, "CarbonCredit"),
        new Filter("isRetired", FilterOperator.EQ, false),
        new Filter("verificationStandard", FilterOperator.EQ, "VCS")
    ],
    urlParameters: {
        "$select": "creditId,amount,unit,vintageYear,sapCostCenter,countryCode",
        "$orderby": "vintageYear asc"
    },
    success: (data) => {
        // Group by vintageYear for a chart
        const byYear = data.results.reduce((acc, c) => {
            acc[c.vintageYear] = (acc[c.vintageYear] || 0) + c.amount;
            return acc;
        }, {});
        this.getView().getModel("view").setProperty("/creditsByYear", byYear);
    }
});
```

### Example 3: Invoice payment status check (FI-AP Fiori app)

```javascript
// Before releasing an invoice for payment, check blockchain delivery status
onApproveInvoice: async function(oEvent) {
    const sPoNumber = oEvent.getSource().getBindingContext().getProperty("PurchaseOrder");

    await new Promise((resolve, reject) => {
        oModel.read(`/SupplyChainEvents(sapDocumentId='${sPoNumber}')`, {
            success: (data) => {
                if (data.status !== "Received") {
                    MessageBox.warning(
                        `Blockchain delivery not yet confirmed (current: ${data.status}). ` +
                        `TX: ${data.latestTxHash}`
                    );
                    reject("Not delivered on-chain");
                } else {
                    resolve(data);
                }
            },
            error: reject
        });
    });

    // Proceed with standard FI invoice approval
    this._releaseInvoice(sPoNumber);
},
```

### Example 4: Settlement status monitor (multi-party payment dashboard)

```javascript
// Poll all pending settlements and show approval counts
oModel.read("/PaymentSettlements", {
    filters: [new Filter("status", FilterOperator.EQ, "Pending")],
    urlParameters: {
        "$expand": "parties",
        "$select": "settlementId,sapInvoiceId,deadline,totalAmount",
        "$orderby": "deadline asc"
    },
    success: (data) => {
        const enriched = data.results.map(s => ({
            ...s,
            approvalCount: s.parties.filter(p => p.hasApproved).length,
            totalParties: s.parties.length,
            isOverdue: new Date(s.deadline) < new Date()
        }));
        this.getView().getModel().setProperty("/settlements", enriched);
    }
});
```

### Example 5: Asset registry for plant maintenance (SAP PM)

```javascript
// Show all active assets at a plant with their SAP asset numbers
oModel.read("/AssetRegistry", {
    filters: [
        new Filter("sapPlant", FilterOperator.EQ, "1000"),
        new Filter("state", FilterOperator.EQ, "Active")
    ],
    urlParameters: {
        "$select": "assetId,sapAssetNumber,sapMaterialNumber,quantity,createdAt",
        "$orderby": "sapAssetNumber asc"
    },
    success: (data) => {
        this.getView().getModel().setProperty("/assets", data.results);
    }
});
```

---

## Consuming from SAP Analytics Cloud

SAP Analytics Cloud (SAC) can connect to OData V4 services directly as a live data connection.

### Setup

1. In SAC, go to **System → Administration → App Integration**
2. Add a new **OData Service** connection:
   - URL: `https://cardano-odata-api.cfapps.eu10.hana.ondemand.com/odata/v4/cardano-odata`
   - Authentication: **OAuth2 / XSUAA**
3. In a new story, create a data model from the connection
4. Use entity sets as data sources: `EsgCredits`, `SupplyChainEvents`, `PaymentSettlements`

### Example SAC Live Data Query: ESG Dashboard

```
Entity: EsgCredits
Dimensions: creditType, vintageYear, countryCode, verificationStandard
Measures: SUM(amount)
Filters: isRetired = false
```

This produces a chart showing total active carbon inventory by type, country, and vintage year — updated in real time from the blockchain.

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

### Real-world event mesh use cases

| Event | Trigger | SAP Consumer |
|---|---|---|
| `sap.cardano.supply-chain.updated` | Shipment status changes on-chain | SAP Workflow — notify buyer |
| `sap.cardano.esg.credit-retired` | Carbon credit burned | SAP CO — update emissions ledger |
| `sap.cardano.settlement.executed` | Escrow payment released | SAP FI — post automatic clearing |
| `sap.cardano.asset.transferred` | Asset ownership changes | SAP AM — update fixed asset ledger |
| `sap.cardano.oracle.posted` | New exchange rate published | SAP TRM — update currency positions |

---

## SAP Connectivity Service: On-Premise S/4HANA Integration

For on-premise SAP systems, use the **SAP Connectivity Service** and **Cloud Connector**:

```
On-Premise S/4HANA
       │  (RFC / HTTP over Cloud Connector)
       ▼
SAP Cloud Connector  ←→  SAP BTP Connectivity Service
                               │
                               ▼
                    Cardano OData API (BTP CF)
                               │
                               ▼
                       Cardano Blockchain
```

### Configure Cloud Connector mapping

```
Backend System: https://s4hana.internal.company.com:8443
Virtual Host:   s4hana-internal:443
Resources:      /sap/opu/odata/  (accessible)
```

### Configure Destination on BTP

```bash
# Create destination pointing to on-premise S/4HANA
cf create-user-provided-service s4hana-onprem \
  '{
    "url": "https://s4hana-internal:443",
    "type": "HTTP",
    "authentication": "BasicAuthentication",
    "user": "RFC_USER",
    "password": "PASSWORD",
    "ProxyType": "OnPremise",
    "CloudConnectorLocationId": "HQ-DC"
  }'
```

---

## Testing the SAP connection locally

Use the SAP CAP mock server:

```bash
# Start mock server with in-memory SQLite (no Blockfrost needed)
CDS_ENV=test npm start

# Test OData from SAP Fiori preview
open http://localhost:4004/$fiori-preview

# Test the full entity set list
curl http://localhost:4004/odata/v4/cardano-odata/ | python3 -m json.tool

# Verify $metadata is valid OData V4
curl http://localhost:4004/odata/v4/cardano-odata/\$metadata | head -20
```

### Postman collection (ready-to-import)

The file `scripts/CARDANO_SAP_API.postman_collection.json` contains pre-built requests for every action and entity set. Import it into Postman:

1. Open Postman → **Import** → choose the JSON file
2. Set the `baseUrl` environment variable to `http://localhost:4004/odata/v4/cardano-odata`
3. Set `network` to `preview`
4. Run the **"Health Check"** request first to verify connectivity
5. Try the **"Supply Chain — Full Journey"** folder for a complete end-to-end demo

### End-to-end test script

Run all demo scenarios automatically:

```bash
# Run every example request in sequence
npx tsx scripts/request_examples.ts all

# Run only supply chain scenarios
npx tsx scripts/request_examples.ts supply-chain

# Run only ESG scenarios
npx tsx scripts/request_examples.ts esg
```

---

## Production checklist

- [ ] XSUAA service bound and scopes configured (`cardano.read`, `cardano.write`, `cardano.admin`)
- [ ] Blockfrost API keys stored as CF user-provided service (not in source code or `.env`)
- [ ] HANA Cloud bound (not SQLite)
- [ ] `CARDANO_NETWORK=mainnet` set in production environment
- [ ] Rate limiting enabled in API Management (recommended: 100 req/min per client)
- [ ] Alerting configured for `BlockchainConnectivityError` events in SAP Alert Notification
- [ ] SAP Connectivity service configured for on-premise S/4HANA integration
- [ ] Wallet / HSM addresses configured for each smart contract
- [ ] Event Mesh topics configured for async downstream consumers
- [ ] Custom Z-tables or CDS views created to sync blockchain state back into SAP
- [ ] SAP Analytics Cloud live connection tested end-to-end
- [ ] Postman smoke tests run against production URL after deployment
