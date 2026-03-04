// Input validators for the SAP-Cardano OData service

import { CardanoNetwork } from './types';
import {
  InvalidAddressError,
  InvalidNetworkError,
  InvalidTxHashError,
  ValidationError,
} from './errors';

const TX_HASH_REGEX = /^[0-9a-fA-F]{64}$/;
const BECH32_REGEX = /^(addr|stake)(_test)?1[a-z0-9]+$/;
const BLOCK_HASH_REGEX = /^[0-9a-fA-F]{64}$/;
const POLICY_ID_REGEX = /^[0-9a-fA-F]{56}$/;

const VALID_NETWORKS: CardanoNetwork[] = ['mainnet', 'preview', 'preprod'];

// SAP document ID: max 35 chars (per SAP standard)
const SAP_DOC_ID_REGEX = /^[A-Z0-9\-_\/]{1,35}$/i;
// SAP System ID: exactly 3 uppercase chars
const SAP_SYSTEM_ID_REGEX = /^[A-Z0-9]{3}$/;

/**
 * Validate Cardano transaction hash (64 hex chars)
 */
export function validateTxHash(txHash: string): void {
  if (!txHash || !TX_HASH_REGEX.test(txHash)) {
    throw new InvalidTxHashError(txHash);
  }
}

/**
 * Validate Cardano address (bech32 format)
 */
export function validateAddress(address: string): void {
  if (!address || !BECH32_REGEX.test(address)) {
    throw new InvalidAddressError(address);
  }
}

/**
 * Validate Cardano network identifier
 */
export function validateNetwork(network: string): CardanoNetwork {
  if (!VALID_NETWORKS.includes(network as CardanoNetwork)) {
    throw new InvalidNetworkError(network);
  }
  return network as CardanoNetwork;
}

/**
 * Validate block hash (64 hex chars)
 */
export function validateBlockHash(blockHash: string): void {
  if (!blockHash || !BLOCK_HASH_REGEX.test(blockHash)) {
    throw new ValidationError(`Invalid block hash: ${blockHash}`);
  }
}

/**
 * Validate epoch number (non-negative integer)
 */
export function validateEpoch(epoch: number): void {
  if (!Number.isInteger(epoch) || epoch < 0) {
    throw new ValidationError(`Invalid epoch number: ${epoch}`);
  }
}

/**
 * Validate policy ID (56 hex chars)
 */
export function validatePolicyId(policyId: string): void {
  if (!policyId || !POLICY_ID_REGEX.test(policyId)) {
    throw new ValidationError(`Invalid policy ID: ${policyId}`);
  }
}

/**
 * Validate SAP document ID
 */
export function validateSapDocId(docId: string): void {
  if (!docId || !SAP_DOC_ID_REGEX.test(docId)) {
    throw new ValidationError(
      `Invalid SAP document ID: '${docId}'. Must be 1-35 alphanumeric characters.`
    );
  }
}

/**
 * Validate SAP system ID (3-char SID)
 */
export function validateSapSystemId(sid: string): void {
  if (!sid || !SAP_SYSTEM_ID_REGEX.test(sid)) {
    throw new ValidationError(
      `Invalid SAP system ID: '${sid}'. Must be exactly 3 uppercase alphanumeric characters.`
    );
  }
}

/**
 * Validate lovelace amount (positive bigint or number)
 */
export function validateLovelace(amount: bigint | number | string): void {
  const val = typeof amount === 'string' ? BigInt(amount) : BigInt(amount as number);
  if (val <= 0n) {
    throw new ValidationError(`Invalid lovelace amount: ${amount}. Must be positive.`);
  }
  // Max ADA supply: 45 billion ADA = 45_000_000_000_000_000 lovelace
  if (val > 45_000_000_000_000_000n) {
    throw new ValidationError(`Lovelace amount ${amount} exceeds maximum supply.`);
  }
}

/**
 * Validate pagination parameters
 */
export function validatePagination(top?: number, skip?: number): void {
  if (top !== undefined) {
    if (!Number.isInteger(top) || top < 1 || top > 1000) {
      throw new ValidationError(
        `Invalid $top value: ${top}. Must be between 1 and 1000.`
      );
    }
  }
  if (skip !== undefined) {
    if (!Number.isInteger(skip) || skip < 0) {
      throw new ValidationError(`Invalid $skip value: ${skip}. Must be non-negative.`);
    }
  }
}

/**
 * Validate CBOR hex string (for transaction submission)
 */
export function validateCborHex(cbor: string): void {
  if (!cbor || !/^[0-9a-fA-F]+$/.test(cbor) || cbor.length % 2 !== 0) {
    throw new ValidationError(
      'Invalid CBOR hex: must be an even-length hexadecimal string.'
    );
  }
  if (cbor.length < 10) {
    throw new ValidationError('CBOR hex too short to be a valid transaction.');
  }
}

/**
 * Validate vintage year for ESG credits (1990-2100)
 */
export function validateVintageYear(year: number): void {
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new ValidationError(
      `Invalid vintage year: ${year}. Must be between 1990 and 2100.`
    );
  }
}

/**
 * Validate oracle value/denominator pair
 */
export function validateOracleValue(value: number, denominator: number): void {
  if (value < 1) {
    throw new ValidationError(`Oracle value must be at least 1, got: ${value}`);
  }
  if (denominator <= 0) {
    throw new ValidationError(`Oracle denominator must be positive, got: ${denominator}`);
  }
}
