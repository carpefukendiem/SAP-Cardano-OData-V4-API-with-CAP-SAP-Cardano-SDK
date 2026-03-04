# User Guide — SAP Cardano OData V4 API

## Before You Start

You need **one free API key** from Blockfrost. This is what connects the app to the Cardano blockchain.

---

## Step 1 — Get Your Free Blockfrost API Key

1. Go to **https://blockfrost.io** and create a free account
2. After logging in, click **"+ New project"**
3. Name it anything (e.g. `my-cardano-project`)
4. For **Network**, choose **"Cardano Preprod"** (this is the safe testing network — no real money)
5. Click **Create project**
6. Copy the **Project ID** — it looks like: `preprodABCDEF1234567890abcdef1234567890`

> **What is Preprod?** It's a test version of Cardano. You can do everything the real network does, but with fake ADA. Perfect for development.

---

## Step 2 — Download the Code

Open Terminal and run:

```bash
git clone https://github.com/carpefukendiem/SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK.git
cd SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK
git pull origin claude/cardano-blockchain-solution-t4wNO
```

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
BLOCKFROST_API_KEY_PREPROD=preprodYOURKEYHERE
```

**Delete** `preprodYOURKEYHERE` and **paste your Project ID** from Step 1. It should look like:

```
BLOCKFROST_API_KEY_PREPROD=preprodABCDEF1234567890abcdef1234567890
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

### Look Up a Cardano Transaction

```
GET http://localhost:4004/odata/v4/cardano-odata/Transactions('<64-char-tx-hash>')?network=preprod
```

### Check an Address Balance

```
GET http://localhost:4004/odata/v4/cardano-odata/Addresses('<cardano-address>')?network=preprod
```

### Check Network Status

```
GET http://localhost:4004/odata/v4/cardano-odata/NetworkInformation('preprod')
```

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

## Troubleshooting

| Problem | Fix |
|---|---|
| `cp: .env.example: No such file or directory` | Run `git pull origin claude/cardano-blockchain-solution-t4wNO` first |
| `npm: command not found` | Install Node.js from https://nodejs.org (choose the LTS version) |
| `401 Unauthorized` from blockchain calls | Your Blockfrost key is wrong — double-check Step 1 and 3 |
| Port 4004 already in use | Run `lsof -ti:4004 | xargs kill` to free the port |
| TextEdit opens in rich text mode | In TextEdit go to Format → Make Plain Text before editing |

---

## Known Limitations

- Transaction building uses mock CBOR in this version. Use `cardano-serialization-lib` or `lucid-cardano` for production signing.
- Aiken smart contracts require deployment on Cardano testnet for end-to-end testing.
- Authentication is disabled in development mode. In production, XSUAA is injected automatically via SAP BTP.
