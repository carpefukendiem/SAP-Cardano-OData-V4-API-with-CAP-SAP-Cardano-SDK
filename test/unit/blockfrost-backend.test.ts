import { BlockfrostBackend } from '../../srv/blockchain/backends/blockfrost-backend';
import {
  BlockchainConnectivityError,
  ResourceNotFoundError,
  TimeoutError,
} from '../../srv/utils/errors';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('BlockfrostBackend', () => {
  let backend: BlockfrostBackend;

  beforeEach(() => {
    backend = new BlockfrostBackend('preview', 'test-project-id', 5000);
    mockFetch.mockReset();
  });

  // ============================================================
  // Health Check
  // ============================================================
  describe('healthCheck', () => {
    it('should return true when health endpoint responds', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, { is_healthy: true }));
      expect(await backend.healthCheck()).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValue(new Error('connection refused'));
      expect(await backend.healthCheck()).toBe(false);
    });
  });

  // ============================================================
  // Transaction
  // ============================================================
  describe('getTransaction', () => {
    it('should fetch and map a transaction', async () => {
      const mockTxResponse = {
        hash: 'a'.repeat(64),
        block: 'b'.repeat(64),
        block_height: 9000000,
        block_time: 1700000000,
        slot: 1000000,
        fees: '180000',
        output_amount: [{ unit: 'lovelace', quantity: '5000000' }],
        size: 300,
        confirmations: 10,
        valid_contract: true,
      };

      const mockUtxosResponse = {
        hash: 'a'.repeat(64),
        inputs: [
          {
            tx_hash: 'c'.repeat(64),
            output_index: 0,
            address: 'addr_test1...',
            amount: [{ unit: 'lovelace', quantity: '10000000' }],
          },
        ],
        outputs: [
          {
            output_index: 0,
            address: 'addr_test1...',
            amount: [{ unit: 'lovelace', quantity: '5000000' }],
          },
        ],
      };

      const mockMetaResponse = [
        { label: '721', json_metadata: { name: 'TestNFT' } },
      ];

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, mockTxResponse))     // /txs/<hash>
        .mockResolvedValueOnce(mockResponse(200, mockUtxosResponse))  // /txs/<hash>/utxos
        .mockResolvedValueOnce(mockResponse(200, mockMetaResponse));  // /txs/<hash>/metadata

      const tx = await backend.getTransaction('a'.repeat(64));
      expect(tx.txHash).toBe('a'.repeat(64));
      expect(tx.blockHash).toBe('b'.repeat(64));
      expect(tx.fees).toBe(180000n);
    });

    it('should throw ResourceNotFoundError on 404', async () => {
      mockFetch.mockResolvedValue(mockResponse(404, { message: 'Not found' }));
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(
        ResourceNotFoundError
      );
    });

    it('should throw BlockchainConnectivityError on 500', async () => {
      mockFetch.mockResolvedValue(
        mockResponse(500, { message: 'Internal server error' })
      );
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(
        BlockchainConnectivityError
      );
    });

    it('should throw TimeoutError on AbortError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);
      await expect(backend.getTransaction('a'.repeat(64))).rejects.toThrow(TimeoutError);
    });
  });

  // ============================================================
  // Address
  // ============================================================
  describe('getAddress', () => {
    it('should fetch and map address info', async () => {
      const mockAddrResponse = {
        address: 'addr_test1...',
        stake_address: 'stake_test1...',
        amount: [
          { unit: 'lovelace', quantity: '5000000' },
          { unit: 'abc123' + 'DeadBeef', quantity: '100' },
        ],
        utxo_count: 3,
        tx_count: 10,
      };

      mockFetch.mockResolvedValue(mockResponse(200, mockAddrResponse));
      const addr = await backend.getAddress('addr_test1...');
      expect(addr.lovelace).toBe(5000000n);
      expect(addr.assets).toHaveLength(1);
    });

    it('should throw ResourceNotFoundError on 404', async () => {
      mockFetch.mockResolvedValue(mockResponse(404, {}));
      await expect(backend.getAddress('addr_test1...')).rejects.toThrow(
        ResourceNotFoundError
      );
    });
  });

  // ============================================================
  // Block
  // ============================================================
  describe('getLatestBlock', () => {
    it('should fetch latest block', async () => {
      const mockBlock = {
        hash: 'b'.repeat(64),
        height: 9000000,
        slot: 1000000,
        epoch: 450,
        epoch_slot: 250000,
        time: 1700000000,
        tx_count: 42,
        output: '1000000000',
        fees: '5000000',
        size: 65536,
        slot_leader: 'pool1...',
      };

      mockFetch.mockResolvedValue(mockResponse(200, mockBlock));
      const block = await backend.getLatestBlock();
      expect(block.blockHash).toBe('b'.repeat(64));
      expect(block.blockHeight).toBe(9000000);
    });
  });

  // ============================================================
  // Transaction Submit
  // ============================================================
  describe('submitTransaction', () => {
    it('should submit and return tx hash', async () => {
      const txHash = 'a'.repeat(64);
      mockFetch.mockResolvedValue(mockResponse(200, txHash));
      const result = await backend.submitTransaction('deadbeef1234');
      expect(result).toBe(txHash);
    });

    it('should throw on failed submission', async () => {
      mockFetch.mockResolvedValue(
        mockResponse(400, { message: 'Invalid CBOR' })
      );
      await expect(backend.submitTransaction('badbadcbor')).rejects.toThrow(
        BlockchainConnectivityError
      );
    });
  });

  // ============================================================
  // Network Info
  // ============================================================
  describe('getNetworkInfo', () => {
    it('should aggregate genesis and latest block info', async () => {
      const mockGenesis = {
        network_magic: 2,
        max_lovelace_supply: '45000000000000000',
      };
      const mockLatest = {
        hash: 'b'.repeat(64),
        height: 9000000,
        slot: 1000000,
        epoch: 450,
        epoch_slot: 250000,
        time: 1700000000,
        tx_count: 42,
        output: '1000000000',
        fees: '5000000',
        size: 65536,
        slot_leader: 'pool1...',
      };
      const mockEpoch = { epoch: 450, start_time: 1700000000, end_time: 1705000000, tx_count: 1000000, output: '1000000000000', fees: '1000000000', active_stake: '25000000000000000', block_count: 200000 };

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, mockGenesis))   // /genesis
        .mockResolvedValueOnce(mockResponse(200, mockLatest))    // /blocks/latest (parallel)
        .mockResolvedValueOnce(mockResponse(200, mockLatest))    // /epochs/latest
        .mockResolvedValueOnce(mockResponse(200, mockEpoch));    // epoch detail

      const info = await backend.getNetworkInfo();
      expect(info.network).toBe('preview');
      expect(info.networkMagic).toBe(2);
    });
  });
});
