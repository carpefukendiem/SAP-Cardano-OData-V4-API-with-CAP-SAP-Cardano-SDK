import {
  AllProvidersFailedError,
  BlockchainConnectivityError,
  ContractStateError,
  ContractValidationError,
  ForbiddenError,
  InternalError,
  InvalidAddressError,
  InvalidNetworkError,
  InvalidTxHashError,
  ResourceNotFoundError,
  SapCardanoError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
  isSapCardanoError,
} from '../../srv/utils/errors';
import { ErrorCode, HTTP_STATUS } from '../../srv/utils/error-codes';

describe('Error Classes', () => {
  // ============================================================
  // SapCardanoError (base)
  // ============================================================
  describe('SapCardanoError', () => {
    it('should create error with correct properties', () => {
      const err = new ValidationError('test error');
      expect(err.message).toBe('test error');
      expect(err.httpStatus).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(err instanceof SapCardanoError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });

    it('should produce OData error format', () => {
      const err = new ValidationError('bad input', { field: 'address' });
      const odata = err.toODataError();
      expect(odata).toHaveProperty('error');
      expect((odata as Record<string, Record<string, string>>).error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect((odata as Record<string, Record<string, string>>).error.message).toBe('bad input');
    });

    it('should have a timestamp', () => {
      const before = new Date();
      const err = new InternalError('test');
      const after = new Date();
      expect(err.timestamp >= before).toBe(true);
      expect(err.timestamp <= after).toBe(true);
    });
  });

  // ============================================================
  // ValidationError (400)
  // ============================================================
  describe('ValidationError', () => {
    it('should have HTTP 400 status', () => {
      const err = new ValidationError('invalid field');
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  // ============================================================
  // InvalidAddressError (400)
  // ============================================================
  describe('InvalidAddressError', () => {
    it('should include the invalid address in message', () => {
      const err = new InvalidAddressError('not-an-address');
      expect(err.message).toContain('not-an-address');
      expect(err.httpStatus).toBe(400);
    });

    it('should have details with address', () => {
      const err = new InvalidAddressError('xxx');
      expect((err.details as Record<string, string>).address).toBe('xxx');
    });
  });

  // ============================================================
  // InvalidTxHashError (400)
  // ============================================================
  describe('InvalidTxHashError', () => {
    it('should include hash in message', () => {
      const err = new InvalidTxHashError('tooshort');
      expect(err.message).toContain('tooshort');
      expect(err.httpStatus).toBe(400);
    });
  });

  // ============================================================
  // ResourceNotFoundError (404)
  // ============================================================
  describe('ResourceNotFoundError', () => {
    it('should have HTTP 404 status', () => {
      const err = new ResourceNotFoundError('Transaction', 'abc123');
      expect(err.httpStatus).toBe(404);
      expect(err.message).toContain('Transaction');
      expect(err.message).toContain('abc123');
    });
  });

  // ============================================================
  // BlockchainConnectivityError (503)
  // ============================================================
  describe('BlockchainConnectivityError', () => {
    it('should have HTTP 503 status', () => {
      const err = new BlockchainConnectivityError('blockfrost', 'connection refused');
      expect(err.httpStatus).toBe(503);
      expect(err.message).toContain('blockfrost');
    });

    it('should include retry advice', () => {
      const err = new BlockchainConnectivityError('koios', 'timeout');
      expect(err.message).toContain('retry');
    });
  });

  // ============================================================
  // TimeoutError (504)
  // ============================================================
  describe('TimeoutError', () => {
    it('should have HTTP 504 status', () => {
      const err = new TimeoutError('blockfrost', 8000);
      expect(err.httpStatus).toBe(504);
      expect(err.message).toContain('8000');
    });
  });

  // ============================================================
  // UnauthorizedError (401)
  // ============================================================
  describe('UnauthorizedError', () => {
    it('should have HTTP 401 status', () => {
      const err = new UnauthorizedError();
      expect(err.httpStatus).toBe(401);
    });

    it('should accept custom message', () => {
      const err = new UnauthorizedError('Please authenticate');
      expect(err.message).toBe('Please authenticate');
    });
  });

  // ============================================================
  // ForbiddenError (403)
  // ============================================================
  describe('ForbiddenError', () => {
    it('should have HTTP 403 status', () => {
      const err = new ForbiddenError();
      expect(err.httpStatus).toBe(403);
    });
  });

  // ============================================================
  // InternalError (500)
  // ============================================================
  describe('InternalError', () => {
    it('should have HTTP 500 status', () => {
      const err = new InternalError();
      expect(err.httpStatus).toBe(500);
    });

    it('should have generic default message', () => {
      const err = new InternalError();
      expect(err.message).toContain('internal error');
    });
  });

  // ============================================================
  // InvalidNetworkError (400)
  // ============================================================
  describe('InvalidNetworkError', () => {
    it('should mention valid networks in message', () => {
      const err = new InvalidNetworkError('testnet');
      expect(err.message).toContain('mainnet');
      expect(err.message).toContain('preview');
      expect(err.message).toContain('preprod');
    });
  });

  // ============================================================
  // ContractValidationError (400)
  // ============================================================
  describe('ContractValidationError', () => {
    it('should include contract name', () => {
      const err = new ContractValidationError('supply_chain_tracker', 'invalid status');
      expect(err.message).toContain('supply_chain_tracker');
      expect(err.httpStatus).toBe(400);
    });
  });

  // ============================================================
  // ContractStateError (409)
  // ============================================================
  describe('ContractStateError', () => {
    it('should have HTTP 409 status', () => {
      const err = new ContractStateError('settlement already executed');
      expect(err.httpStatus).toBe(409);
    });
  });

  // ============================================================
  // AllProvidersFailedError
  // ============================================================
  describe('AllProvidersFailedError', () => {
    it('should aggregate multiple errors', () => {
      const err = new AllProvidersFailedError([
        new TimeoutError('blockfrost', 8000),
        new BlockchainConnectivityError('koios', 'connection refused'),
      ]);
      expect(err.httpStatus).toBe(503);
      expect(err.message).toContain('all-providers');
    });
  });

  // ============================================================
  // isSapCardanoError type guard
  // ============================================================
  describe('isSapCardanoError', () => {
    it('should return true for SapCardanoError instances', () => {
      expect(isSapCardanoError(new ValidationError('test'))).toBe(true);
      expect(isSapCardanoError(new ResourceNotFoundError('Tx', 'hash'))).toBe(true);
    });

    it('should return false for plain Error instances', () => {
      expect(isSapCardanoError(new Error('plain error'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isSapCardanoError('a string')).toBe(false);
      expect(isSapCardanoError(null)).toBe(false);
      expect(isSapCardanoError(42)).toBe(false);
    });
  });
});
