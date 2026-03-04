// SAP-Cardano Error Classes
// Standardized error hierarchy mapping to OData error codes

import { ErrorCode, HTTP_STATUS } from './error-codes';

/**
 * Base SAP-Cardano error class
 * All errors in this service extend from this
 */
export class SapCardanoError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details?: unknown;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode,
    httpStatus: number,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.timestamp = new Date();
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toODataError(): object {
    return {
      error: {
        code: this.code,
        message: this.message,
        innererror: {
          timestamp: this.timestamp.toISOString(),
          details: this.details,
        },
      },
    };
  }
}

/**
 * 400 Bad Request — invalid input format (OData 4.0 §9.3.1)
 */
export class ValidationError extends SapCardanoError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, details);
  }
}

/**
 * 400 Bad Request — invalid Cardano address format
 */
export class InvalidAddressError extends SapCardanoError {
  constructor(address: string) {
    super(
      `Invalid Cardano address: ${address}`,
      ErrorCode.INVALID_ADDRESS,
      HTTP_STATUS.BAD_REQUEST,
      { address }
    );
  }
}

/**
 * 400 Bad Request — invalid transaction hash format
 */
export class InvalidTxHashError extends SapCardanoError {
  constructor(txHash: string) {
    super(
      `Invalid transaction hash: ${txHash}`,
      ErrorCode.INVALID_TX_HASH,
      HTTP_STATUS.BAD_REQUEST,
      { txHash }
    );
  }
}

/**
 * 404 Not Found — blockchain resource not found
 */
export class ResourceNotFoundError extends SapCardanoError {
  constructor(resource: string, identifier: string) {
    super(
      `${resource} not found: ${identifier}`,
      ErrorCode.RESOURCE_NOT_FOUND,
      HTTP_STATUS.NOT_FOUND,
      { resource, identifier }
    );
  }
}

/**
 * 503 Service Unavailable — Cardano backend connectivity failure
 */
export class BlockchainConnectivityError extends SapCardanoError {
  constructor(provider: string, message: string, details?: unknown) {
    super(
      `Cardano provider '${provider}' unavailable: ${message}. Please retry later.`,
      ErrorCode.BLOCKCHAIN_UNAVAILABLE,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      { provider, details }
    );
  }
}

/**
 * 504 Gateway Timeout — backend request timed out
 */
export class TimeoutError extends SapCardanoError {
  constructor(provider: string, timeoutMs: number) {
    super(
      `Request to '${provider}' timed out after ${timeoutMs}ms.`,
      ErrorCode.TIMEOUT,
      HTTP_STATUS.GATEWAY_TIMEOUT,
      { provider, timeoutMs }
    );
  }
}

/**
 * 401 Unauthorized — missing or invalid authentication
 */
export class UnauthorizedError extends SapCardanoError {
  constructor(message = 'Authentication required') {
    super(message, ErrorCode.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
  }
}

/**
 * 403 Forbidden — insufficient permissions
 */
export class ForbiddenError extends SapCardanoError {
  constructor(message = 'Insufficient permissions') {
    super(message, ErrorCode.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }
}

/**
 * 500 Internal Server Error — unexpected server error
 */
export class InternalError extends SapCardanoError {
  constructor(message = 'An unexpected internal error occurred', details?: unknown) {
    super(message, ErrorCode.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_ERROR, details);
  }
}

/**
 * 400 Bad Request — invalid network parameter
 */
export class InvalidNetworkError extends SapCardanoError {
  constructor(network: string) {
    super(
      `Invalid network: '${network}'. Valid values: mainnet, preview, preprod`,
      ErrorCode.INVALID_NETWORK,
      HTTP_STATUS.BAD_REQUEST,
      { network }
    );
  }
}

/**
 * 400 Bad Request — smart contract validation error
 */
export class ContractValidationError extends SapCardanoError {
  constructor(contract: string, message: string, details?: unknown) {
    super(
      `Contract validation failed for '${contract}': ${message}`,
      ErrorCode.CONTRACT_VALIDATION_ERROR,
      HTTP_STATUS.BAD_REQUEST,
      { contract, details }
    );
  }
}

/**
 * 409 Conflict — contract state conflict
 */
export class ContractStateError extends SapCardanoError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.CONTRACT_STATE_ERROR, HTTP_STATUS.CONFLICT, details);
  }
}

/**
 * All providers failed (primary + fallback)
 */
export class AllProvidersFailedError extends BlockchainConnectivityError {
  constructor(errors: Error[]) {
    super(
      'all-providers',
      'All blockchain providers failed',
      { errors: errors.map((e) => ({ message: e.message, name: e.name })) }
    );
  }
}

/**
 * Type guard to check if error is a SapCardanoError
 */
export function isSapCardanoError(error: unknown): error is SapCardanoError {
  return error instanceof SapCardanoError;
}
