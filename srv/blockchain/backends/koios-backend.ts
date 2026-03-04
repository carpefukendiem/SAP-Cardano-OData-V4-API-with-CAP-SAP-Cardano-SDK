// Koios Backend Implementation
// Fallback provider for Cardano blockchain data (no API key required)

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
import {
  BlockchainConnectivityError,
  ResourceNotFoundError,
  TimeoutError,
} from '../../utils/errors';
import {
  mapKoiosAddress,
  mapKoiosBlock,
  mapKoiosTx,
} from '../../utils/mappers';
import { BaseCardanoBackend } from './cardano-backend';

const KOIOS_URLS: Record<CardanoNetwork, string> = {
  mainnet: 'https://api.koios.rest/api/v1',
  preview: 'https://preview.koios.rest/api/v1',
  preprod: 'https://preprod.koios.rest/api/v1',
};

export class KoiosBackend extends BaseCardanoBackend {
  readonly providerType: ProviderType = 'koios';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(network: CardanoNetwork, timeoutMs = 10000) {
    super(network);
    this.baseUrl = KOIOS_URLS[network];
    this.timeoutMs = timeoutMs;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 404) {
        throw new ResourceNotFoundError('Koios resource', path);
      }

      if (!response.ok) {
        throw new BlockchainConnectivityError(
          'koios',
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length === 0) {
        throw new ResourceNotFoundError('Koios resource', path);
      }

      return data as T;
    } catch (error) {
      clearTimeout(timer);
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError('koios', this.timeoutMs);
      }
      if (
        error instanceof ResourceNotFoundError ||
        error instanceof BlockchainConnectivityError
      ) {
        throw error;
      }
      throw new BlockchainConnectivityError('koios', (error as Error).message);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new BlockchainConnectivityError(
          'koios',
          `HTTP ${response.status}: ${(err as Record<string, string>).hint ?? response.statusText}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timer);
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError('koios', this.timeoutMs);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/tip');
      return true;
    } catch {
      return false;
    }
  }

  async getTransaction(txHash: string): Promise<CardanoTransaction> {
    const results = await this.post<Record<string, unknown>[]>('/tx_info', {
      _tx_hashes: [txHash],
      _inputs: true,
      _metadata: true,
      _scripts: false,
      _certificates: false,
      _withdrawals: false,
    });

    if (!results || results.length === 0) {
      throw new ResourceNotFoundError('Transaction', txHash);
    }

    return mapKoiosTx(results[0]);
  }

  async getTransactions(txHashes: string[]): Promise<CardanoTransaction[]> {
    const results = await this.post<Record<string, unknown>[]>('/tx_info', {
      _tx_hashes: txHashes,
      _inputs: true,
      _metadata: true,
    });
    return (results ?? []).map(mapKoiosTx);
  }

  async getTransactionUtxos(txHash: string): Promise<{
    inputs: CardanoTransaction['inputs'];
    outputs: CardanoTransaction['outputs'];
  }> {
    const tx = await this.getTransaction(txHash);
    return { inputs: tx.inputs, outputs: tx.outputs };
  }

  async getAddress(address: string): Promise<CardanoAddressInfo> {
    const results = await this.post<Record<string, unknown>[]>('/address_info', {
      _addresses: [address],
    });

    if (!results || results.length === 0) {
      throw new ResourceNotFoundError('Address', address);
    }

    return mapKoiosAddress(results[0]);
  }

  async getBlockByHash(blockHash: string): Promise<CardanoBlock> {
    const results = await this.post<Record<string, unknown>[]>('/block_info', {
      _block_hashes: [blockHash],
    });

    if (!results || results.length === 0) {
      throw new ResourceNotFoundError('Block', blockHash);
    }

    return mapKoiosBlock(results[0]);
  }

  async getBlockByHeight(height: number): Promise<CardanoBlock> {
    const results = await this.get<Record<string, unknown>[]>(
      '/blocks',
      { block_height: `eq.${height}` }
    );

    if (!results || results.length === 0) {
      throw new ResourceNotFoundError('Block', String(height));
    }

    return mapKoiosBlock(results[0]);
  }

  async getLatestBlock(): Promise<CardanoBlock> {
    const results = await this.get<Record<string, unknown>[]>('/tip');
    if (!results || results.length === 0) {
      throw new BlockchainConnectivityError('koios', 'Could not fetch latest block');
    }
    // tip returns minimal info, fetch full block
    return this.getBlockByHash(results[0].hash as string);
  }

  async getEpoch(epochNo: number): Promise<CardanoEpoch> {
    const results = await this.get<Record<string, unknown>[]>(
      '/epoch_info',
      { _epoch_no: String(epochNo) }
    );

    if (!results || results.length === 0) {
      throw new ResourceNotFoundError('Epoch', String(epochNo));
    }

    const raw = results[0];
    return {
      epochNo: raw.epoch_no as number,
      startTime: new Date((raw.start_time as number) * 1000),
      endTime: new Date((raw.end_time as number) * 1000),
      txCount: raw.tx_count as number,
      outputLovelace: BigInt((raw.out_sum as string) ?? '0'),
      fees: BigInt((raw.fees as string) ?? '0'),
      activeStake: BigInt((raw.active_stake as string) ?? '0'),
      blockCount: raw.blk_count as number,
    };
  }

  async getCurrentEpoch(): Promise<CardanoEpoch> {
    const tip = await this.get<Record<string, unknown>[]>('/tip');
    return this.getEpoch((tip[0] as Record<string, number>).epoch_no);
  }

  async getAccount(stakeAddress: string): Promise<CardanoAccount> {
    const results = await this.post<Record<string, unknown>[]>('/account_info', {
      _stake_addresses: [stakeAddress],
    });

    if (!results || results.length === 0) {
      throw new ResourceNotFoundError('Account', stakeAddress);
    }

    const raw = results[0];
    return {
      stakeAddress,
      isRegistered: raw.status === 'registered',
      lovelace: BigInt((raw.total_balance as string) ?? '0'),
      rewardsSum: BigInt((raw.rewards as string) ?? '0'),
      withdrawalsSum: BigInt((raw.withdrawals as string) ?? '0'),
      reservesSum: 0n,
      treasurySum: 0n,
      withdrawableAmount: BigInt((raw.rewards_available as string) ?? '0'),
      poolId: raw.delegated_pool as string | undefined,
    };
  }

  async getNetworkInfo(): Promise<CardanoNetworkInfo> {
    const [tip, genesis] = await Promise.all([
      this.get<Record<string, unknown>[]>('/tip'),
      this.get<Record<string, unknown>>('/genesis'),
    ]);

    const latestTip = tip[0] as Record<string, unknown>;

    return {
      network: this.network,
      networkMagic: (genesis as Record<string, number>).networkmagic,
      currentEpoch: latestTip.epoch_no as number,
      currentSlot: latestTip.abs_slot as number,
      blockHeight: latestTip.block_no as number,
      circulatingSupply: 0n,
      totalSupply: BigInt((genesis as Record<string, string>).maxlovelacesupply ?? '0'),
      activeStake: 0n,
      protocolVersion: '9',
    };
  }

  async submitTransaction(signedTxCbor: string): Promise<string> {
    const result = await this.post<{ tx_hash: string }>('/submittx', {
      cbor: signedTxCbor,
    });
    return result.tx_hash;
  }

  async getAddressTransactions(
    address: string,
    options: { page?: number; count?: number } = {}
  ): Promise<string[]> {
    const { count = 100 } = options;
    const results = await this.post<Array<{ tx_hash: string }>>('/address_txs', {
      _addresses: [address],
      _after_block_height: 0,
    });
    return (results ?? []).slice(0, count).map((r) => r.tx_hash);
  }
}
