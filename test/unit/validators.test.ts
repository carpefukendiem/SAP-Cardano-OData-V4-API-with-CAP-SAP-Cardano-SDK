import {
  validateAddress,
  validateBlockHash,
  validateCborHex,
  validateEpoch,
  validateLovelace,
  validateNetwork,
  validateOracleValue,
  validatePagination,
  validatePolicyId,
  validateSapDocId,
  validateSapSystemId,
  validateTxHash,
  validateVintageYear,
} from '../../srv/utils/validators';
import {
  InvalidAddressError,
  InvalidNetworkError,
  InvalidTxHashError,
  ValidationError,
} from '../../srv/utils/errors';

describe('Validators', () => {
  // ============================================================
  // Transaction Hash
  // ============================================================
  describe('validateTxHash', () => {
    it('should accept a valid 64-char hex hash', () => {
      expect(() =>
        validateTxHash('a'.repeat(64))
      ).not.toThrow();
    });

    it('should accept mixed case hex', () => {
      expect(() =>
        validateTxHash('aAbBcCdDeEfF0123456789aAbBcCdDeEfF0123456789aAbBcCdDeEfF0123456789AA'.slice(0,64))
      ).not.toThrow();
    });

    it('should reject a hash shorter than 64 chars', () => {
      expect(() => validateTxHash('abc123')).toThrow(InvalidTxHashError);
    });

    it('should reject a hash with non-hex characters', () => {
      expect(() => validateTxHash('z'.repeat(64))).toThrow(InvalidTxHashError);
    });

    it('should reject empty string', () => {
      expect(() => validateTxHash('')).toThrow(InvalidTxHashError);
    });

    it('should reject a hash that is 65 chars', () => {
      expect(() => validateTxHash('a'.repeat(65))).toThrow(InvalidTxHashError);
    });
  });

  // ============================================================
  // Address
  // ============================================================
  describe('validateAddress', () => {
    it('should accept a valid mainnet address', () => {
      expect(() =>
        validateAddress('addr1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1u0v')
      ).not.toThrow();
    });

    it('should accept a valid testnet address', () => {
      expect(() =>
        validateAddress('addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1')
      ).not.toThrow();
    });

    it('should accept a stake address', () => {
      expect(() =>
        validateAddress('stake1ux3g2c9dx2nhhehyrezyxpkstartcqmu9hk63qgfkccw2sqs5afh3')
      ).not.toThrow();
    });

    it('should reject an invalid address', () => {
      expect(() => validateAddress('invalid_address')).toThrow(InvalidAddressError);
    });

    it('should reject empty string', () => {
      expect(() => validateAddress('')).toThrow(InvalidAddressError);
    });

    it('should reject an Ethereum address', () => {
      expect(() =>
        validateAddress('0x742d35Cc6634C0532925a3b8D9fE7f0e56c67891')
      ).toThrow(InvalidAddressError);
    });
  });

  // ============================================================
  // Network
  // ============================================================
  describe('validateNetwork', () => {
    it('should accept mainnet', () => {
      expect(validateNetwork('mainnet')).toBe('mainnet');
    });

    it('should accept preview', () => {
      expect(validateNetwork('preview')).toBe('preview');
    });

    it('should accept preprod', () => {
      expect(validateNetwork('preprod')).toBe('preprod');
    });

    it('should reject unknown network', () => {
      expect(() => validateNetwork('testnet')).toThrow(InvalidNetworkError);
    });

    it('should reject empty string', () => {
      expect(() => validateNetwork('')).toThrow(InvalidNetworkError);
    });
  });

  // ============================================================
  // Lovelace
  // ============================================================
  describe('validateLovelace', () => {
    it('should accept 1 lovelace', () => {
      expect(() => validateLovelace(1n)).not.toThrow();
    });

    it('should accept 1 ADA (1_000_000 lovelace)', () => {
      expect(() => validateLovelace(1_000_000n)).not.toThrow();
    });

    it('should accept maximum supply', () => {
      expect(() => validateLovelace(45_000_000_000_000_000n)).not.toThrow();
    });

    it('should reject 0 lovelace', () => {
      expect(() => validateLovelace(0n)).toThrow(ValidationError);
    });

    it('should reject negative lovelace', () => {
      expect(() => validateLovelace(-1n)).toThrow(ValidationError);
    });

    it('should reject above max supply', () => {
      expect(() => validateLovelace(45_000_000_000_000_001n)).toThrow(ValidationError);
    });

    it('should accept string input', () => {
      expect(() => validateLovelace('5000000')).not.toThrow();
    });
  });

  // ============================================================
  // SAP Document ID
  // ============================================================
  describe('validateSapDocId', () => {
    it('should accept standard SAP document IDs', () => {
      expect(() => validateSapDocId('PO-2024-001')).not.toThrow();
      expect(() => validateSapDocId('4500000001')).not.toThrow();
      expect(() => validateSapDocId('INV-90000001')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateSapDocId('')).toThrow(ValidationError);
    });

    it('should reject strings longer than 35 chars', () => {
      expect(() => validateSapDocId('A'.repeat(36))).toThrow(ValidationError);
    });
  });

  // ============================================================
  // SAP System ID
  // ============================================================
  describe('validateSapSystemId', () => {
    it('should accept valid 3-char SID', () => {
      expect(() => validateSapSystemId('PRD')).not.toThrow();
      expect(() => validateSapSystemId('DEV')).not.toThrow();
      expect(() => validateSapSystemId('QAS')).not.toThrow();
    });

    it('should reject shorter SID', () => {
      expect(() => validateSapSystemId('PR')).toThrow(ValidationError);
    });

    it('should reject longer SID', () => {
      expect(() => validateSapSystemId('PROD')).toThrow(ValidationError);
    });

    it('should reject empty string', () => {
      expect(() => validateSapSystemId('')).toThrow(ValidationError);
    });
  });

  // ============================================================
  // CBOR Hex
  // ============================================================
  describe('validateCborHex', () => {
    it('should accept valid hex string', () => {
      expect(() => validateCborHex('deadbeef1234567890abcdef')).not.toThrow();
    });

    it('should reject odd-length hex', () => {
      expect(() => validateCborHex('abc')).toThrow(ValidationError);
    });

    it('should reject non-hex characters', () => {
      expect(() => validateCborHex('zzzz')).toThrow(ValidationError);
    });

    it('should reject empty string', () => {
      expect(() => validateCborHex('')).toThrow(ValidationError);
    });

    it('should reject very short hex (< 10 chars)', () => {
      expect(() => validateCborHex('abcd')).toThrow(ValidationError);
    });
  });

  // ============================================================
  // Vintage Year (ESG)
  // ============================================================
  describe('validateVintageYear', () => {
    it('should accept years between 1990 and 2100', () => {
      expect(() => validateVintageYear(1990)).not.toThrow();
      expect(() => validateVintageYear(2023)).not.toThrow();
      expect(() => validateVintageYear(2100)).not.toThrow();
    });

    it('should reject years before 1990', () => {
      expect(() => validateVintageYear(1989)).toThrow(ValidationError);
    });

    it('should reject years after 2100', () => {
      expect(() => validateVintageYear(2101)).toThrow(ValidationError);
    });

    it('should reject non-integer year', () => {
      expect(() => validateVintageYear(2023.5)).toThrow(ValidationError);
    });
  });

  // ============================================================
  // Oracle Value
  // ============================================================
  describe('validateOracleValue', () => {
    it('should accept valid value/denominator pair', () => {
      expect(() => validateOracleValue(1_000_000, 1_000_000)).not.toThrow();
    });

    it('should reject value = 0', () => {
      expect(() => validateOracleValue(0, 1_000_000)).toThrow(ValidationError);
    });

    it('should reject negative denominator', () => {
      expect(() => validateOracleValue(1_000_000, -1)).toThrow(ValidationError);
    });

    it('should reject zero denominator', () => {
      expect(() => validateOracleValue(1_000_000, 0)).toThrow(ValidationError);
    });
  });

  // ============================================================
  // Pagination
  // ============================================================
  describe('validatePagination', () => {
    it('should accept valid top and skip', () => {
      expect(() => validatePagination(100, 0)).not.toThrow();
    });

    it('should accept undefined values (no pagination)', () => {
      expect(() => validatePagination()).not.toThrow();
    });

    it('should reject top > 1000', () => {
      expect(() => validatePagination(1001, 0)).toThrow(ValidationError);
    });

    it('should reject top = 0', () => {
      expect(() => validatePagination(0)).toThrow(ValidationError);
    });

    it('should reject negative skip', () => {
      expect(() => validatePagination(10, -1)).toThrow(ValidationError);
    });
  });

  // ============================================================
  // Epoch
  // ============================================================
  describe('validateEpoch', () => {
    it('should accept valid epoch numbers', () => {
      expect(() => validateEpoch(0)).not.toThrow();
      expect(() => validateEpoch(500)).not.toThrow();
    });

    it('should reject negative epoch', () => {
      expect(() => validateEpoch(-1)).toThrow(ValidationError);
    });

    it('should reject non-integer epoch', () => {
      expect(() => validateEpoch(1.5)).toThrow(ValidationError);
    });
  });
});
