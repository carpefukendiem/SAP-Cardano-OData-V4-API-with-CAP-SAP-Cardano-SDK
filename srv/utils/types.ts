// Core types for the SAP-Cardano OData service

// ============================================================
// BLOCKCHAIN PROVIDER TYPES
// ============================================================

export type CardanoNetwork = 'mainnet' | 'preview' | 'preprod';

export type ProviderType = 'blockfrost' | 'koios';

export interface CardanoProviderConfig {
  type: ProviderType;
  baseUrl: string;
  projectId?: string;
  timeout: number;
  retries: number;
}

export interface CardanoClientConfig {
  network: CardanoNetwork;
  primaryProvider: CardanoProviderConfig;
  fallbackProvider?: CardanoProviderConfig;
}

// ============================================================
// TRANSACTION TYPES
// ============================================================

export interface CardanoAsset {
  policyId: string;
  assetName: string;
  assetNameHex: string;
  quantity: bigint | string;
  fingerprint?: string;
}

export interface CardanoUTxO {
  txHash: string;
  outputIndex: number;
  address: string;
  lovelace: bigint | string;
  assets: CardanoAsset[];
  datumHash?: string;
  inlineDatum?: string;
  scriptRef?: string;
}

export interface CardanoTxInput {
  txHash: string;
  outputIndex: number;
  address: string;
  lovelace: bigint | string;
  assets: CardanoAsset[];
}

export interface CardanoTxOutput {
  outputIndex: number;
  address: string;
  lovelace: bigint | string;
  datumHash?: string;
  inlineDatum?: string;
  scriptRef?: string;
  assets: CardanoAsset[];
}

export interface CardanoTxMetadata {
  label: bigint | number;
  jsonMetadata: unknown;
}

export interface CardanoTransaction {
  txHash: string;
  blockHash: string;
  blockHeight: number;
  blockTime: Date;
  slot: number;
  fees: bigint | string;
  totalInput: bigint | string;
  totalOutput: bigint | string;
  size: number;
  confirmations: number;
  isValid: boolean;
  inputs: CardanoTxInput[];
  outputs: CardanoTxOutput[];
  metadata: CardanoTxMetadata[];
}

// ============================================================
// ADDRESS TYPES
// ============================================================

export interface CardanoAddressInfo {
  address: string;
  stakeAddress?: string;
  lovelace: bigint | string;
  assets: CardanoAsset[];
  utxoCount: number;
  txCount: number;
}

// ============================================================
// BLOCK TYPES
// ============================================================

export interface CardanoBlock {
  blockHash: string;
  blockHeight: number;
  slot: number;
  epoch: number;
  epochSlot: number;
  blockTime: Date;
  txCount: number;
  outputLovelace: bigint | string;
  fees: bigint | string;
  size: number;
  slotLeader: string;
}

// ============================================================
// EPOCH TYPES
// ============================================================

export interface CardanoEpoch {
  epochNo: number;
  startTime: Date;
  endTime: Date;
  txCount: number;
  outputLovelace: bigint | string;
  fees: bigint | string;
  activeStake: bigint | string;
  blockCount: number;
}

// ============================================================
// ACCOUNT TYPES
// ============================================================

export interface CardanoAccount {
  stakeAddress: string;
  isRegistered: boolean;
  lovelace: bigint | string;
  rewardsSum: bigint | string;
  withdrawalsSum: bigint | string;
  reservesSum: bigint | string;
  treasurySum: bigint | string;
  withdrawableAmount: bigint | string;
  poolId?: string;
  poolName?: string;
}

// ============================================================
// NETWORK INFORMATION TYPES
// ============================================================

export interface CardanoNetworkInfo {
  network: CardanoNetwork;
  networkMagic: number;
  currentEpoch: number;
  currentSlot: number;
  blockHeight: number;
  circulatingSupply: bigint | string;
  totalSupply: bigint | string;
  activeStake: bigint | string;
  protocolVersion: string;
}

// ============================================================
// SMART CONTRACT TYPES
// ============================================================

export type SupplyChainStatus =
  | 'Created'
  | 'Dispatched'
  | 'InTransit'
  | 'UnderInspection'
  | 'Cleared'
  | 'Received'
  | 'Rejected';

export type EsgCreditType =
  | 'CarbonCredit'
  | 'RenewableEnergyCertificate'
  | 'WaterCredit'
  | 'BiodiversityCredit'
  | 'SocialImpact';

export type SettlementStatus =
  | 'Pending'
  | 'Approved'
  | 'Executed'
  | 'Disputed'
  | 'Refunded'
  | 'Expired';

export type AssetState = 'Active' | 'Locked' | 'Transferred' | 'Decommissioned';

export type OracleDataType =
  | 'ExchangeRate'
  | 'CommodityPrice'
  | 'InterestRate'
  | 'SapConditionType';

// ============================================================
// CONTRACT BUILDER TYPES
// ============================================================

export interface BuildTxParams {
  fromAddress: string;
  toAddress: string;
  lovelace: bigint;
  metadata?: Record<number, unknown>;
  network: CardanoNetwork;
}

export interface BuildTxResult {
  txCborHex: string;
  txHash: string;
  estimatedFee: bigint;
  network: CardanoNetwork;
}

export interface SubmitTxParams {
  signedTxCbor: string;
  network: CardanoNetwork;
}

export interface SubmitTxResult {
  txHash: string;
  submitted: boolean;
  network: CardanoNetwork;
  timestamp: Date;
}

// ============================================================
// INDEXER TYPES
// ============================================================

export interface IndexerCacheEntry<T> {
  data: T;
  cachedAt: Date;
  ttlMs: number;
}

export type IndexerCache = Map<string, IndexerCacheEntry<unknown>>;

// ============================================================
// OData REQUEST CONTEXT TYPES
// ============================================================

export interface CardanoServiceRequest {
  network?: CardanoNetwork;
  [key: string]: unknown;
}

export interface PaginationOptions {
  top?: number;
  skip?: number;
}

export interface FilterOptions {
  filter?: string;
  select?: string[];
  orderby?: string;
}
