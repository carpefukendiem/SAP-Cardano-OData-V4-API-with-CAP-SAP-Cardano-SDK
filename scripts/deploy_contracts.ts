#!/usr/bin/env tsx
/**
 * SAP–Cardano Contract Deployment Script
 *
 * Compiles all Aiken validators and outputs the contract addresses / script hashes
 * needed for each network. Used to populate CONTRACT_ADDRESSES in contract-manager.ts.
 *
 * Prerequisites:
 *   - Aiken CLI installed: https://aiken-lang.org/installation-instructions
 *   - cardano-cli installed (for address computation)
 *   - Environment variable CARDANO_NETWORK set (mainnet | preprod | preview)
 *
 * Usage:
 *   npx tsx scripts/deploy_contracts.ts [--network preprod] [--dry-run]
 *
 * What it does:
 *   1. Runs `aiken build` to compile all validators to plutus.json
 *   2. Extracts compiled script bytes (double-CBOR encoded)
 *   3. Computes the script hash (blake2b-224 of script bytes)
 *   4. Derives the enterprise address for each network
 *   5. Prints a ready-to-paste CONTRACT_ADDRESSES block for contract-manager.ts
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(join(import.meta.url.replace('file://', ''), '../../'));
const AIKEN_DIR = join(ROOT, 'aiken-contracts');
const PLUTUS_JSON = join(AIKEN_DIR, 'plutus.json');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const network = (args.find((_, i) => args[i - 1] === '--network') ?? 'preprod') as
  'mainnet' | 'preprod' | 'preview';
const dryRun = args.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd: string, cwd = ROOT): string {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { cwd, encoding: 'utf8' }).trim();
}

function checkDep(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface PlutusValidator {
  title: string;
  datum?: unknown;
  redeemer?: unknown;
  compiledCode: string;
  hash: string;
}

interface PlutusJson {
  validators: PlutusValidator[];
}

// ── Network magic numbers ─────────────────────────────────────────────────────
const NETWORK_MAGIC: Record<string, string> = {
  mainnet: '--mainnet',
  preprod: '--testnet-magic 1',
  preview: '--testnet-magic 2',
};

// ── Contract names to validator titles ────────────────────────────────────────
const CONTRACT_TITLES: Record<string, string> = {
  supply_chain_tracker: 'supply_chain_tracker.supply_chain_tracker',
  esg_compliance:       'esg_compliance.esg_compliance',
  payment_settlement:   'payment_settlement.payment_settlement',
  asset_registry:       'asset_registry.asset_registry',
  sap_oracle:           'sap_oracle.sap_oracle',
  vesting_contract:     'vesting_contract.vesting_contract',
  multi_sig_governance: 'multi_sig_governance.multi_sig_governance',
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nSAP–Cardano Contract Deployment');
  console.log(`Network : ${network}`);
  console.log(`Dry run : ${dryRun}`);
  console.log(`Root    : ${ROOT}\n`);

  // 1. Check dependencies
  console.log('Checking dependencies...');
  const hasAiken = checkDep('aiken');
  const hasCardanoCli = checkDep('cardano-cli');

  if (!hasAiken) {
    console.error('\nAiken not found. Install from: https://aiken-lang.org/installation-instructions');
    console.error('  curl -sSfL https://install.aiken-lang.org | sh\n');
    if (!dryRun) process.exit(1);
    console.log('[DRY RUN] Would exit here — continuing in dry-run mode\n');
  } else {
    console.log(`  aiken   : ${run('aiken --version')}`);
  }

  if (!hasCardanoCli) {
    console.warn('  cardano-cli not found — addresses will be shown as script hashes only');
  } else {
    console.log(`  cardano-cli: ${run('cardano-cli --version').split('\n')[0]}`);
  }

  // 2. Compile Aiken contracts
  console.log('\nCompiling Aiken validators...');
  if (!dryRun && hasAiken) {
    run('aiken build', AIKEN_DIR);
    console.log('  Build complete.');
  } else {
    console.log('  [DRY RUN / no aiken] Skipping build.');
  }

  // 3. Read plutus.json
  if (!existsSync(PLUTUS_JSON)) {
    if (dryRun) {
      console.log('\n[DRY RUN] plutus.json not found — showing example output format:\n');
      printExampleOutput(network);
      return;
    }
    console.error(`\nplutus.json not found at ${PLUTUS_JSON}`);
    console.error('Run: cd aiken-contracts && aiken build');
    process.exit(1);
  }

  const plutus = JSON.parse(readFileSync(PLUTUS_JSON, 'utf8')) as PlutusJson;
  console.log(`\nFound ${plutus.validators.length} compiled validators:`);

  const results: Record<string, { hash: string; address: string }> = {};

  for (const [contractKey, title] of Object.entries(CONTRACT_TITLES)) {
    const validator = plutus.validators.find(v => v.title === title);
    if (!validator) {
      console.warn(`  WARNING: validator '${title}' not found in plutus.json`);
      continue;
    }

    const hash = validator.hash;
    let address = `script_hash_${hash.slice(0, 8)}...`;

    if (hasCardanoCli) {
      try {
        // Write script file for cardano-cli
        const scriptFile = `/tmp/${contractKey}.plutus`;
        const scriptContent = {
          type: 'PlutusScriptV2',
          description: contractKey,
          cborHex: validator.compiledCode,
        };
        const { writeFileSync } = await import('node:fs');
        writeFileSync(scriptFile, JSON.stringify(scriptContent));

        address = run(
          `cardano-cli address build --payment-script-file ${scriptFile} ${NETWORK_MAGIC[network]}`
        );
      } catch (e) {
        address = `[address computation failed: ${(e as Error).message.slice(0, 60)}]`;
      }
    }

    results[contractKey] = { hash, address };
    console.log(`  ${contractKey}:`);
    console.log(`    Hash   : ${hash}`);
    console.log(`    Address: ${address}`);
  }

  // 4. Print ready-to-paste CONTRACT_ADDRESSES block
  console.log('\n' + '═'.repeat(70));
  console.log('Copy this block into srv/blockchain/contract-manager.ts:');
  console.log('═'.repeat(70) + '\n');
  printContractAddressesBlock(results, network);
  console.log('\n' + '═'.repeat(70));
}

function printContractAddressesBlock(
  results: Record<string, { hash: string; address: string }>,
  net: string
) {
  const indent = '  ';
  console.log(`const CONTRACT_ADDRESSES = {`);
  console.log(`${indent}${net}: {`);
  for (const [key, { address }] of Object.entries(results)) {
    console.log(`${indent}${indent}${key}: '${address}',`);
  }
  console.log(`${indent}},`);
  console.log(`};`);
}

function printExampleOutput(net: string) {
  console.log('Example output (actual hashes will differ after `aiken build`):');
  console.log('');
  printContractAddressesBlock({
    supply_chain_tracker: { hash: 'abc123...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...supply_chain` },
    esg_compliance:       { hash: 'def456...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...esg_compliance` },
    payment_settlement:   { hash: 'ghi789...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...payment_settlement` },
    asset_registry:       { hash: 'jkl012...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...asset_registry` },
    sap_oracle:           { hash: 'mno345...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...sap_oracle` },
    vesting_contract:     { hash: 'pqr678...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...vesting` },
    multi_sig_governance: { hash: 'stu901...', address: `addr${net === 'mainnet' ? '1' : '_test1'}qxxx...governance` },
  }, net);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
