// Blockfrost Backend Implementation
// Primary provider for Cardano blockchain data

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
  mapBlockfrostAccount,
  mapBlockfrostAddress,
  mapBlockfrostBlock,
  mapBlockfrostEpoch,
  mapBlockfrostTx,
} from '../../utils/mappers';
import { BaseCardanoBackend } from './cardano-backend';

const BLOCKFROST_URLS: Record<CardanoNetwork, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
};

export class BlockfrostBackend extends BaseCardanoBackend {
  readonly providerType: ProviderType = 'blockfrost';
  private readonly projectId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    network: CardanoNetwork,
    projectId: string,
    timeoutMs = 8000
  ) {
    super(network);
    this.projectId = projectId;
    this.baseUrl = BLOCKFROST_URLS[network];
    this.timeoutMs = timeoutMs;
  }

  private async fetch<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          project_id: this.projectId,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 404) {
        throw new ResourceNotFoundError('Blockfrost resource', path);
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new BlockchainConnectivityError(
          'blockfrost',
          `HTTP ${response.status}: ${(body as Record<string, string>).message ?? response.statusText}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timer);
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError('blockfrost', this.timeoutMs);
      }
      if (
        error instanceof ResourceNotFoundError ||
        error instanceof BlockchainConnectivityError ||
        error instanceof TimeoutError
      ) {
        throw error;
      }
      throw new BlockchainConnectivityError('blockfrost', (error as Error).message);
    }
  }

  private async post<T>(path: string, body: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          project_id: this.projectId,
          'Content-Type': 'application/cbor',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new BlockchainConnectivityError(
          'blockfrost',
          `Submit failed HTTP ${response.status}: ${(errBody as Record<string, string>).message ?? ''}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timer);
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError('blockfrost', this.timeoutMs);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.fetch('/health');
      return true;
    } catch {
      return false;
    }
  }

  async getTransaction(txHash: string): Promise<CardanoTransaction> {
    const raw = await this.fetch<Record<string, unknown>>(`/txs/${txHash}`);
    const utxos = await this.getTransactionUtxos(txHash);
    const metadataRaw = await this.fetch<Record<string, unknown>[]>(
      `/txs/${txHash}/metadata`
    ).catch(() => []);

    const tx = mapBlockfrostTx(raw, this.network);
    tx.inputs = utxos.inputs;
    tx.outputs = utxos.outputs;
    tx.metadata = metadataRaw.map((m) => ({
      label: BigInt(m.label as string),
      jsonMetadata: m.json_metadata,
    }));

    return tx;
  }

  async getTransactions(txHashes: string[]): Promise<CardanoTransaction[]> {
    return Promise.all(txHashes.map((h) => this.getTransaction(h)));
  }

  async getTransactionUtxos(txHash: string): Promise<{
    inputs: CardanoTransaction['inputs'];
    outputs: CardanoTransaction['outputs'];
  }> {
    const raw = await this.fetch<Record<string, unknown>>(`/txs/${txHash}/utxos`);
    const tx = mapBlockfrostTx(raw, this.network);
    return { inputs: tx.inputs, outputs: tx.outputs };
  }

  async getAddress(address: string): Promise<CardanoAddressInfo> {
    const raw = await this.fetch<Record<string, unknown>>(`/addresses/${address}`);
    return mapBlockfrostAddress(raw, address);
  }

  async getBlockByHash(blockHash: string): Promise<CardanoBlock> {
    const raw = await this.fetch<Record<string, unknown>>(`/blocks/${blockHash}`);
    return mapBlockfrostBlock(raw);
  }

  async getBlockByHeight(height: number): Promise<CardanoBlock> {
    const raw = await this.fetch<Record<string, unknown>>(`/blocks/${height}`);
    return mapBlockfrostBlock(raw);
  }

  async getLatestBlock(): Promise<CardanoBlock> {
    const raw = await this.fetch<Record<string, unknown>>('/blocks/latest');
    return mapBlockfrostBlock(raw);
  }

  async getEpoch(epochNo: number): Promise<CardanoEpoch> {
    const raw = await this.fetch<Record<string, unknown>>(`/epochs/${epochNo}`);
    return mapBlockfrostEpoch(raw);
  }

  async getCurrentEpoch(): Promise<CardanoEpoch> {
    const raw = await this.fetch<Record<string, unknown>>('/epochs/latest');
    return mapBlockfrostEpoch(raw);
  }

  async getAccount(stakeAddress: string): Promise<CardanoAccount> {
    const raw = await this.fetch<Record<string, unknown>>(`/accounts/${stakeAddress}`);
    return mapBlockfrostAccount(raw);
  }

  async getNetworkInfo(): Promise<CardanoNetworkInfo> {
    const [genesis, latest] = await Promise.all([
      this.fetch<Record<string, unknown>>('/genesis'),
      this.fetch<Record<string, unknown>>('/blocks/latest'),
    ]);

    return {
      network: this.network,
      networkMagic: genesis.network_magic as number,
      currentEpoch: (await this.getCurrentEpoch()).epochNo,
      currentSlot: latest.slot as number,
      blockHeight: latest.height as number,
      circulatingSupply: 0n, // requires separate endpoint
      totalSupply: BigInt(genesis.max_lovelace_supply as string ?? '0'),
      activeStake: 0n,
      protocolVersion: `${(genesis as Record<string, Record<string, number>>).protocol_param?.major ?? 9}`,
    };
  }

  async submitTransaction(signedTxCbor: string): Promise<string> {
    const result = await this.post<string>('/tx/submit', signedTxCbor);
    return result;
  }

  async getAddressTransactions(
    address: string,
    options: { page?: number; count?: number } = {}
  ): Promise<string[]> {
    const { page = 1, count = 100 } = options;
    const txs = await this.fetch<Array<{ tx_hash: string }>>(
      `/addresses/${address}/transactions?page=${page}&count=${count}&order=desc`
    );
    return txs.map((t) => t.tx_hash);
  }
}
