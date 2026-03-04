#!/usr/bin/env tsx
/**
 * SAP–Cardano OData V4 API — Request Examples
 *
 * Run individual examples:
 *   npx tsx scripts/request_examples.ts health
 *   npx tsx scripts/request_examples.ts tx <hash>
 *   npx tsx scripts/request_examples.ts supply-chain
 *   npx tsx scripts/request_examples.ts esg-issue
 *   npx tsx scripts/request_examples.ts all
 *
 * Prerequisites:
 *   1. `npm start` running in another terminal (or Docker)
 *   2. BLOCKFROST_API_KEY set in .env (optional — Koios is used as fallback)
 */

const BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:4004/odata/v4/cardano-odata';
const NETWORK  = process.env['CARDANO_NETWORK'] ?? 'preprod';

const SAMPLE_TX_HASH =
  process.env['SAMPLE_TX_HASH'] ??
  '5d677265fa5bb21ce6d8c7502aca70b9316d10e958611f3c6b758f65ad959996';

const SAMPLE_ADDRESS =
  process.env['SAMPLE_ADDRESS'] ??
  'addr_test1qpkxr3kpzex93m646qr7w82d56md2kchtsv9jy39dykn4cmcxuuneyeqhdc4wy7de9mk54fndmckahxwqtwy3qg8pums5vlxhz';

// ── Helpers ──────────────────────────────────────────────────────────────────
function header(title: string) {
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

async function get(path: string, label: string) {
  header(`GET ${path}  [${label}]`);
  const url = `${BASE_URL}${path}`;
  console.log(`URL: ${url}\n`);
  try {
    const res = await fetch(url, { headers: { 'x-cardano-network': NETWORK } });
    const data = await res.json();
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(data, null, 2).slice(0, 1200));
    if (JSON.stringify(data).length > 1200) console.log('  ... (truncated)');
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
  }
}

async function post(path: string, body: unknown, label: string) {
  header(`POST ${path}  [${label}]`);
  const url = `${BASE_URL}${path}`;
  console.log(`URL: ${url}`);
  console.log(`Body: ${JSON.stringify(body, null, 2)}\n`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cardano-network': NETWORK },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
  }
}

// ── Example runners ───────────────────────────────────────────────────────────
async function exampleHealth() {
  await get('/health', 'Service health + blockchain connectivity');
}

async function exampleMetadata() {
  await get('/$metadata', 'OData V4 service metadata document');
}

async function exampleTransaction() {
  await get(`/Transactions('${SAMPLE_TX_HASH}')`, 'Single transaction by hash');
  await get(
    `/Transactions?$top=5&$count=true&$select=txHash,block,fees,status`,
    'Paginated transaction list'
  );
}

async function exampleAddress() {
  await get(`/Addresses('${SAMPLE_ADDRESS}')`, 'Address balance + UTxO set');
}

async function exampleBlocks() {
  await get(`/Blocks('latest')`, 'Latest block (chain tip)');
  await get(`/Epochs(450)`, 'Epoch 450 stats');
}

async function exampleSupplyChain() {
  // Initiate a new shipment
  await post('/InitSupplyChain', {
    sapDocumentId: '4500000001',
    sapSystemId: 'PRD',
    initiatorAddress: SAMPLE_ADDRESS,
    originLocation: 'DEHAM',
    destinationLocation: 'SGSIN',
    network: NETWORK,
  }, 'Create supply chain UTxO (Hamburg → Singapore)');

  // List supply chain events
  await get(
    `/SupplyChainEvents?$filter=status eq 'InTransit'&$orderby=createdAt desc&$top=10`,
    'Active in-transit shipments'
  );
}

async function exampleEsgCredit() {
  // Issue a carbon credit
  await post('/IssueEsgCredit', {
    standard: 'VCS',
    vintageYear: 2023,
    quantity: 1000,
    projectId: 'VCS-12345',
    issuerAddress: SAMPLE_ADDRESS,
    sapDocumentId: '4500000002',
    network: NETWORK,
  }, 'Issue 1,000 VCS carbon credits (2023 vintage)');

  // List active ESG credits
  await get(
    `/EsgCredits?$filter=status eq 'active' and standard eq 'VCS'&$count=true`,
    'Active VCS credits'
  );

  // Retire carbon credits
  await post('/RetireEsgCredit', {
    txHash: SAMPLE_TX_HASH,
    retirementBeneficiary: 'ACME Corp — 2023 Net Zero Commitment',
    retiredByAddress: SAMPLE_ADDRESS,
    network: NETWORK,
  }, 'Retire carbon credits (permanent burn)');
}

async function examplePaymentSettlement() {
  const sellerAddress = 'addr_test1qzjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj';

  // Create escrow settlement
  await post('/CreateSettlement', {
    sapDocumentId: '5000000001',
    buyerAddress: SAMPLE_ADDRESS,
    sellerAddress,
    totalAmountLovelace: '50000000', // 50 ADA
    network: NETWORK,
  }, 'Create escrow settlement (50 ADA)');

  // Approve settlement
  await post('/ApproveSettlement', {
    txHash: SAMPLE_TX_HASH,
    approverAddress: SAMPLE_ADDRESS,
    network: NETWORK,
  }, 'Buyer approves settlement');

  // Execute settlement
  await post('/ExecuteSettlement', {
    txHash: SAMPLE_TX_HASH,
    executorAddress: SAMPLE_ADDRESS,
    network: NETWORK,
  }, 'Execute settlement (release funds to seller)');
}

async function exampleAssetRegistry() {
  await post('/RegisterAsset', {
    assetName: 'Industrial Pump XYZ-500',
    sapAssetId: 'A-000001',
    ownerAddress: SAMPLE_ADDRESS,
    metadata: {
      manufacturer: 'ACME',
      serialNumber: 'SN-12345',
      purchaseDate: '2023-01-15',
      location: 'Plant A, Hall 3',
    },
    network: NETWORK,
  }, 'Register physical SAP asset on-chain');

  await get(
    `/AssetRegistry?$filter=status eq 'Active'&$top=10`,
    'Active registered assets'
  );
}

async function exampleOracle() {
  await post('/PostOracleValue', {
    dataKey: 'EUR_USD_RATE',
    value: '108542',       // 1.08542 (scaled ×100000)
    validForSeconds: 3600, // 1 hour validity
    oracleAddress: SAMPLE_ADDRESS,
    sapSystemId: 'PRD',
    network: NETWORK,
  }, 'Post EUR/USD rate from SAP to Cardano oracle');

  await get(`/OracleData?$filter=dataKey eq 'EUR_USD_RATE'&$orderby=postedAt desc&$top=1`,
    'Latest EUR/USD oracle value');
}

async function exampleODataFilters() {
  header('OData Query Options showcase');

  // $filter + $orderby + $top + $skip
  await get(
    `/EsgCredits?$filter=vintageYear ge 2022 and status eq 'active'&$orderby=quantity desc&$top=3&$skip=0&$count=true`,
    '$filter + $orderby + $top + $skip + $count'
  );

  // $select — return only specific fields
  await get(
    `/Transactions?$top=5&$select=txHash,block,fees`,
    '$select — sparse fieldset'
  );

  // $expand — inline navigation property
  await get(
    `/SupplyChainEvents?$top=3&$expand=checkpoints`,
    '$expand — inline checkpoints'
  );
}

async function exampleErrors() {
  header('Error scenario demonstrations');

  // 400 — Bad request
  await get(`/Transactions('not-a-valid-hash')`, '400 — invalid tx hash format');

  // 404 — Not found
  await get(
    `/Transactions('0000000000000000000000000000000000000000000000000000000000000000')`,
    '404 — tx not found on chain'
  );

  // 422 — Contract validation error
  await post('/IssueEsgCredit', {
    standard: 'VCS',
    vintageYear: 1850, // ← invalid: before 1990
    quantity: 1000,
    projectId: 'VCS-BAD',
    issuerAddress: SAMPLE_ADDRESS,
    sapDocumentId: '4500000099',
    network: NETWORK,
  }, '422 — vintage year out of range');
}

// ── Main dispatcher ───────────────────────────────────────────────────────────
const EXAMPLES: Record<string, () => Promise<void>> = {
  health:      exampleHealth,
  metadata:    exampleMetadata,
  tx:          exampleTransaction,
  address:     exampleAddress,
  blocks:      exampleBlocks,
  'supply-chain': exampleSupplyChain,
  'esg-issue': exampleEsgCredit,
  settlement:  examplePaymentSettlement,
  asset:       exampleAssetRegistry,
  oracle:      exampleOracle,
  filters:     exampleODataFilters,
  errors:      exampleErrors,
};

async function main() {
  const arg = process.argv[2] ?? 'all';

  console.log(`\nSAP–Cardano OData V4 API — Request Examples`);
  console.log(`Network : ${NETWORK}`);
  console.log(`Base URL: ${BASE_URL}`);

  if (arg === 'all') {
    for (const [, fn] of Object.entries(EXAMPLES)) {
      await fn();
    }
  } else if (EXAMPLES[arg]) {
    await EXAMPLES[arg]();
  } else {
    console.error(`\nUnknown example: ${arg}`);
    console.log(`Available: ${Object.keys(EXAMPLES).join(', ')}, all`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
