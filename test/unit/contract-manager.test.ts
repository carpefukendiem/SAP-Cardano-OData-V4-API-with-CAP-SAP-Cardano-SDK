import { ContractManager } from '../../srv/blockchain/contract-manager';
import {
  ContractValidationError,
  InvalidAddressError,
  ValidationError,
} from '../../srv/utils/errors';

describe('ContractManager', () => {
  let manager: ContractManager;

  beforeEach(() => {
    manager = new ContractManager();
  });

  // ============================================================
  // Supply Chain
  // ============================================================
  describe('initSupplyChain', () => {
    const validParams = {
      sapDocumentId: 'PO-2024-001',
      sapSystemId: 'PRD',
      productCode: 'STEEL-BEAM-A',
      productDescription: 'Grade A Steel Beam',
      quantity: 100,
      unitOfMeasure: 'KG',
      originAddress: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1',
      destinationAddress: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t2',
      network: 'preview' as const,
    };

    it('should return a ContractActionResult with unsignedTxCbor', async () => {
      const result = await manager.initSupplyChain(validParams);
      expect(result.success).toBe(true);
      expect(result.unsignedTxCbor).toBeTruthy();
      expect(result.contractAddress).toBeTruthy();
      expect(result.network).toBe('preview');
    });

    it('should include SAP document ID in message', async () => {
      const result = await manager.initSupplyChain(validParams);
      expect(result.message).toContain('PO-2024-001');
    });

    it('should throw on invalid SAP document ID', async () => {
      await expect(
        manager.initSupplyChain({ ...validParams, sapDocumentId: 'A'.repeat(36) })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw on invalid SAP system ID', async () => {
      await expect(
        manager.initSupplyChain({ ...validParams, sapSystemId: 'TOOLONG' })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw on invalid origin address', async () => {
      await expect(
        manager.initSupplyChain({ ...validParams, originAddress: 'not-an-address' })
      ).rejects.toThrow(InvalidAddressError);
    });

    it('should throw on zero quantity', async () => {
      await expect(
        manager.initSupplyChain({ ...validParams, quantity: 0 })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should throw on negative quantity', async () => {
      await expect(
        manager.initSupplyChain({ ...validParams, quantity: -5 })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should throw on empty product code', async () => {
      await expect(
        manager.initSupplyChain({ ...validParams, productCode: '' })
      ).rejects.toThrow(ContractValidationError);
    });
  });

  // ============================================================
  // Supply Chain Status Update
  // ============================================================
  describe('updateSupplyChainStatus', () => {
    const validParams = {
      sapDocumentId: 'PO-2024-001',
      newStatus: 'Dispatched',
      locationCode: 'DEHAM',
      locationName: 'Hamburg Port',
      latitude: 53.55,
      longitude: 9.99,
      handlerPubKey: 'abc123',
      network: 'preview' as const,
    };

    it('should succeed with valid status transition', async () => {
      const result = await manager.updateSupplyChainStatus(validParams);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Dispatched');
    });

    it('should throw on invalid status', async () => {
      await expect(
        manager.updateSupplyChainStatus({ ...validParams, newStatus: 'Flying' })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should throw on invalid location code (not 5 chars)', async () => {
      await expect(
        manager.updateSupplyChainStatus({ ...validParams, locationCode: 'DE' })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should accept all valid statuses', async () => {
      const validStatuses = ['Dispatched', 'InTransit', 'UnderInspection', 'Cleared', 'Received', 'Rejected'];
      for (const status of validStatuses) {
        const result = await manager.updateSupplyChainStatus({
          ...validParams,
          newStatus: status,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  // ============================================================
  // ESG Credits
  // ============================================================
  describe('issueEsgCredit', () => {
    const validParams = {
      creditType: 'CarbonCredit',
      beneficiaryAddress: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1',
      amount: 1_000_000,
      unit: 'kgCO2e',
      vintageYear: 2023,
      verificationStandard: 'VCS',
      verificationBody: 'DNV-GL',
      projectId: 'VCS-1234',
      projectName: 'Amazon Reforestation',
      countryCode: 'BR',
      sapCostCenter: 'CC-1000',
      network: 'preview' as const,
    };

    it('should issue ESG credit successfully', async () => {
      const result = await manager.issueEsgCredit(validParams);
      expect(result.success).toBe(true);
      expect(result.message).toContain('VCS');
      expect(result.unsignedTxCbor).toBeTruthy();
    });

    it('should throw on zero amount', async () => {
      await expect(
        manager.issueEsgCredit({ ...validParams, amount: 0 })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should throw on invalid vintage year', async () => {
      await expect(
        manager.issueEsgCredit({ ...validParams, vintageYear: 1980 })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should throw on invalid beneficiary address', async () => {
      await expect(
        manager.issueEsgCredit({ ...validParams, beneficiaryAddress: 'invalid' })
      ).rejects.toThrow(InvalidAddressError);
    });
  });

  // ============================================================
  // Payment Settlement
  // ============================================================
  describe('createSettlement', () => {
    const validParams = {
      sapInvoiceId: 'INV-90000001',
      sapSystemId: 'PRD',
      parties: [
        {
          address: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1',
          amount: 5_000_000,
          sapPartnerNumber: '0000100001',
        },
        {
          address: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t2',
          amount: 3_000_000,
          sapPartnerNumber: '0000200002',
        },
      ],
      deadline: new Date(Date.now() + 86_400_000),
      network: 'preview' as const,
    };

    it('should create settlement successfully', async () => {
      const result = await manager.createSettlement(validParams);
      expect(result.success).toBe(true);
      expect(result.message).toContain('INV-90000001');
      expect(result.message).toContain('8000000'); // total
    });

    it('should throw on empty parties list', async () => {
      await expect(
        manager.createSettlement({ ...validParams, parties: [] })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw on invalid party address', async () => {
      await expect(
        manager.createSettlement({
          ...validParams,
          parties: [{ address: 'invalid', amount: 5_000_000, sapPartnerNumber: 'V001' }],
        })
      ).rejects.toThrow(InvalidAddressError);
    });

    it('should throw on zero party amount', async () => {
      await expect(
        manager.createSettlement({
          ...validParams,
          parties: [{
            address: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1',
            amount: 0,
            sapPartnerNumber: 'V001',
          }],
        })
      ).rejects.toThrow(ContractValidationError);
    });
  });

  // ============================================================
  // Asset Registry
  // ============================================================
  describe('registerAsset', () => {
    const validParams = {
      sapAssetNumber: '000000001000',
      sapPlant: '1000',
      sapMaterialNumber: 'MAT-100-001',
      ownerAddress: 'addr_test1qxy5s6zp3x2l5km2u3gfhkf6y9t8jx3q2w5nv1m8r4p7e6d9k3s2t1',
      quantity: 100,
      network: 'preview' as const,
    };

    it('should register asset successfully', async () => {
      const result = await manager.registerAsset(validParams);
      expect(result.success).toBe(true);
      expect(result.message).toContain('000000001000');
    });

    it('should throw on invalid owner address', async () => {
      await expect(
        manager.registerAsset({ ...validParams, ownerAddress: 'bad-addr' })
      ).rejects.toThrow(InvalidAddressError);
    });

    it('should throw on empty SAP asset number', async () => {
      await expect(
        manager.registerAsset({ ...validParams, sapAssetNumber: '' })
      ).rejects.toThrow(ContractValidationError);
    });

    it('should throw on zero quantity', async () => {
      await expect(
        manager.registerAsset({ ...validParams, quantity: 0 })
      ).rejects.toThrow(ContractValidationError);
    });
  });
});
