# Quick Start Guide

**No blockchain experience required.** This guide gets you from zero to a running demo in about 15 minutes.

---

## What Is This?

This project is a **bridge between SAP (the world's most-used business software) and Cardano (a blockchain)**.

Think of it like this:

> SAP manages your company's purchase orders, shipments, and payments.
> Cardano is a tamper-proof public ledger — like a notary that everyone can verify.
> **This bridge lets SAP automatically record important events on Cardano**, giving you an unforgeable audit trail.

### Real examples of what it does

| Situation | What happens |
|---|---|
| Shipment leaves Hamburg for Singapore | SAP records the event on Cardano — location, timestamp, cargo ID |
| Carbon credit is issued | A verifiable token is minted on Cardano, linked to the SAP purchase order |
| Payment is released | Funds only move when both buyer and seller approve — enforced by code, not trust |
| An asset is registered | Ownership history is permanently recorded, anyone can verify |

---

## Prerequisites

You need three things installed:

1. **Node.js** (version 18 or later)
   Check: `node --version`
   Install: https://nodejs.org

2. **Git**
   Check: `git --version`
   Install: https://git-scm.com

3. **A Blockfrost API key** (free) — this is what connects to the Cardano blockchain
   Sign up at: https://blockfrost.io
   Click "Add project" → choose "Cardano preprod" (the test network, safe to experiment)
   Copy the key that starts with `preprod...`

That's it. You do **not** need to understand blockchain to run this.

---

## Step 1 — Get the code

```bash
git clone https://github.com/carpefukendiem/SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK.git
cd SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK
```

---

## Step 2 — Install dependencies

```bash
npm install
```

This downloads all the software libraries the project needs. It takes 1–2 minutes.

---

## Step 3 — Configure your API key

Create a file called `.env` in the project root:

```bash
# On Mac/Linux:
cp .env.example .env

# On Windows:
copy .env.example .env
```

Open `.env` in any text editor and set your Blockfrost key:

```
BLOCKFROST_API_KEY_PREPROD=preprodYOURKEYHERE
CARDANO_NETWORK=preprod
```

> **What is "preprod"?** The Cardano Pre-Production network is a test environment. It works exactly like the real Cardano network but uses test ADA that has no real value. Perfect for trying things out safely.

---

## Step 4 — Run the tests (optional but recommended)

```bash
npm test
```

You should see something like:

```
Test Suites: 10 passed, 10 total
Tests:       263 passed, 263 total
```

If all tests pass, everything is set up correctly.

---

## Step 5 — Start the service

```bash
npm start
```

You'll see output like:

```
[cds] - serving CardanoODataService at /odata/v4/cardano-odata
[cds] - server listening on { url: 'http://localhost:4004' }
```

**The service is now running!** Leave this terminal open.

---

## Step 6 — Try it out

Open a **new terminal** and run:

```bash
# Check the service is healthy
curl http://localhost:4004/odata/v4/cardano-odata/health
```

You should get a JSON response showing the service status and blockchain connectivity.

Try fetching blockchain data:

```bash
# Get the latest Cardano block
curl "http://localhost:4004/odata/v4/cardano-odata/Blocks('latest')" \
  -H "x-cardano-network: preprod"
```

---

## Step 7 — Open the interactive API explorer

Open your browser and go to:

```
http://localhost:4004/odata/v4/cardano-odata/$metadata
```

This shows all the data types and actions the API supports.

For a nicer view, import the Postman collection:

1. Download and install [Postman](https://www.postman.com/downloads/)
2. Click "Import" → choose `scripts/CARDANO_SAP_API.postman_collection.json`
3. Set the `baseUrl` variable to `http://localhost:4004/odata/v4/cardano-odata`
4. Try any of the pre-built requests

---

## What's running under the hood?

```
Your Browser / Postman / SAP System
         │
         ▼  (HTTP / OData V4)
┌─────────────────────────┐
│   SAP CAP Service       │  ← This is what you just started
│   Port 4004             │
└─────────────────────────┘
         │
         ▼  (REST API)
┌─────────────────────────┐
│   Blockfrost API        │  ← Connects to real Cardano nodes
│   (or Koios fallback)   │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Cardano Blockchain    │  ← The public, tamper-proof ledger
└─────────────────────────┘
```

---

## Common questions

**Q: Do I need any ADA (Cardano tokens) to use this?**
A: No, for reading data from the blockchain. For submitting transactions (creating UTxOs), you'd need preprod test ADA — available free from the [Cardano faucet](https://docs.cardano.org/cardano-testnet/tools/faucet).

**Q: Is this safe to experiment with?**
A: Yes. The `preprod` network is entirely separate from mainnet. Nothing you do here affects real money.

**Q: What's a "UTxO"?**
A: An Unspent Transaction Output — think of it as a digital "coin" that can only be spent once. Our smart contracts lock data inside UTxOs; you prove you're authorised to change them before the blockchain accepts the transaction.

**Q: Can I use this with a real SAP system?**
A: Yes — see the [SAP Integration Guide](guides/SAP_INTEGRATION_GUIDE.md) for connecting to SAP BTP, setting up XSUAA authentication, and using the OData service from ABAP or SAP Integration Suite.

---

## Next steps

- **Run the demo scenarios**: `npx tsx scripts/request_examples.ts all`
- **Read how smart contracts work**: [AIKEN_CONTRACTS.md](concepts%20%26%20architecture/AIKEN_CONTRACTS.md)
- **Deploy to production**: [DOCKER_DEPLOYMENT.md](guides/DOCKER_DEPLOYMENT.md)
- **Connect to a real SAP system**: [SAP_INTEGRATION_GUIDE.md](guides/SAP_INTEGRATION_GUIDE.md)
