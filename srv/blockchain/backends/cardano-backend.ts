// Abstract Cardano Backend Interface
// All provider implementations (Blockfrost, Koios) must implement this interface

import {
  CardanoAccount,
  CardanoAddressInfo,
  CardanoBlock,
  CardanoEpoch,
  CardanoNetwork,
  CardanoNetworkInfo,
  CardanoTransaction,
  ProviderType,
} from '../../utils/types';

/**
 * Abstract interface that all blockchain data providers must implement.
 * This allows transparent failover between Blockfrost, Koios, etc.
 */
export interface ICardanoBackend {
  readonly providerType: ProviderType;
  readonly network: CardanoNetwork;

  /**
   * Health check — verify the provider is reachable
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get transaction by hash
   */
  getTransaction(txHash: string): Promise<CardanoTransaction>;

  /**
   * Get multiple transactions by hash list
   */
  getTransactions(txHashes: string[]): Promise<CardanoTransaction[]>;

  /**
   * Get address information (balance, assets, UTxOs)
   */
  getAddress(address: string): Promise<CardanoAddressInfo>;

  /**
   * Get block by hash
   */
  getBlockByHash(blockHash: string): Promise<CardanoBlock>;

  /**
   * Get block by height
   */
  getBlockByHeight(height: number): Promise<CardanoBlock>;

  /**
   * Get latest block
   */
  getLatestBlock(): Promise<CardanoBlock>;

  /**
   * Get epoch by number
   */
  getEpoch(epochNo: number): Promise<CardanoEpoch>;

  /**
   * Get current epoch
   */
  getCurrentEpoch(): Promise<CardanoEpoch>;

  /**
   * Get stake account information
   */
  getAccount(stakeAddress: string): Promise<CardanoAccount>;

  /**
   * Get network parameters and status
   */
  getNetworkInfo(): Promise<CardanoNetworkInfo>;

  /**
   * Submit a signed transaction
   */
  submitTransaction(signedTxCbor: string): Promise<string>; // returns txHash

  /**
   * Get transaction UTxOs (inputs/outputs)
   */
  getTransactionUtxos(txHash: string): Promise<{
    inputs: CardanoTransaction['inputs'];
    outputs: CardanoTransaction['outputs'];
  }>;

  /**
   * Get address transaction history
   */
  getAddressTransactions(
    address: string,
    options?: { page?: number; count?: number }
  ): Promise<string[]>; // returns txHash list
}

/**
 * Base class with common error handling logic
 */
export abstract class BaseCardanoBackend implements ICardanoBackend {
  abstract readonly providerType: ProviderType;
  readonly network: CardanoNetwork;

  constructor(network: CardanoNetwork) {
    this.network = network;
  }

  abstract healthCheck(): Promise<boolean>;
  abstract getTransaction(txHash: string): Promise<CardanoTransaction>;
  abstract getTransactions(txHashes: string[]): Promise<CardanoTransaction[]>;
  abstract getAddress(address: string): Promise<CardanoAddressInfo>;
  abstract getBlockByHash(blockHash: string): Promise<CardanoBlock>;
  abstract getBlockByHeight(height: number): Promise<CardanoBlock>;
  abstract getLatestBlock(): Promise<CardanoBlock>;
  abstract getEpoch(epochNo: number): Promise<CardanoEpoch>;
  abstract getCurrentEpoch(): Promise<CardanoEpoch>;
  abstract getAccount(stakeAddress: string): Promise<CardanoAccount>;
  abstract getNetworkInfo(): Promise<CardanoNetworkInfo>;
  abstract submitTransaction(signedTxCbor: string): Promise<string>;
  abstract getTransactionUtxos(
    txHash: string
  ): Promise<{ inputs: CardanoTransaction['inputs']; outputs: CardanoTransaction['outputs'] }>;
  abstract getAddressTransactions(
    address: string,
    options?: { page?: number; count?: number }
  ): Promise<string[]>;
}
