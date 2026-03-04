// Integration tests for error handling across the service layer
// Validates that all 5 required error scenarios return correct HTTP codes

import {
  BlockchainConnectivityError,
  ContractValidationError,
  ForbiddenError,
  InternalError,
  InvalidAddressError,
  InvalidTxHashError,
  ResourceNotFoundError,
  SapCardanoError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
  isSapCardanoError,
} from '../../srv/utils/errors';
import { HTTP_STATUS, ErrorCode } from '../../srv/utils/error-codes';

/**
 * Tests the 5 required error scenarios from the project acceptance criteria:
 * 1. Invalid input format → HTTP 400
 * 2. Data not found → HTTP 404
 * 3. Cardano API connectivity failure → HTTP 503
 * 4. Unauthorized access → HTTP 401/403
 * 5. Internal server error → HTTP 500
 */
describe('Error Handling — 5 Required Scenarios', () => {
  // ============================================================
  // Scenario 1: Invalid input format → HTTP 400
  // ============================================================
  describe('Scenario 1: Invalid input format (400 Bad Request)', () => {
    it('invalid transaction hash returns 400', () => {
      const err = new InvalidTxHashError('not-a-hash');
      expect(err.httpStatus).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(err.code).toBe(ErrorCode.INVALID_TX_HASH);
      expect(err.message).toContain('not-a-hash');
    });

    it('invalid address format returns 400', () => {
      const err = new InvalidAddressError('0xdeadbeef');
      expect(err.httpStatus).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(err.code).toBe(ErrorCode.INVALID_ADDRESS);
    });

    it('invalid network parameter returns 400', () => {
      const err = new ValidationError('Invalid network: "ethereum"');
      expect(err.httpStatus).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it('malformed SAP document ID returns 400', () => {
      const err = new ValidationError('Invalid SAP document ID: too-long-document-id-exceeding-35-chars');
      expect(err.httpStatus).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('contract validation failure returns 400', () => {
      const err = new ContractValidationError('supply_chain_tracker', 'invalid status transition');
      expect(err.httpStatus).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(err.code).toBe(ErrorCode.CONTRACT_VALIDATION_ERROR);
    });

    it('should produce OData-compliant error body', () => {
      const err = new InvalidAddressError('bad-addr');
      const odata = err.toODataError() as Record<string, Record<string, unknown>>;
      expect(odata.error).toBeDefined();
      expect(typeof odata.error.code).toBe('string');
      expect(typeof odata.error.message).toBe('string');
      expect(odata.error.innererror).toBeDefined();
    });
  });

  // ============================================================
  // Scenario 2: Data not found → HTTP 404
  // ============================================================
  describe('Scenario 2: Resource not found (404 Not Found)', () => {
    it('unknown transaction hash returns 404', () => {
      const err = new ResourceNotFoundError('Transaction', 'a'.repeat(64));
      expect(err.httpStatus).toBe(HTTP_STATUS.NOT_FOUND);
      expect(err.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });

    it('unknown address returns 404', () => {
      const err = new ResourceNotFoundError('Address', 'addr_test1...');
      expect(err.httpStatus).toBe(HTTP_STATUS.NOT_FOUND);
      expect(err.message).toContain('Address');
    });

    it('unknown block hash returns 404', () => {
      const err = new ResourceNotFoundError('Block', 'b'.repeat(64));
      expect(err.httpStatus).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('unknown epoch number returns 404', () => {
      const err = new ResourceNotFoundError('Epoch', '99999');
      expect(err.httpStatus).toBe(HTTP_STATUS.NOT_FOUND);
      expect(err.message).toContain('Epoch');
    });

    it('should include resource and identifier in details', () => {
      const err = new ResourceNotFoundError('Transaction', 'deadbeef');
      const details = err.details as Record<string, string>;
      expect(details.resource).toBe('Transaction');
      expect(details.identifier).toBe('deadbeef');
    });
  });

  // ============================================================
  // Scenario 3: Cardano API connectivity failure → HTTP 503
  // ============================================================
  describe('Scenario 3: Blockchain connectivity failure (503 Service Unavailable)', () => {
    it('Blockfrost unavailable returns 503', () => {
      const err = new BlockchainConnectivityError('blockfrost', 'connection refused');
      expect(err.httpStatus).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
      expect(err.code).toBe(ErrorCode.BLOCKCHAIN_UNAVAILABLE);
    });

    it('Koios unavailable returns 503', () => {
      const err = new BlockchainConnectivityError('koios', 'ECONNREFUSED');
      expect(err.httpStatus).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
    });

    it('should include retry advice in message', () => {
      const err = new BlockchainConnectivityError('blockfrost', 'timeout');
      expect(err.message.toLowerCase()).toContain('retry');
    });

    it('request timeout returns 504', () => {
      const err = new TimeoutError('blockfrost', 8000);
      expect(err.httpStatus).toBe(HTTP_STATUS.GATEWAY_TIMEOUT);
      expect(err.code).toBe(ErrorCode.TIMEOUT);
      expect(err.message).toContain('8000');
    });

    it('provider details in error', () => {
      const err = new BlockchainConnectivityError('blockfrost', 'error', { retry: true });
      const details = err.details as Record<string, unknown>;
      expect(details.provider).toBe('blockfrost');
    });
  });

  // ============================================================
  // Scenario 4: Unauthorized access → HTTP 401/403
  // ============================================================
  describe('Scenario 4: Unauthorized/Forbidden access', () => {
    it('missing authentication returns 401', () => {
      const err = new UnauthorizedError();
      expect(err.httpStatus).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(err.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('custom unauthorized message', () => {
      const err = new UnauthorizedError('API key required');
      expect(err.message).toBe('API key required');
      expect(err.httpStatus).toBe(401);
    });

    it('insufficient permissions returns 403', () => {
      const err = new ForbiddenError('Read-only access');
      expect(err.httpStatus).toBe(HTTP_STATUS.FORBIDDEN);
      expect(err.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('forbidden custom message', () => {
      const err = new ForbiddenError('Contract actions require elevated permissions');
      expect(err.message).toContain('Contract actions');
    });
  });

  // ============================================================
  // Scenario 5: Internal server error → HTTP 500
  // ============================================================
  describe('Scenario 5: Internal server error (500)', () => {
    it('internal error returns 500', () => {
      const err = new InternalError();
      expect(err.httpStatus).toBe(HTTP_STATUS.INTERNAL_ERROR);
      expect(err.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should have generic message without leaking internals', () => {
      const err = new InternalError();
      // Default message is generic
      expect(err.message).not.toContain('stack trace');
      expect(err.message).not.toContain('node_modules');
    });

    it('custom message for internal errors', () => {
      const err = new InternalError('Database connection pool exhausted', { retryAfter: 30 });
      expect(err.httpStatus).toBe(500);
      // Message can be specific, but no stack leaked via OData
    });

    it('OData response should not expose stack trace', () => {
      const err = new InternalError('Something went wrong');
      const odata = err.toODataError() as Record<string, Record<string, unknown>>;
      const inner = JSON.stringify(odata);
      expect(inner).not.toContain('at Object.');
    });
  });

  // ============================================================
  // Error Hierarchy and Type Guards
  // ============================================================
  describe('Error hierarchy and type guards', () => {
    it('all custom errors are SapCardanoError instances', () => {
      const errors = [
        new ValidationError('test'),
        new ResourceNotFoundError('X', 'y'),
        new BlockchainConnectivityError('bf', 'err'),
        new TimeoutError('bf', 5000),
        new UnauthorizedError(),
        new ForbiddenError(),
        new InternalError(),
        new InvalidAddressError('x'),
        new InvalidTxHashError('y'),
        new ContractValidationError('contract', 'msg'),
      ];

      for (const err of errors) {
        expect(err instanceof SapCardanoError).toBe(true);
        expect(isSapCardanoError(err)).toBe(true);
      }
    });

    it('plain Error is not a SapCardanoError', () => {
      expect(isSapCardanoError(new Error('plain'))).toBe(false);
    });

    it('null is not a SapCardanoError', () => {
      expect(isSapCardanoError(null)).toBe(false);
    });
  });
});
