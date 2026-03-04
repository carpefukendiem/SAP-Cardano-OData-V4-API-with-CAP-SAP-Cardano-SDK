// Cardano Indexer — lazy on-demand indexing with TTL-based cache
// Bridges the CardanoClient to the CAP in-memory database

import { CardanoClient, createCardanoClient } from './cardano-client';
import {
  addressToOData,
  txToOData,
} from '../utils/mappers';
import {
  CardanoNetwork,
  IndexerCache,
  IndexerCacheEntry,
} from '../utils/types';

const DEFAULT_TTL_MS = {
  transaction: 60_000,       // 1 min (immutable once confirmed)
  address: 15_000,           // 15 sec (balance changes with each block)
  block: 20_000,             // 20 sec
  epoch: 300_000,            // 5 min (epochs are long)
  account: 30_000,           // 30 sec
  networkInfo: 20_000,       // 20 sec
};

export class CardanoIndexer {
  private readonly clients: Map<CardanoNetwork, CardanoClient> = new Map();
  private readonly cache: IndexerCache = new Map();

  private getClient(network: CardanoNetwork): CardanoClient {
    if (!this.clients.has(network)) {
      this.clients.set(network, createCardanoClient(network));
    }
    return this.clients.get(network)!;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key) as IndexerCacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.cachedAt.getTime() > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCached<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, cachedAt: new Date(), ttlMs });
  }

  // ============================================================
  // TRANSACTION
  // ============================================================

  async getTransaction(txHash: string, network: CardanoNetwork): Promise<Record<string, unknown>> {
    const cacheKey = `tx:${network}:${txHash}`;
    const cached = this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const tx = await this.getClient(network).getTransaction(txHash);
    const odata = txToOData(tx, network);
    this.setCached(cacheKey, odata, DEFAULT_TTL_MS.transaction);
    return odata;
  }

  // ============================================================
  // ADDRESS
  // ============================================================

  async getAddress(address: string, network: CardanoNetwork): Promise<Record<string, unknown>> {
    const cacheKey = `addr:${network}:${address}`;
    const cached = this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const info = await this.getClient(network).getAddress(address);
    const odata = addressToOData(info, network);
    this.setCached(cacheKey, odata, DEFAULT_TTL_MS.address);
    return odata;
  }

  // ============================================================
  // BLOCK
  // ============================================================

  async getBlockByHash(blockHash: string, network: CardanoNetwork): Promise<Record<string, unknown>> {
    const cacheKey = `block:hash:${network}:${blockHash}`;
    const cached = this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const block = await this.getClient(network).getBlockByHash(blockHash);
    const odata: Record<string, unknown> = {
      blockHash: block.blockHash,
      blockHeight: block.blockHeight,
      slot: block.slot,
      epoch: block.epoch,
      epochSlot: block.epochSlot,
      blockTime: block.blockTime.toISOString(),
      txCount: block.txCount,
      outputLovelace: block.outputLovelace.toString(),
      fees: block.fees.toString(),
      size: block.size,
      slotLeader: block.slotLeader,
      network,
      fetchedAt: new Date().toISOString(),
    };
    this.setCached(cacheKey, odata, DEFAULT_TTL_MS.block);
    return odata;
  }

  async getLatestBlock(network: CardanoNetwork): Promise<Record<string, unknown>> {
    const block = await this.getClient(network).getLatestBlock();
    return this.getBlockByHash(block.blockHash, network);
  }

  // ============================================================
  // EPOCH
  // ============================================================

  async getEpoch(epochNo: number, network: CardanoNetwork): Promise<Record<string, unknown>> {
    const cacheKey = `epoch:${network}:${epochNo}`;
    const cached = this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const epoch = await this.getClient(network).getEpoch(epochNo);
    const odata: Record<string, unknown> = {
      epochNo: epoch.epochNo,
      startTime: epoch.startTime.toISOString(),
      endTime: epoch.endTime.toISOString(),
      txCount: epoch.txCount,
      outputLovelace: epoch.outputLovelace.toString(),
      fees: epoch.fees.toString(),
      activeStake: epoch.activeStake.toString(),
      blockCount: epoch.blockCount,
      network,
      fetchedAt: new Date().toISOString(),
    };
    this.setCached(cacheKey, odata, DEFAULT_TTL_MS.epoch);
    return odata;
  }

  // ============================================================
  // ACCOUNT
  // ============================================================

  async getAccount(stakeAddress: string, network: CardanoNetwork): Promise<Record<string, unknown>> {
    const cacheKey = `account:${network}:${stakeAddress}`;
    const cached = this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const account = await this.getClient(network).getAccount(stakeAddress);
    const odata: Record<string, unknown> = {
      stakeAddress: account.stakeAddress,
      isRegistered: account.isRegistered,
      lovelace: account.lovelace.toString(),
      rewardsSum: account.rewardsSum.toString(),
      withdrawalsSum: account.withdrawalsSum.toString(),
      reservesSum: account.reservesSum.toString(),
      treasurySum: account.treasurySum.toString(),
      withdrawableAmount: account.withdrawableAmount.toString(),
      poolId: account.poolId,
      poolName: account.poolName,
      network,
      fetchedAt: new Date().toISOString(),
    };
    this.setCached(cacheKey, odata, DEFAULT_TTL_MS.account);
    return odata;
  }

  // ============================================================
  // NETWORK INFO
  // ============================================================

  async getNetworkInfo(network: CardanoNetwork): Promise<Record<string, unknown>> {
    const cacheKey = `networkInfo:${network}`;
    const cached = this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const info = await this.getClient(network).getNetworkInfo();
    const odata: Record<string, unknown> = {
      network: info.network,
      networkMagic: info.networkMagic,
      currentEpoch: info.currentEpoch,
      currentSlot: info.currentSlot,
      blockHeight: info.blockHeight,
      circulatingSupply: info.circulatingSupply.toString(),
      totalSupply: info.totalSupply.toString(),
      activeStake: info.activeStake.toString(),
      protocolVersion: info.protocolVersion,
      fetchedAt: new Date().toISOString(),
    };
    this.setCached(cacheKey, odata, DEFAULT_TTL_MS.networkInfo);
    return odata;
  }

  // ============================================================
  // CACHE MANAGEMENT
  // ============================================================

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getCacheStats(): { size: number; entries: Array<{ key: string; ageMs: number; ttlMs: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      ageMs: now - (entry as IndexerCacheEntry<unknown>).cachedAt.getTime(),
      ttlMs: (entry as IndexerCacheEntry<unknown>).ttlMs,
    }));
    return { size: this.cache.size, entries };
  }

  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - (entry as IndexerCacheEntry<unknown>).cachedAt.getTime() > (entry as IndexerCacheEntry<unknown>).ttlMs) {
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }
}

// Singleton indexer instance
let _indexer: CardanoIndexer | null = null;

export function getIndexer(): CardanoIndexer {
  if (!_indexer) {
    _indexer = new CardanoIndexer();
  }
  return _indexer;
}
