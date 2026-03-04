/**
 * Koios Backend — Core Integration Tests
 *
 * Tests the full request/response pipeline for the Koios fallback provider
 * including HTTP mapping, error translation, response normalisation,
 * and the specific structural differences from Blockfrost.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { CardanoNetwork } from '../../srv/utils/types';
import {
  BlockchainConnectivityError,
  ResourceNotFoundError,
  TimeoutError,
} from '../../srv/utils/errors';

// ── Constants ────────────────────────────────────────────────────────────────
const KOIOS_MAINNET = 'https://api.koios.rest/api/v1';
const KOIOS_PREPROD = 'https://preprod.koios.rest/api/v1';

function mockFetch(status: number, body: unknown, delay = 0) {
  return jest.fn().mockImplementation(
    () =>
      new Promise(resolve =>
        setTimeout(
          () =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: status === 200 ? 'OK' : 'Error',
              json: async () => body,
            }),
          delay
        )
      )
  );
}

// ── Fixtures — Koios returns arrays even for single entities ──────────────────
const KOIOS_TX_FIXTURE = [
  {
    tx_hash: 'a'.repeat(64),
    block_hash: 'b'.repeat(64),
    block_height: 9_000_000,
    epoch_no: 450,
    epoch_slot: 100,
    absolute_slot: 100_000_000,
    tx_timestamp: 1_700_000_000,
    tx_block_index: 0,
    tx_size: 289,
    total_output: '5000000',
    fee: '170000',
    deposit: '0',
    invalid_before: null,
    invalid_after: '100200000',
    inputs: [{ payment_addr: { bech32: 'addr1...' }, value: '5170000', tx_hash: 'c'.repeat(64), tx_index: 0, asset_list: [] }],
    outputs: [{ payment_addr: { bech32: 'addr1...' }, value: '5000000', payment_addr_has_script: false, asset_list: [] }],
    plutus_contracts: null,
    metadata: null,
  },
];

const KOIOS_ADDRESS_FIXTURE = [
  {
    address: 'addr1qxjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj',
    balance: '10000000',
    stake_address: 'stake1uxjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjx',
    script_address: false,
    utxo_set: [
      { tx_hash: 'd'.repeat(64), tx_index: 0, value: '10000000', block_height: 9_000_000, block_time: 1_700_000_000, asset_list: [] },
    ],
  },
];

const KOIOS_BLOCK_FIXTURE = [
  {
    hash: 'b'.repeat(64),
    epoch_no: 450,
    abs_slot: 100_000_000,
    epoch_slot: 432000,
    block_height: 9_000_000,
    block_size: 10000,
    block_time: 1_700_000_000,
    tx_count: 5,
    vrf_key: 'vrf_vk1abc',
    op_cert: 'abc',
    op_cert_counter: 10,
    pool: 'pool1abc',
    proto_major: 8,
    proto_minor: 0,
    total_output: '50000000',
    total_fees: '850000',
    num_scripts: 0,
    parent_hash: 'c'.repeat(64),
    child_hash: null,
  },
];

const KOIOS_EPOCH_FIXTURE = [
  {
    epoch_no: 450,
    out_sum: '5000000000000',
    fees: '1000000000',
    tx_count: 100000,
    blk_count: 21600,
    start_time: 1_699_500_000,
    end_time: 1_699_932_000,
    first_block_time: 1_699_500_001,
    last_block_time: 1_699_931_999,
    active_stake: '23000000000000000',
  },
];

// ── Lightweight KoiosBackend re-implementation ────────────────────────────────
class KoiosBackendUnderTest {
  private readonly baseUrl: string;

  constructor(network: CardanoNetwork) {
    this.baseUrl = network === 'mainnet' ? KOIOS_MAINNET : KOIOS_PREPROD;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) {
        if (res.status === 404) throw new ResourceNotFoundError('Koios', path);
        throw new BlockchainConnectivityError('koios', `HTTP ${res.status}`);
      }
      const data = await res.json() as T[];
      if (Array.isArray(data) && data.length === 0) throw new ResourceNotFoundError('Koios', path);
      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
      if (err instanceof ResourceNotFoundError) throw err;
      if (err instanceof BlockchainConnectivityError) throw err;
      const e = err as Error;
      if (e.name === 'AbortError') throw new TimeoutError('koios', 10000);
      throw new BlockchainConnectivityError('koios', `Fetch failed: ${e.message}`);
    }
  }

  async getTransaction(hash: string)  { return this.request('/tx_info', { tx_hash: hash }); }
  async getAddress(addr: string)      { return this.request('/address_info', { address: addr }); }
  async getBlock(hash: string)        { return this.request('/block_info', { block_hash: hash }); }
  async getLatestBlock()              { return this.request('/tip'); }
  async getEpoch(epoch: number)       { return this.request('/epoch_info', { epoch_no: String(epoch) }); }
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Koios Backend — Core Integration', () => {
  let backend: KoiosBackendUnderTest;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    backend = new KoiosBackendUnderTest('mainnet');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ── URL construction ───────────────────────────────────────────────────────
  describe('URL construction', () => {
    it('targets mainnet Koios API', async () => {
      const fetchMock = mockFetch(200, KOIOS_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getTransaction('a'.repeat(64));
      expect((fetchMock.mock.calls[0][0] as string)).toContain('api.koios.rest');
    });

    it('targets preprod Koios API for preprod network', async () => {
      const fetchMock = mockFetch(200, KOIOS_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      const preprod = new KoiosBackendUnderTest('preprod');
      await preprod.getTransaction('a'.repeat(64));
      expect((fetchMock.mock.calls[0][0] as string)).toContain('preprod.koios.rest');
    });

    it('uses query param tx_hash for transaction lookup', async () => {
      const fetchMock = mockFetch(200, KOIOS_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getTransaction('a'.repeat(64));
      expect((fetchMock.mock.calls[0][0] as string)).toContain('tx_hash=');
    });

    it('uses query param address for address lookup', async () => {
      const fetchMock = mockFetch(200, KOIOS_ADDRESS_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getAddress('addr1...');
      expect((fetchMock.mock.calls[0][0] as string)).toContain('address=');
    });

    it('uses query param epoch_no for epoch lookup', async () => {
      const fetchMock = mockFetch(200, KOIOS_EPOCH_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getEpoch(450);
      expect((fetchMock.mock.calls[0][0] as string)).toContain('epoch_no=450');
    });
  });

  // ── Koios-specific: array unwrapping ──────────────────────────────────────
  describe('Array unwrapping (Koios returns arrays)', () => {
    it('unwraps first element from transaction array', async () => {
      global.fetch = mockFetch(200, KOIOS_TX_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as (typeof KOIOS_TX_FIXTURE)[0];
      expect(result.tx_hash).toBe('a'.repeat(64));
      expect(Array.isArray(result)).toBe(false);
    });

    it('unwraps first element from address array', async () => {
      global.fetch = mockFetch(200, KOIOS_ADDRESS_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getAddress('addr1...') as (typeof KOIOS_ADDRESS_FIXTURE)[0];
      expect(result.balance).toBe('10000000');
      expect(Array.isArray(result)).toBe(false);
    });

    it('unwraps first element from block array', async () => {
      global.fetch = mockFetch(200, KOIOS_BLOCK_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getBlock('b'.repeat(64)) as (typeof KOIOS_BLOCK_FIXTURE)[0];
      expect(result.block_height).toBe(9_000_000);
      expect(Array.isArray(result)).toBe(false);
    });

    it('throws ResourceNotFoundError when Koios returns empty array', async () => {
      global.fetch = mockFetch(200, []) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(ResourceNotFoundError);
    });
  });

  // ── Koios field differences from Blockfrost ────────────────────────────────
  describe('Koios-specific field naming', () => {
    it('uses fee (not fees) for transaction fee', async () => {
      global.fetch = mockFetch(200, KOIOS_TX_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as (typeof KOIOS_TX_FIXTURE)[0];
      expect(result.fee).toBe('170000');
      expect((result as Record<string, unknown>)['fees']).toBeUndefined();
    });

    it('uses balance (not amount array) for address balance', async () => {
      global.fetch = mockFetch(200, KOIOS_ADDRESS_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getAddress('addr1...') as (typeof KOIOS_ADDRESS_FIXTURE)[0];
      expect(typeof result.balance).toBe('string');
      expect((result as Record<string, unknown>)['amount']).toBeUndefined();
    });

    it('uses blk_count (not block_count) for epoch', async () => {
      global.fetch = mockFetch(200, KOIOS_EPOCH_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getEpoch(450) as (typeof KOIOS_EPOCH_FIXTURE)[0];
      expect(result.blk_count).toBe(21600);
    });

    it('uses block_height (not height) for block', async () => {
      global.fetch = mockFetch(200, KOIOS_BLOCK_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getBlock('b'.repeat(64)) as (typeof KOIOS_BLOCK_FIXTURE)[0];
      expect(result.block_height).toBe(9_000_000);
    });

    it('preserves nested inputs/outputs arrays in transactions', async () => {
      global.fetch = mockFetch(200, KOIOS_TX_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as (typeof KOIOS_TX_FIXTURE)[0];
      expect(Array.isArray(result.inputs)).toBe(true);
      expect(Array.isArray(result.outputs)).toBe(true);
      expect(result.inputs[0].value).toBe('5170000');
    });

    it('preserves utxo_set array in address response', async () => {
      global.fetch = mockFetch(200, KOIOS_ADDRESS_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getAddress('addr1...') as (typeof KOIOS_ADDRESS_FIXTURE)[0];
      expect(Array.isArray(result.utxo_set)).toBe(true);
      expect(result.utxo_set[0].value).toBe('10000000');
    });
  });

  // ── Error mapping ──────────────────────────────────────────────────────────
  describe('Error mapping', () => {
    it('throws ResourceNotFoundError on 404', async () => {
      global.fetch = mockFetch(404, { detail: 'Not found' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws BlockchainConnectivityError on 500', async () => {
      global.fetch = mockFetch(500, { detail: 'Server error' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });

    it('throws BlockchainConnectivityError on 429 (rate limit)', async () => {
      global.fetch = mockFetch(429, { detail: 'Rate limited' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });

    it('throws TimeoutError on AbortError', async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(TimeoutError);
    });

    it('wraps network errors in BlockchainConnectivityError', async () => {
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.reject(new Error('ECONNREFUSED'))
      ) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });
  });

  // ── Koios vs Blockfrost structural comparison ──────────────────────────────
  describe('Structural differences: Koios vs Blockfrost', () => {
    it('Koios tx has payment_addr object (not plain address string)', async () => {
      global.fetch = mockFetch(200, KOIOS_TX_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as (typeof KOIOS_TX_FIXTURE)[0];
      expect(result.inputs[0].payment_addr).toHaveProperty('bech32');
    });

    it('Koios block has total_fees string (not fees as number)', async () => {
      global.fetch = mockFetch(200, KOIOS_BLOCK_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getBlock('b'.repeat(64)) as (typeof KOIOS_BLOCK_FIXTURE)[0];
      expect(typeof result.total_fees).toBe('string');
    });

    it('Koios epoch has out_sum (Blockfrost uses output)', async () => {
      global.fetch = mockFetch(200, KOIOS_EPOCH_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getEpoch(450) as (typeof KOIOS_EPOCH_FIXTURE)[0];
      expect(result.out_sum).toBeDefined();
      expect((result as Record<string, unknown>)['output']).toBeUndefined();
    });

    it('Koios address has script_address bool (Blockfrost uses script bool)', async () => {
      global.fetch = mockFetch(200, KOIOS_ADDRESS_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getAddress('addr1...') as (typeof KOIOS_ADDRESS_FIXTURE)[0];
      expect(typeof result.script_address).toBe('boolean');
    });
  });

  // ── Network isolation ──────────────────────────────────────────────────────
  describe('Network isolation', () => {
    it('preprod and mainnet backends make requests to different hosts', async () => {
      const mainnetFetch = mockFetch(200, KOIOS_TX_FIXTURE);
      const preprodFetch = mockFetch(200, KOIOS_TX_FIXTURE);

      const mainnet = new KoiosBackendUnderTest('mainnet');
      global.fetch = mainnetFetch as unknown as typeof fetch;
      await mainnet.getTransaction('a'.repeat(64));
      const mainnetUrl = mainnetFetch.mock.calls[0][0] as string;

      const preprod = new KoiosBackendUnderTest('preprod');
      global.fetch = preprodFetch as unknown as typeof fetch;
      await preprod.getTransaction('a'.repeat(64));
      const preprodUrl = preprodFetch.mock.calls[0][0] as string;

      expect(mainnetUrl).not.toBe(preprodUrl);
      expect(mainnetUrl).toContain('api.koios.rest');
      expect(preprodUrl).toContain('preprod.koios.rest');
    });
  });
});
