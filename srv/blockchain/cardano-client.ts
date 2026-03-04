// Cardano Client — Multi-provider orchestration with automatic failover
// Primary: Blockfrost (8s timeout) → Fallback: Koios (10s timeout)

import { ICardanoBackend } from './backends/cardano-backend';
import { BlockfrostBackend } from './backends/blockfrost-backend';
import { KoiosBackend } from './backends/koios-backend';
import {
  CardanoAccount,
  CardanoAddressInfo,
  CardanoBlock,
  CardanoEpoch,
  CardanoNetwork,
  CardanoNetworkInfo,
  CardanoTransaction,
} from '../utils/types';
import {
  AllProvidersFailedError,
  BlockchainConnectivityError,
  TimeoutError,
} from '../utils/errors';

export interface CardanoClientOptions {
  network: CardanoNetwork;
  blockfrostProjectId?: string;
  blockfrostTimeout?: number;
  koiosTimeout?: number;
  enableFallback?: boolean;
}

/**
 * Multi-provider Cardano client with automatic failover.
 * Tries the primary provider (Blockfrost) first, falls back to Koios
 * on connectivity errors or timeouts.
 */
export class CardanoClient {
  private readonly primary: ICardanoBackend;
  private readonly fallback: ICardanoBackend | null;
  readonly network: CardanoNetwork;

  constructor(options: CardanoClientOptions) {
    this.network = options.network;

    // Primary: Blockfrost (requires API key)
    if (options.blockfrostProjectId) {
      this.primary = new BlockfrostBackend(
        options.network,
        options.blockfrostProjectId,
        options.blockfrostTimeout ?? 8000
      );
    } else {
      // Fall back to Koios as primary if no Blockfrost key
      this.primary = new KoiosBackend(
        options.network,
        options.blockfrostTimeout ?? 8000
      );
    }

    // Fallback: Koios (no API key required)
    this.fallback =
      options.enableFallback !== false
        ? new KoiosBackend(options.network, options.koiosTimeout ?? 10000)
        : null;
  }

  /**
   * Execute a provider call with automatic failover
   */
  private async withFallback<T>(
    operation: (backend: ICardanoBackend) => Promise<T>
  ): Promise<T> {
    const errors: Error[] = [];

    try {
      return await operation(this.primary);
    } catch (err) {
      errors.push(err as Error);

      // Only failover on connectivity/timeout errors, not validation errors
      if (
        !(err instanceof BlockchainConnectivityError) &&
        !(err instanceof TimeoutError)
      ) {
        throw err;
      }

      if (!this.fallback) {
        throw err;
      }
    }

    try {
      return await operation(this.fallback!);
    } catch (err) {
      errors.push(err as Error);
      throw new AllProvidersFailedError(errors);
    }
  }

  async healthCheck(): Promise<{ primary: boolean; fallback: boolean }> {
    const [primary, fallback] = await Promise.allSettled([
      this.primary.healthCheck(),
      this.fallback?.healthCheck() ?? Promise.resolve(false),
    ]);

    return {
      primary: primary.status === 'fulfilled' && primary.value,
      fallback: fallback.status === 'fulfilled' && fallback.value,
    };
  }

  async getTransaction(txHash: string): Promise<CardanoTransaction> {
    return this.withFallback((b) => b.getTransaction(txHash));
  }

  async getTransactions(txHashes: string[]): Promise<CardanoTransaction[]> {
    return this.withFallback((b) => b.getTransactions(txHashes));
  }

  async getAddress(address: string): Promise<CardanoAddressInfo> {
    return this.withFallback((b) => b.getAddress(address));
  }

  async getBlockByHash(blockHash: string): Promise<CardanoBlock> {
    return this.withFallback((b) => b.getBlockByHash(blockHash));
  }

  async getBlockByHeight(height: number): Promise<CardanoBlock> {
    return this.withFallback((b) => b.getBlockByHeight(height));
  }

  async getLatestBlock(): Promise<CardanoBlock> {
    return this.withFallback((b) => b.getLatestBlock());
  }

  async getEpoch(epochNo: number): Promise<CardanoEpoch> {
    return this.withFallback((b) => b.getEpoch(epochNo));
  }

  async getCurrentEpoch(): Promise<CardanoEpoch> {
    return this.withFallback((b) => b.getCurrentEpoch());
  }

  async getAccount(stakeAddress: string): Promise<CardanoAccount> {
    return this.withFallback((b) => b.getAccount(stakeAddress));
  }

  async getNetworkInfo(): Promise<CardanoNetworkInfo> {
    return this.withFallback((b) => b.getNetworkInfo());
  }

  async submitTransaction(signedTxCbor: string): Promise<string> {
    return this.withFallback((b) => b.submitTransaction(signedTxCbor));
  }

  async getAddressTransactions(
    address: string,
    options?: { page?: number; count?: number }
  ): Promise<string[]> {
    return this.withFallback((b) => b.getAddressTransactions(address, options));
  }
}

/**
 * Factory: create a CardanoClient from environment variables
 */
export function createCardanoClient(network: CardanoNetwork): CardanoClient {
  return new CardanoClient({
    network,
    blockfrostProjectId: process.env[`BLOCKFROST_PROJECT_ID_${network.toUpperCase()}`],
    blockfrostTimeout: parseInt(process.env.BLOCKFROST_TIMEOUT ?? '8000', 10),
    koiosTimeout: parseInt(process.env.KOIOS_TIMEOUT ?? '10000', 10),
    enableFallback: process.env.ENABLE_FALLBACK !== 'false',
  });
}
