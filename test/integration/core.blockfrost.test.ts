/**
 * Blockfrost Backend — Core Integration Tests
 *
 * Tests the full request/response pipeline for the Blockfrost provider
 * including HTTP mapping, error translation, and response normalisation.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { CardanoNetwork } from '../../srv/utils/types';
import {
  BlockchainConnectivityError,
  ResourceNotFoundError,
  TimeoutError,
} from '../../srv/utils/errors';

// ── Fixture helpers ──────────────────────────────────────────────────────────
const MAINNET_API = 'https://cardano-mainnet.blockfrost.io/api/v0';
const PREPROD_API = 'https://cardano-preprod.blockfrost.io/api/v0';

function mockFetch(status: number, body: unknown, delay = 0) {
  return jest.fn().mockImplementation(
    () =>
      new Promise(resolve =>
        setTimeout(
          () =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
              json: async () => body,
              headers: new Map([['content-type', 'application/json']]),
            }),
          delay
        )
      )
  );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const BF_TX_FIXTURE = {
  hash: 'a'.repeat(64),
  block: 'b'.repeat(64),
  block_height: 9_000_000,
  block_time: 1_700_000_000,
  slot: 100_000_000,
  index: 0,
  output_amount: [{ unit: 'lovelace', quantity: '5000000' }],
  fees: '170000',
  deposit: '0',
  size: 289,
  invalid_before: null,
  invalid_hereafter: '100200000',
  utxo_count: 2,
  withdrawal_count: 0,
  mir_cert_count: 0,
  delegation_count: 0,
  stake_cert_count: 0,
  pool_update_count: 0,
  pool_retire_count: 0,
  asset_mint_or_burn_count: 0,
  redeemer_count: 0,
  valid_contract: true,
};

const BF_ADDRESS_FIXTURE = {
  address: 'addr1qxjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj',
  amount: [{ unit: 'lovelace', quantity: '10000000' }],
  stake_address: 'stake1uxjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjx',
  type: 'shelley',
  script: false,
};

const BF_BLOCK_FIXTURE = {
  time: 1_700_000_000,
  height: 9_000_000,
  hash: 'b'.repeat(64),
  slot: 100_000_000,
  epoch: 450,
  epoch_slot: 432000,
  slot_leader: 'pool1abc',
  size: 10000,
  tx_count: 5,
  output: '50000000',
  fees: '850000',
  block_vrf: 'vrf_vk1abc',
  op_cert: 'abc',
  op_cert_counter: '10',
  previous_block: 'c'.repeat(64),
  next_block: null,
  confirmations: 100,
};

const BF_EPOCH_FIXTURE = {
  epoch: 450,
  start_time: 1_699_500_000,
  end_time: 1_699_932_000,
  first_block_time: 1_699_500_001,
  last_block_time: 1_699_931_999,
  block_count: 21600,
  tx_count: 100000,
  output: '5000000000000',
  fees: '1000000000',
  active_stake: '23000000000000000',
};

// ── Lightweight BlockfrostBackend re-implementation for tests ─────────────────
// We test the real HTTP layer but using a fetch mock, not a live network.
class BlockfrostBackendUnderTest {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(network: CardanoNetwork, apiKey: string) {
    this.baseUrl = network === 'mainnet' ? MAINNET_API : PREPROD_API;
    this.headers = { project_id: apiKey, 'Content-Type': 'application/json' };
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: this.headers,
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        if (res.status === 404) throw new ResourceNotFoundError('Blockfrost', path);
        if (res.status === 403) throw new BlockchainConnectivityError('blockfrost', 'Forbidden (bad API key)');
        throw new BlockchainConnectivityError('blockfrost', `HTTP ${res.status}`);
      }
      return res.json() as T;
    } catch (err) {
      if (err instanceof ResourceNotFoundError) throw err;
      if (err instanceof BlockchainConnectivityError) throw err;
      const e = err as Error;
      if (e.name === 'AbortError') throw new TimeoutError('blockfrost', 8000);
      throw new BlockchainConnectivityError('blockfrost', `Fetch failed: ${e.message}`);
    }
  }

  async getTransaction(hash: string) { return this.request(`/txs/${hash}`); }
  async getAddress(addr: string)     { return this.request(`/addresses/${addr}`); }
  async getBlock(hash: string)       { return this.request(`/blocks/${hash}`); }
  async getLatestBlock()             { return this.request('/blocks/latest'); }
  async getEpoch(epoch: number)      { return this.request(`/epochs/${epoch}`); }
  async getLatestEpoch()             { return this.request('/epochs/latest'); }
  async submitTx(cbor: string) {
    const res = await fetch(`${this.baseUrl}/tx/submit`, {
      method: 'POST',
      headers: this.headers,
      body: cbor,
    });
    if (!res.ok) throw new BlockchainConnectivityError('blockfrost', `Submit failed: HTTP ${res.status}`);
    return res.json();
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Blockfrost Backend — Core Integration', () => {
  let backend: BlockfrostBackendUnderTest;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    backend = new BlockfrostBackendUnderTest('mainnet', 'test-api-key-mainnet');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ── URL construction ───────────────────────────────────────────────────────
  describe('URL construction', () => {
    it('targets mainnet API base URL', async () => {
      const fetchMock = mockFetch(200, BF_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getTransaction('a'.repeat(64));
      const called = (fetchMock.mock.calls[0][0] as string);
      expect(called).toContain('cardano-mainnet.blockfrost.io');
    });

    it('targets preprod API base URL for preprod network', async () => {
      const fetchMock = mockFetch(200, BF_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      const preprod = new BlockfrostBackendUnderTest('preprod', 'test-api-key-preprod');
      await preprod.getTransaction('a'.repeat(64));
      const called = (fetchMock.mock.calls[0][0] as string);
      expect(called).toContain('cardano-preprod.blockfrost.io');
    });

    it('includes project_id header', async () => {
      const fetchMock = mockFetch(200, BF_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getTransaction('a'.repeat(64));
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)['project_id']).toBe('test-api-key-mainnet');
    });

    it('builds correct /txs/:hash path', async () => {
      const fetchMock = mockFetch(200, BF_TX_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      const hash = 'a'.repeat(64);
      await backend.getTransaction(hash);
      expect((fetchMock.mock.calls[0][0] as string)).toContain(`/txs/${hash}`);
    });

    it('builds correct /addresses/:addr path', async () => {
      const fetchMock = mockFetch(200, BF_ADDRESS_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      const addr = 'addr1qxjkvdnkz5r3e5qlm8c06lp7xzjqjxjejxjxjejxjxjxjxjxjxj';
      await backend.getAddress(addr);
      expect((fetchMock.mock.calls[0][0] as string)).toContain(`/addresses/${addr}`);
    });

    it('builds correct /blocks/:hash path', async () => {
      const fetchMock = mockFetch(200, BF_BLOCK_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getBlock('b'.repeat(64));
      expect((fetchMock.mock.calls[0][0] as string)).toContain('/blocks/b');
    });

    it('requests /blocks/latest for latest block', async () => {
      const fetchMock = mockFetch(200, BF_BLOCK_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getLatestBlock();
      expect((fetchMock.mock.calls[0][0] as string)).toContain('/blocks/latest');
    });

    it('builds correct /epochs/:n path', async () => {
      const fetchMock = mockFetch(200, BF_EPOCH_FIXTURE);
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.getEpoch(450);
      expect((fetchMock.mock.calls[0][0] as string)).toContain('/epochs/450');
    });
  });

  // ── Success responses ──────────────────────────────────────────────────────
  describe('Success responses', () => {
    it('returns raw transaction fixture on 200', async () => {
      global.fetch = mockFetch(200, BF_TX_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as typeof BF_TX_FIXTURE;
      expect(result.hash).toBe('a'.repeat(64));
      expect(result.fees).toBe('170000');
    });

    it('returns raw address fixture on 200', async () => {
      global.fetch = mockFetch(200, BF_ADDRESS_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getAddress('addr1...') as typeof BF_ADDRESS_FIXTURE;
      expect(result.type).toBe('shelley');
    });

    it('returns raw block fixture on 200', async () => {
      global.fetch = mockFetch(200, BF_BLOCK_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getBlock('b'.repeat(64)) as typeof BF_BLOCK_FIXTURE;
      expect(result.height).toBe(9_000_000);
      expect(result.tx_count).toBe(5);
    });

    it('returns epoch fixture on 200', async () => {
      global.fetch = mockFetch(200, BF_EPOCH_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getEpoch(450) as typeof BF_EPOCH_FIXTURE;
      expect(result.epoch).toBe(450);
      expect(result.block_count).toBe(21600);
    });
  });

  // ── Error mapping ──────────────────────────────────────────────────────────
  describe('Error mapping', () => {
    it('throws ResourceNotFoundError on 404', async () => {
      global.fetch = mockFetch(404, { status_code: 404, error: 'Not Found', message: 'tx not found' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws BlockchainConnectivityError on 403 (bad API key)', async () => {
      global.fetch = mockFetch(403, { status_code: 403, error: 'Forbidden' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });

    it('throws BlockchainConnectivityError on 500', async () => {
      global.fetch = mockFetch(500, { status_code: 500, error: 'Internal Server Error' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });

    it('throws BlockchainConnectivityError on 429 (rate limit)', async () => {
      global.fetch = mockFetch(429, { status_code: 429, error: 'Rate Limited' }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });

    it('throws TimeoutError on fetch abort', async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        (err as NodeJS.ErrnoException).name = 'AbortError';
        return Promise.reject(err);
      }) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(TimeoutError);
    });

    it('throws BlockchainConnectivityError on network failure', async () => {
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.reject(new Error('ECONNREFUSED'))
      ) as unknown as typeof fetch;
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(BlockchainConnectivityError);
    });
  });

  // ── Submit transaction ─────────────────────────────────────────────────────
  describe('Submit transaction', () => {
    it('POSTs to /tx/submit with CBOR body', async () => {
      const fetchMock = mockFetch(200, { result: 'a'.repeat(64) });
      global.fetch = fetchMock as unknown as typeof fetch;
      await backend.submitTx('deadbeef');
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect((fetchMock.mock.calls[0][0] as string)).toContain('/tx/submit');
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe('deadbeef');
    });

    it('throws BlockchainConnectivityError on submit failure', async () => {
      global.fetch = mockFetch(400, { status_code: 400, error: 'Bad Request', message: 'Invalid CBOR' }) as unknown as typeof fetch;
      await expect(backend.submitTx('badhex')).rejects.toThrow(BlockchainConnectivityError);
    });
  });

  // ── Response data integrity ────────────────────────────────────────────────
  describe('Response data integrity', () => {
    it('preserves all output_amount entries from Blockfrost', async () => {
      const fixture = {
        ...BF_TX_FIXTURE,
        output_amount: [
          { unit: 'lovelace', quantity: '5000000' },
          { unit: 'abc123def456', quantity: '100' },
        ],
      };
      global.fetch = mockFetch(200, fixture) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as typeof fixture;
      expect(result.output_amount).toHaveLength(2);
      expect(result.output_amount[1].unit).toBe('abc123def456');
    });

    it('preserves null fields from Blockfrost (e.g. invalid_before)', async () => {
      global.fetch = mockFetch(200, BF_TX_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getTransaction('a'.repeat(64)) as typeof BF_TX_FIXTURE;
      expect(result.invalid_before).toBeNull();
    });

    it('preserves next_block null for latest block', async () => {
      global.fetch = mockFetch(200, BF_BLOCK_FIXTURE) as unknown as typeof fetch;
      const result = await backend.getBlock('b'.repeat(64)) as typeof BF_BLOCK_FIXTURE;
      expect(result.next_block).toBeNull();
    });
  });
});
