import { CardanoClient } from '../../srv/blockchain/cardano-client';
import {
  AllProvidersFailedError,
  BlockchainConnectivityError,
  TimeoutError,
} from '../../srv/utils/errors';

// ============================================================
// Mock backends
// ============================================================

const mockPrimary = {
  providerType: 'blockfrost' as const,
  network: 'preview' as const,
  healthCheck: jest.fn(),
  getTransaction: jest.fn(),
  getTransactions: jest.fn(),
  getAddress: jest.fn(),
  getBlockByHash: jest.fn(),
  getBlockByHeight: jest.fn(),
  getLatestBlock: jest.fn(),
  getEpoch: jest.fn(),
  getCurrentEpoch: jest.fn(),
  getAccount: jest.fn(),
  getNetworkInfo: jest.fn(),
  submitTransaction: jest.fn(),
  getTransactionUtxos: jest.fn(),
  getAddressTransactions: jest.fn(),
};

const mockFallback = {
  providerType: 'koios' as const,
  network: 'preview' as const,
  healthCheck: jest.fn(),
  getTransaction: jest.fn(),
  getTransactions: jest.fn(),
  getAddress: jest.fn(),
  getBlockByHash: jest.fn(),
  getBlockByHeight: jest.fn(),
  getLatestBlock: jest.fn(),
  getEpoch: jest.fn(),
  getCurrentEpoch: jest.fn(),
  getAccount: jest.fn(),
  getNetworkInfo: jest.fn(),
  submitTransaction: jest.fn(),
  getTransactionUtxos: jest.fn(),
  getAddressTransactions: jest.fn(),
};

// Helper to create a client with injected mocks
function createTestClient(opts: {
  primaryFails?: boolean;
  fallbackFails?: boolean;
  enableFallback?: boolean;
}): CardanoClient {
  const client = new CardanoClient({
    network: 'preview',
    enableFallback: opts.enableFallback ?? true,
  });

  // Inject mock backends via prototype assignment
  (client as unknown as Record<string, unknown>)['primary'] = mockPrimary;
  (client as unknown as Record<string, unknown>)['fallback'] = opts.enableFallback !== false ? mockFallback : null;

  return client;
}

describe('CardanoClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // Health Check
  // ============================================================
  describe('healthCheck', () => {
    it('should return health status for both providers', async () => {
      mockPrimary.healthCheck.mockResolvedValue(true);
      mockFallback.healthCheck.mockResolvedValue(true);
      const client = createTestClient({});

      const result = await client.healthCheck();
      expect(result.primary).toBe(true);
      expect(result.fallback).toBe(true);
    });

    it('should report fallback down if it fails', async () => {
      mockPrimary.healthCheck.mockResolvedValue(true);
      mockFallback.healthCheck.mockResolvedValue(false);
      const client = createTestClient({});

      const result = await client.healthCheck();
      expect(result.primary).toBe(true);
      expect(result.fallback).toBe(false);
    });
  });

  // ============================================================
  // Failover Logic
  // ============================================================
  describe('withFallback (via getTransaction)', () => {
    it('should use primary when it succeeds', async () => {
      const mockTx = { txHash: 'a'.repeat(64), blockHash: 'b'.repeat(64) };
      mockPrimary.getTransaction.mockResolvedValue(mockTx);
      const client = createTestClient({});

      const result = await client.getTransaction('a'.repeat(64));
      expect(result).toEqual(mockTx);
      expect(mockPrimary.getTransaction).toHaveBeenCalledTimes(1);
      expect(mockFallback.getTransaction).not.toHaveBeenCalled();
    });

    it('should fall back to secondary on BlockchainConnectivityError', async () => {
      const mockTx = { txHash: 'a'.repeat(64) };
      mockPrimary.getTransaction.mockRejectedValue(
        new BlockchainConnectivityError('blockfrost', 'connection refused')
      );
      mockFallback.getTransaction.mockResolvedValue(mockTx);
      const client = createTestClient({});

      const result = await client.getTransaction('a'.repeat(64));
      expect(result).toEqual(mockTx);
      expect(mockFallback.getTransaction).toHaveBeenCalledTimes(1);
    });

    it('should fall back on TimeoutError', async () => {
      const mockTx = { txHash: 'a'.repeat(64) };
      mockPrimary.getTransaction.mockRejectedValue(new TimeoutError('blockfrost', 8000));
      mockFallback.getTransaction.mockResolvedValue(mockTx);
      const client = createTestClient({});

      const result = await client.getTransaction('a'.repeat(64));
      expect(result).toEqual(mockTx);
    });

    it('should NOT fall back on ResourceNotFoundError (404)', async () => {
      const notFoundErr = Object.assign(new Error('not found'), { httpStatus: 404 });
      mockPrimary.getTransaction.mockRejectedValue(notFoundErr);
      const client = createTestClient({});

      await expect(client.getTransaction('a'.repeat(64))).rejects.toThrow('not found');
      expect(mockFallback.getTransaction).not.toHaveBeenCalled();
    });

    it('should throw AllProvidersFailedError when both fail', async () => {
      mockPrimary.getTransaction.mockRejectedValue(
        new BlockchainConnectivityError('blockfrost', 'down')
      );
      mockFallback.getTransaction.mockRejectedValue(
        new BlockchainConnectivityError('koios', 'down')
      );
      const client = createTestClient({});

      await expect(client.getTransaction('a'.repeat(64))).rejects.toThrow(
        AllProvidersFailedError
      );
    });

    it('should not use fallback when disabled', async () => {
      mockPrimary.getTransaction.mockRejectedValue(
        new BlockchainConnectivityError('blockfrost', 'down')
      );
      const client = createTestClient({ enableFallback: false });

      await expect(client.getTransaction('a'.repeat(64))).rejects.toThrow(
        BlockchainConnectivityError
      );
      expect(mockFallback.getTransaction).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Individual method delegation
  // ============================================================
  describe('method delegation', () => {
    let client: CardanoClient;

    beforeEach(() => {
      client = createTestClient({});
    });

    it('getAddress delegates to primary', async () => {
      const mockAddr = { address: 'addr1...', lovelace: '5000000' };
      mockPrimary.getAddress.mockResolvedValue(mockAddr);
      expect(await client.getAddress('addr1...')).toEqual(mockAddr);
    });

    it('getBlockByHash delegates to primary', async () => {
      const mockBlock = { blockHash: 'a'.repeat(64), blockHeight: 12345 };
      mockPrimary.getBlockByHash.mockResolvedValue(mockBlock);
      expect(await client.getBlockByHash('a'.repeat(64))).toEqual(mockBlock);
    });

    it('getCurrentEpoch delegates to primary', async () => {
      const mockEpoch = { epochNo: 450 };
      mockPrimary.getCurrentEpoch.mockResolvedValue(mockEpoch);
      expect(await client.getCurrentEpoch()).toEqual(mockEpoch);
    });

    it('submitTransaction delegates to primary', async () => {
      const txHash = 'a'.repeat(64);
      mockPrimary.submitTransaction.mockResolvedValue(txHash);
      expect(await client.submitTransaction('deadbeef12')).toBe(txHash);
    });
  });
});
