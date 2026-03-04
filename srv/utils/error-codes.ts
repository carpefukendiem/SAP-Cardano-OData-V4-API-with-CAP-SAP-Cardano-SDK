// SAP-Cardano Error Codes
// Maps to OData 4.0 error code conventions

export enum ErrorCode {
  // Validation errors (4xx)
  VALIDATION_ERROR = 'SAP-CARDANO-001',
  INVALID_ADDRESS = 'SAP-CARDANO-002',
  INVALID_TX_HASH = 'SAP-CARDANO-003',
  INVALID_NETWORK = 'SAP-CARDANO-004',
  INVALID_PARAMETER = 'SAP-CARDANO-005',

  // Resource errors
  RESOURCE_NOT_FOUND = 'SAP-CARDANO-010',

  // Authentication/Authorization
  UNAUTHORIZED = 'SAP-CARDANO-020',
  FORBIDDEN = 'SAP-CARDANO-021',

  // Blockchain connectivity
  BLOCKCHAIN_UNAVAILABLE = 'SAP-CARDANO-030',
  TIMEOUT = 'SAP-CARDANO-031',
  ALL_PROVIDERS_FAILED = 'SAP-CARDANO-032',

  // Smart contract errors
  CONTRACT_VALIDATION_ERROR = 'SAP-CARDANO-040',
  CONTRACT_STATE_ERROR = 'SAP-CARDANO-041',
  CONTRACT_BUILD_ERROR = 'SAP-CARDANO-042',

  // Server errors
  INTERNAL_ERROR = 'SAP-CARDANO-050',
}

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * Map error codes to human-readable descriptions
 */
export const ERROR_DESCRIPTIONS: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_ERROR]: 'Input validation failed',
  [ErrorCode.INVALID_ADDRESS]: 'Invalid Cardano address format',
  [ErrorCode.INVALID_TX_HASH]: 'Invalid transaction hash format (must be 64 hex chars)',
  [ErrorCode.INVALID_NETWORK]: 'Invalid network identifier',
  [ErrorCode.INVALID_PARAMETER]: 'Invalid request parameter',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'Requested resource not found on the blockchain',
  [ErrorCode.UNAUTHORIZED]: 'Authentication credentials required',
  [ErrorCode.FORBIDDEN]: 'Insufficient permissions for this operation',
  [ErrorCode.BLOCKCHAIN_UNAVAILABLE]: 'Cardano blockchain provider is unavailable',
  [ErrorCode.TIMEOUT]: 'Blockchain provider request timed out',
  [ErrorCode.ALL_PROVIDERS_FAILED]: 'All configured blockchain providers failed',
  [ErrorCode.CONTRACT_VALIDATION_ERROR]: 'Smart contract datum/redeemer validation failed',
  [ErrorCode.CONTRACT_STATE_ERROR]: 'Smart contract state conflict',
  [ErrorCode.CONTRACT_BUILD_ERROR]: 'Failed to build unsigned transaction',
  [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
};
