// Response mappers — normalise raw Blockfrost/Koios API responses
// into the canonical internal data model used by the OData service

/** Safely convert an unknown value to BigInt, defaulting to 0n */
function toBigInt(val: unknown, fallback = '0'): bigint {
  return BigInt((val as string | number) ?? fallback);
}

import {
  CardanoAccount,
  CardanoAddressInfo,
  CardanoAsset,
  CardanoBlock,
  CardanoEpoch,
  CardanoNetwork,
  CardanoNetworkInfo,
  CardanoTransaction,
  CardanoTxInput,
  CardanoTxMetadata,
  CardanoTxOutput,
} from './types';

// ============================================================
// BLOCKFROST MAPPERS
// ============================================================

export function mapBlockfrostTx(raw: Record<string, unknown>, network: CardanoNetwork): CardanoTransaction {
  const inputs = (raw.inputs as Record<string, unknown>[]) ?? [];
  const outputs = (raw.outputs as Record<string, unknown>[]) ?? [];

  return {
    txHash: raw.hash as string,
    blockHash: raw.block as string,
    blockHeight: raw.block_height as number,
    blockTime: new Date((raw.block_time as number) * 1000),
    slot: raw.slot as number,
    fees: toBigInt(raw.fees),
    totalInput: toBigInt((raw.output_amount as Array<{unit:string;quantity:string}>)?.[0]?.quantity),
    totalOutput: toBigInt((raw.output_amount as Array<{unit:string;quantity:string}>)?.[0]?.quantity),
    size: raw.size as number,
    confirmations: (raw.confirmations as number) ?? 0,
    isValid: (raw.valid_contract as boolean) ?? true,
    inputs: inputs.map(mapBlockfrostTxInput),
    outputs: outputs.map(mapBlockfrostTxOutput),
    metadata: [], // fetched separately
  };
}

function mapBlockfrostTxInput(raw: Record<string, unknown>): CardanoTxInput {
  return {
    txHash: raw.tx_hash as string,
    outputIndex: raw.output_index as number,
    address: raw.address as string,
    lovelace: BigInt(
      (raw.amount as Array<{ unit: string; quantity: string }>)
        ?.find((a) => a.unit === 'lovelace')
        ?.quantity ?? '0'
    ),
    assets: mapBlockfrostAssets(
      (raw.amount as Array<{ unit: string; quantity: string }>)?.filter(
        (a) => a.unit !== 'lovelace'
      ) ?? []
    ),
  };
}

function mapBlockfrostTxOutput(raw: Record<string, unknown>): CardanoTxOutput {
  return {
    outputIndex: raw.output_index as number,
    address: raw.address as string,
    lovelace: BigInt(
      (raw.amount as Array<{ unit: string; quantity: string }>)
        ?.find((a) => a.unit === 'lovelace')
        ?.quantity ?? '0'
    ),
    datumHash: raw.data_hash as string | undefined,
    inlineDatum: raw.inline_datum as string | undefined,
    scriptRef: raw.reference_script_hash as string | undefined,
    assets: mapBlockfrostAssets(
      (raw.amount as Array<{ unit: string; quantity: string }>)?.filter(
        (a) => a.unit !== 'lovelace'
      ) ?? []
    ),
  };
}

function mapBlockfrostAssets(
  rawAssets: Array<{ unit: string; quantity: string }>
): CardanoAsset[] {
  return rawAssets.map((a) => ({
    policyId: a.unit.slice(0, 56),
    assetName: Buffer.from(a.unit.slice(56), 'hex').toString('utf8'),
    assetNameHex: a.unit.slice(56),
    quantity: BigInt(a.quantity),
  }));
}

export function mapBlockfrostAddress(
  raw: Record<string, unknown>,
  address: string
): CardanoAddressInfo {
  const amounts = (raw.amount as Array<{ unit: string; quantity: string }>) ?? [];
  const lovelace = amounts.find((a) => a.unit === 'lovelace')?.quantity ?? '0';
  const assets = mapBlockfrostAssets(amounts.filter((a) => a.unit !== 'lovelace'));

  return {
    address,
    stakeAddress: raw.stake_address as string | undefined,
    lovelace: BigInt(lovelace),
    assets,
    utxoCount: (raw.utxo_count as number) ?? 0,
    txCount: (raw.tx_count as number) ?? 0,
  };
}

export function mapBlockfrostBlock(raw: Record<string, unknown>): CardanoBlock {
  return {
    blockHash: raw.hash as string,
    blockHeight: raw.height as number,
    slot: raw.slot as number,
    epoch: raw.epoch as number,
    epochSlot: raw.epoch_slot as number,
    blockTime: new Date((raw.time as number) * 1000),
    txCount: raw.tx_count as number,
    outputLovelace: toBigInt(raw.output),
    fees: toBigInt(raw.fees),
    size: raw.size as number,
    slotLeader: raw.slot_leader as string,
  };
}

export function mapBlockfrostEpoch(raw: Record<string, unknown>): CardanoEpoch {
  return {
    epochNo: raw.epoch as number,
    startTime: new Date((raw.start_time as number) * 1000),
    endTime: new Date((raw.end_time as number) * 1000),
    txCount: raw.tx_count as number,
    outputLovelace: toBigInt(raw.output),
    fees: toBigInt(raw.fees),
    activeStake: toBigInt(raw.active_stake),
    blockCount: raw.block_count as number,
  };
}

export function mapBlockfrostAccount(raw: Record<string, unknown>): CardanoAccount {
  return {
    stakeAddress: raw.stake_address as string,
    isRegistered: (raw.active as boolean) ?? false,
    lovelace: toBigInt(raw.controlled_amount),
    rewardsSum: toBigInt(raw.rewards_sum),
    withdrawalsSum: toBigInt(raw.withdrawals_sum),
    reservesSum: toBigInt(raw.reserves_sum),
    treasurySum: toBigInt(raw.treasury_sum),
    withdrawableAmount: toBigInt(raw.withdrawable_amount),
    poolId: raw.pool_id as string | undefined,
  };
}

// ============================================================
// KOIOS MAPPERS
// ============================================================

export function mapKoiosTx(raw: Record<string, unknown>): CardanoTransaction {
  const inputs = (raw.inputs as Record<string, unknown>[]) ?? [];
  const outputs = (raw.outputs as Record<string, unknown>[]) ?? [];

  return {
    txHash: raw.tx_hash as string,
    blockHash: raw.block_hash as string,
    blockHeight: raw.block_height as number,
    blockTime: new Date((raw.tx_timestamp as number) * 1000),
    slot: raw.absolute_slot as number,
    fees: toBigInt(raw.fee),
    totalInput: toBigInt(raw.total_input),
    totalOutput: toBigInt(raw.total_output),
    size: raw.tx_size as number,
    confirmations: (raw.confirmations as number) ?? 0,
    isValid: (raw.valid_contract as boolean) ?? true,
    inputs: inputs.map(mapKoiosTxInput),
    outputs: outputs.map(mapKoiosTxOutput),
    metadata: mapKoiosMetadata(raw.metadata),
  };
}

function mapKoiosTxInput(raw: Record<string, unknown>): CardanoTxInput {
  const paymentAddr = raw.payment_addr as Record<string, unknown> | undefined;
  return {
    txHash: raw.tx_hash as string,
    outputIndex: raw.tx_index as number,
    address: (paymentAddr?.bech32 as string) ?? '',
    lovelace: toBigInt(raw.value),
    assets: mapKoiosAssets((raw.asset_list as Record<string, unknown>[]) ?? []),
  };
}

function mapKoiosTxOutput(raw: Record<string, unknown>): CardanoTxOutput {
  const paymentAddr = raw.payment_addr as Record<string, unknown> | undefined;
  const inlineDatumObj = raw.inline_datum as Record<string, unknown> | undefined;
  return {
    outputIndex: raw.tx_index as number,
    address: (paymentAddr?.bech32 as string) ?? '',
    lovelace: toBigInt(raw.value),
    datumHash: raw.datum_hash as string | undefined,
    inlineDatum: inlineDatumObj?.value as string | undefined,
    assets: mapKoiosAssets((raw.asset_list as Record<string, unknown>[]) ?? []),
  };
}

function mapKoiosAssets(rawAssets: Record<string, unknown>[]): CardanoAsset[] {
  return rawAssets.map((a) => ({
    policyId: a.policy_id as string,
    assetName: Buffer.from(a.asset_name as string, 'hex').toString('utf8'),
    assetNameHex: a.asset_name as string,
    quantity: BigInt(a.quantity as string),
    fingerprint: a.fingerprint as string,
  }));
}

export function mapKoiosAddress(raw: Record<string, unknown>): CardanoAddressInfo {
  return {
    address: raw.address as string,
    stakeAddress: raw.stake_address as string | undefined,
    lovelace: toBigInt(raw.balance),
    assets: mapKoiosAssets((raw.asset_list as Record<string, unknown>[]) ?? []),
    utxoCount: (raw.utxo_count as number) ?? 0,
    txCount: (raw.tx_count as number) ?? 0,
  };
}

export function mapKoiosBlock(raw: Record<string, unknown>): CardanoBlock {
  return {
    blockHash: raw.hash as string,
    blockHeight: raw.block_height as number,
    slot: raw.abs_slot as number,
    epoch: raw.epoch as number,
    epochSlot: raw.epoch_slot as number,
    blockTime: new Date((raw.block_time as number) * 1000),
    txCount: raw.tx_count as number,
    outputLovelace: toBigInt(raw.total_output),
    fees: toBigInt(raw.total_fees),
    size: raw.size as number,
    slotLeader: (raw.pool as string) ?? '',
  };
}

function mapKoiosMetadata(raw: unknown): CardanoTxMetadata[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m: Record<string, unknown>) => ({
    label: BigInt(m.key as string),
    jsonMetadata: m.json,
  }));
}

// ============================================================
// OData entity mappers (internal model → OData response)
// ============================================================

export function txToOData(tx: CardanoTransaction, network: CardanoNetwork): Record<string, unknown> {
  return {
    txHash: tx.txHash,
    blockHash: tx.blockHash,
    blockHeight: tx.blockHeight,
    blockTime: tx.blockTime.toISOString(),
    slot: tx.slot,
    fees: tx.fees.toString(),
    totalInput: tx.totalInput.toString(),
    totalOutput: tx.totalOutput.toString(),
    size: tx.size,
    confirmations: tx.confirmations,
    isValid: tx.isValid,
    network,
    fetchedAt: new Date().toISOString(),
  };
}

export function addressToOData(
  info: CardanoAddressInfo,
  network: CardanoNetwork
): Record<string, unknown> {
  return {
    address: info.address,
    stakeAddress: info.stakeAddress,
    lovelace: info.lovelace.toString(),
    assetCount: info.assets.length,
    utxoCount: info.utxoCount,
    txCount: info.txCount,
    network,
    fetchedAt: new Date().toISOString(),
  };
}
