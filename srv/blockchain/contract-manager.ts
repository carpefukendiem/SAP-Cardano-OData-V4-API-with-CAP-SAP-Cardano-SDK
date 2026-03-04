// Contract Manager — builds unsigned transactions for Aiken smart contracts
// Generates CBOR for external signing before on-chain submission

import { CardanoNetwork } from '../utils/types';
import {
  ContractValidationError,
  ValidationError,
} from '../utils/errors';
import {
  validateAddress,
  validateSapDocId,
  validateSapSystemId,
} from '../utils/validators';

// Contract addresses per network (updated after deployment)
export const CONTRACT_ADDRESSES: Record<string, Record<CardanoNetwork, string>> = {
  supply_chain_tracker: {
    mainnet: '',
    preview: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5g4k4x9z',
    preprod: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5g4k4x9z',
  },
  esg_compliance: {
    mainnet: '',
    preview: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5esgxxx',
    preprod: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5esgxxx',
  },
  payment_settlement: {
    mainnet: '',
    preview: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5payxxx',
    preprod: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5payxxx',
  },
  asset_registry: {
    mainnet: '',
    preview: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5astxxx',
    preprod: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5astxxx',
  },
  sap_oracle: {
    mainnet: '',
    preview: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5orcxxx',
    preprod: 'addr_test1wqsc8cqm7ejdvdmvzpxlhutv3r3yy0qzq3zd9h7tnt0yt5orcxxx',
  },
};

export interface ContractActionResult {
  success: boolean;
  txHash: string;
  contractAddress: string;
  unsignedTxCbor: string;
  message: string;
  network: CardanoNetwork;
}

export interface InitSupplyChainParams {
  sapDocumentId: string;
  sapSystemId: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  unitOfMeasure: string;
  originAddress: string;
  destinationAddress: string;
  network: CardanoNetwork;
}

export interface UpdateSupplyChainParams {
  sapDocumentId: string;
  newStatus: string;
  locationCode: string;
  locationName: string;
  latitude: number;
  longitude: number;
  handlerPubKey: string;
  network: CardanoNetwork;
}

export interface IssueEsgCreditParams {
  creditType: string;
  beneficiaryAddress: string;
  amount: number;
  unit: string;
  vintageYear: number;
  verificationStandard: string;
  verificationBody: string;
  projectId: string;
  projectName: string;
  countryCode: string;
  sapCostCenter: string;
  network: CardanoNetwork;
}

export interface CreateSettlementParams {
  sapInvoiceId: string;
  sapSystemId: string;
  parties: Array<{
    address: string;
    amount: number;
    sapPartnerNumber: string;
  }>;
  deadline: Date;
  network: CardanoNetwork;
}

export interface RegisterAssetParams {
  sapAssetNumber: string;
  sapPlant: string;
  sapMaterialNumber: string;
  ownerAddress: string;
  quantity: number;
  network: CardanoNetwork;
}

/**
 * Builds unsigned transaction CBOR for smart contract interactions.
 * Actual signing MUST happen externally (wallet / HSM).
 */
export class ContractManager {
  /**
   * Initialize a supply chain event on Cardano
   * Builds a transaction that creates a new UTxO at the supply chain contract address
   */
  async initSupplyChain(params: InitSupplyChainParams): Promise<ContractActionResult> {
    validateSapDocId(params.sapDocumentId);
    validateSapSystemId(params.sapSystemId);
    validateAddress(params.originAddress);
    validateAddress(params.destinationAddress);

    if (!params.productCode || params.productCode.length === 0) {
      throw new ContractValidationError('supply_chain_tracker', 'Product code is required');
    }
    if (params.quantity <= 0) {
      throw new ContractValidationError('supply_chain_tracker', 'Quantity must be positive');
    }

    const contractAddress = CONTRACT_ADDRESSES.supply_chain_tracker[params.network];
    const datum = this.buildSupplyChainDatum(params);

    // In production: use cardano-serialization-lib or lucid-cardano
    // to build the actual unsigned CBOR transaction
    const unsignedTxCbor = this.buildMockUnsignedTx(contractAddress, datum);

    return {
      success: true,
      txHash: this.computeMockTxHash(params.sapDocumentId),
      contractAddress,
      unsignedTxCbor,
      message: `Supply chain event initialized for SAP document ${params.sapDocumentId}. Sign with your wallet and submit.`,
      network: params.network,
    };
  }

  /**
   * Update supply chain status on-chain
   */
  async updateSupplyChainStatus(params: UpdateSupplyChainParams): Promise<ContractActionResult> {
    validateSapDocId(params.sapDocumentId);

    const validStatuses = ['Dispatched', 'InTransit', 'UnderInspection', 'Cleared', 'Received', 'Rejected'];
    if (!validStatuses.includes(params.newStatus)) {
      throw new ContractValidationError(
        'supply_chain_tracker',
        `Invalid status: ${params.newStatus}. Valid: ${validStatuses.join(', ')}`
      );
    }

    if (params.locationCode.length !== 5) {
      throw new ContractValidationError(
        'supply_chain_tracker',
        'Location code must be exactly 5 characters (IATA/UN LOCODE)'
      );
    }

    const contractAddress = CONTRACT_ADDRESSES.supply_chain_tracker[params.network];
    const redeemer = {
      constructor: 0, // UpdateStatus
      fields: [params.newStatus, params.locationCode, params.locationName],
    };

    const unsignedTxCbor = this.buildMockUnsignedTx(contractAddress, redeemer);

    return {
      success: true,
      txHash: this.computeMockTxHash(params.sapDocumentId + params.newStatus),
      contractAddress,
      unsignedTxCbor,
      message: `Supply chain status update to '${params.newStatus}' prepared. Sign and submit.`,
      network: params.network,
    };
  }

  /**
   * Issue a new ESG credit on Cardano
   */
  async issueEsgCredit(params: IssueEsgCreditParams): Promise<ContractActionResult> {
    validateAddress(params.beneficiaryAddress);

    if (params.amount <= 0) {
      throw new ContractValidationError('esg_compliance', 'Credit amount must be positive');
    }
    if (params.vintageYear < 1990 || params.vintageYear > 2100) {
      throw new ContractValidationError('esg_compliance', 'Vintage year must be between 1990 and 2100');
    }

    const contractAddress = CONTRACT_ADDRESSES.esg_compliance[params.network];
    const creditId = `${params.verificationStandard}-${params.vintageYear}-${params.projectId}`;
    const datum = this.buildEsgDatum(params, creditId);

    const unsignedTxCbor = this.buildMockUnsignedTx(contractAddress, datum);

    return {
      success: true,
      txHash: this.computeMockTxHash(creditId),
      contractAddress,
      unsignedTxCbor,
      message: `ESG credit ${creditId} prepared for issuance. Sign and submit.`,
      network: params.network,
    };
  }

  /**
   * Create a multi-party payment settlement
   */
  async createSettlement(params: CreateSettlementParams): Promise<ContractActionResult> {
    validateSapDocId(params.sapInvoiceId);
    validateSapSystemId(params.sapSystemId);

    if (params.parties.length === 0) {
      throw new ValidationError('Settlement must have at least one party');
    }

    for (const party of params.parties) {
      validateAddress(party.address);
      if (party.amount <= 0) {
        throw new ContractValidationError('payment_settlement', 'Party amount must be positive');
      }
    }

    const totalAmount = params.parties.reduce((sum, p) => sum + p.amount, 0);
    const settlementId = `SET-${params.sapInvoiceId}-${Date.now()}`;
    const contractAddress = CONTRACT_ADDRESSES.payment_settlement[params.network];

    const datum = {
      settlementId,
      sapInvoiceId: params.sapInvoiceId,
      parties: params.parties,
      totalAmount,
      deadline: params.deadline.getTime(),
    };

    const unsignedTxCbor = this.buildMockUnsignedTx(contractAddress, datum);

    return {
      success: true,
      txHash: this.computeMockTxHash(settlementId),
      contractAddress,
      unsignedTxCbor,
      message: `Settlement ${settlementId} for invoice ${params.sapInvoiceId} prepared. Total: ${totalAmount} lovelace.`,
      network: params.network,
    };
  }

  /**
   * Register a SAP asset on Cardano
   */
  async registerAsset(params: RegisterAssetParams): Promise<ContractActionResult> {
    validateAddress(params.ownerAddress);

    if (!params.sapAssetNumber || params.sapAssetNumber.length === 0) {
      throw new ContractValidationError('asset_registry', 'SAP asset number is required');
    }
    if (params.quantity <= 0) {
      throw new ContractValidationError('asset_registry', 'Quantity must be positive');
    }

    const assetId = `ASSET-${params.sapPlant}-${params.sapAssetNumber}`;
    const contractAddress = CONTRACT_ADDRESSES.asset_registry[params.network];

    const datum = {
      assetId,
      sapAssetNumber: params.sapAssetNumber,
      sapPlant: params.sapPlant,
      ownerAddress: params.ownerAddress,
      quantity: params.quantity,
      state: 'Active',
    };

    const unsignedTxCbor = this.buildMockUnsignedTx(contractAddress, datum);

    return {
      success: true,
      txHash: this.computeMockTxHash(assetId),
      contractAddress,
      unsignedTxCbor,
      message: `Asset ${assetId} registration prepared. Sign and submit to register on-chain.`,
      network: params.network,
    };
  }

  // ============================================================
  // DATUM BUILDERS
  // ============================================================

  private buildSupplyChainDatum(params: InitSupplyChainParams): Record<string, unknown> {
    const now = Date.now();
    return {
      constructor: 0,
      fields: [
        params.sapDocumentId,
        params.sapSystemId,
        params.productCode,
        params.productDescription,
        params.quantity,
        params.unitOfMeasure,
        params.originAddress,
        params.destinationAddress,
        { constructor: 0, fields: [] }, // Created status
        [], // empty checkpoints
        {}, // empty metadata
        now, // created_at
        now, // updated_at
        1, // schema_version
      ],
    };
  }

  private buildEsgDatum(params: IssueEsgCreditParams, creditId: string): Record<string, unknown> {
    return {
      constructor: 0,
      fields: [
        creditId,
        { constructor: this.getEsgCreditTypeConstructor(params.creditType), fields: [] },
        params.beneficiaryAddress,
        params.beneficiaryAddress, // issuer = beneficiary for new issuance
        params.amount,
        params.unit,
        params.vintageYear,
        { constructor: this.getVerificationStandardConstructor(params.verificationStandard), fields: [] },
        params.verificationBody,
        params.projectId,
        params.projectName,
        params.countryCode,
        params.sapCostCenter,
        false, // is_retired
        null, // retired_at
        null, // retirement_reason
        {}, // metadata
        1, // schema_version
      ],
    };
  }

  private getEsgCreditTypeConstructor(type: string): number {
    const map: Record<string, number> = {
      CarbonCredit: 0,
      RenewableEnergyCertificate: 1,
      WaterCredit: 2,
      BiodiversityCredit: 3,
      SocialImpact: 4,
    };
    return map[type] ?? 0;
  }

  private getVerificationStandardConstructor(standard: string): number {
    const map: Record<string, number> = {
      VCS: 0,
      GoldStandard: 1,
      CCB: 2,
      SBTi: 3,
    };
    return map[standard] ?? 4; // CustomStandard = 4
  }

  // ============================================================
  // MOCK HELPERS (replace with real CSL/Lucid in production)
  // ============================================================

  private buildMockUnsignedTx(
    contractAddress: string,
    datum: unknown
  ): string {
    // In production, use cardano-serialization-lib or lucid-cardano
    // This returns a mock CBOR hex for development/testing
    const payload = JSON.stringify({ contractAddress, datum });
    return Buffer.from(payload).toString('hex');
  }

  private computeMockTxHash(seed: string): string {
    // In production, compute actual Blake2b-256 hash of the transaction
    const hash = Buffer.from(seed).toString('hex').padEnd(64, '0').slice(0, 64);
    return hash;
  }
}

// Singleton contract manager instance
let _contractManager: ContractManager | null = null;

export function getContractManager(): ContractManager {
  if (!_contractManager) {
    _contractManager = new ContractManager();
  }
  return _contractManager;
}
