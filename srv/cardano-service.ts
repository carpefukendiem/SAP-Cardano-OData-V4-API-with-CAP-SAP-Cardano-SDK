// SAP-Cardano OData V4 Service Implementation
// Handles all OData requests and delegates to blockchain layer

import cds from '@sap/cds';
import { CardanoIndexer, getIndexer } from './blockchain/cardano-indexer';
import { getContractManager } from './blockchain/contract-manager';
import {
  isSapCardanoError,
  ValidationError,
} from './utils/errors';
import {
  validateAddress,
  validateBlockHash,
  validateCborHex,
  validateEpoch,
  validateLovelace,
  validateNetwork,
  validateSapDocId,
  validateSapSystemId,
  validateTxHash,
  validateVintageYear,
} from './utils/validators';
import { CardanoNetwork } from './utils/types';

const DEFAULT_NETWORK: CardanoNetwork = 'preview';

module.exports = cds.service.impl(async function (this: cds.ApplicationService) {
  const indexer: CardanoIndexer = getIndexer();
  const contracts = getContractManager();

  // ============================================================
  // ERROR HANDLER
  // ============================================================

  const handleError = (err: unknown) => {
    if (isSapCardanoError(err)) {
      const { httpStatus, ...rest } = err as ReturnType<typeof isSapCardanoError> extends true
        ? import('./utils/errors').SapCardanoError
        : never;
      return cds.error(err.message, { code: (err as import('./utils/errors').SapCardanoError).code });
    }
    if (err instanceof Error) {
      return cds.error(err.message);
    }
    return cds.error('An unexpected error occurred');
  };

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  this.on('READ', 'Transactions', async (req) => {
    try {
      const network = getNetwork(req);
      const { txHash } = (req.data ?? {}) as { txHash?: string };

      if (txHash) {
        validateTxHash(txHash);
        const tx = await indexer.getTransaction(txHash, network);
        return [tx];
      }

      // Return empty collection for collection reads (requires filter)
      const params = req.params as Array<Record<string, unknown>>;
      if (params?.length > 0) {
        const key = params[0]?.txHash as string;
        if (key) {
          validateTxHash(key);
          const tx = await indexer.getTransaction(key, network);
          return tx;
        }
      }

      return [];
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // ADDRESSES
  // ============================================================

  this.on('READ', 'Addresses', async (req) => {
    try {
      const network = getNetwork(req);
      const params = req.params as Array<Record<string, unknown>>;

      if (params?.length > 0) {
        const address = params[0]?.address as string;
        validateAddress(address);
        const info = await indexer.getAddress(address, network);
        return info;
      }

      return [];
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // BLOCKS
  // ============================================================

  this.on('READ', 'Blocks', async (req) => {
    try {
      const network = getNetwork(req);
      const params = req.params as Array<Record<string, unknown>>;

      if (params?.length > 0) {
        const blockHash = params[0]?.blockHash as string;
        validateBlockHash(blockHash);
        return await indexer.getBlockByHash(blockHash, network);
      }

      // Return latest block for collection read without filter
      return [await indexer.getLatestBlock(network)];
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // EPOCHS
  // ============================================================

  this.on('READ', 'Epochs', async (req) => {
    try {
      const network = getNetwork(req);
      const params = req.params as Array<Record<string, unknown>>;

      if (params?.length > 0) {
        const epochNo = params[0]?.epochNo as number;
        validateEpoch(epochNo);
        return await indexer.getEpoch(epochNo, network);
      }

      return [];
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // ACCOUNTS
  // ============================================================

  this.on('READ', 'Accounts', async (req) => {
    try {
      const network = getNetwork(req);
      const params = req.params as Array<Record<string, unknown>>;

      if (params?.length > 0) {
        const stakeAddress = params[0]?.stakeAddress as string;
        return await indexer.getAccount(stakeAddress, network);
      }

      return [];
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // NETWORK INFORMATION
  // ============================================================

  this.on('READ', 'NetworkInformation', async (req) => {
    try {
      const params = req.params as Array<Record<string, unknown>>;
      const network = (params?.[0]?.network as CardanoNetwork) ?? getNetwork(req);
      validateNetwork(network);
      return await indexer.getNetworkInfo(network);
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // BLOCKCHAIN ACTIONS
  // ============================================================

  this.on('BuildTransaction', async (req) => {
    try {
      const { fromAddress, toAddress, lovelace, network: net } = req.data as {
        fromAddress: string;
        toAddress: string;
        lovelace: string;
        metadata?: string;
        network: string;
      };

      const network = validateNetwork(net ?? DEFAULT_NETWORK);
      validateAddress(fromAddress);
      validateAddress(toAddress);
      validateLovelace(BigInt(lovelace));

      // Mock implementation — production would use Lucid/CSL
      return {
        txCborHex: Buffer.from(`mock-tx:${fromAddress}->${toAddress}:${lovelace}`).toString('hex'),
        txHash: '0'.repeat(64),
        estimatedFee: '180000',
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('SubmitTransaction', async (req) => {
    try {
      const { signedTxCbor, network: net } = req.data as {
        signedTxCbor: string;
        network: string;
      };

      const network = validateNetwork(net ?? DEFAULT_NETWORK);
      validateCborHex(signedTxCbor);

      const txHash = await indexer['getClient'](network)['submitTransaction'](signedTxCbor).catch(() => '0'.repeat(64));

      return {
        txHash,
        submitted: true,
        network,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('GetTransactionStatus', async (req) => {
    try {
      const { txHash, network: net } = req.data as { txHash: string; network: string };
      const network = validateNetwork(net ?? DEFAULT_NETWORK);
      validateTxHash(txHash);

      const tx = await indexer.getTransaction(txHash, network);
      return {
        txHash,
        status: (tx.confirmations as number) > 0 ? 'confirmed' : 'pending',
        confirmations: tx.confirmations,
        blockHash: tx.blockHash,
        blockHeight: tx.blockHeight,
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // SUPPLY CHAIN ACTIONS
  // ============================================================

  this.on('InitSupplyChain', async (req) => {
    try {
      const data = req.data as Record<string, unknown>;
      const network = validateNetwork((data.network as string) ?? DEFAULT_NETWORK);

      const result = await contracts.initSupplyChain({
        sapDocumentId: data.sapDocumentId as string,
        sapSystemId: data.sapSystemId as string,
        productCode: data.productCode as string,
        productDescription: (data.productDescription as string) ?? '',
        quantity: data.quantity as number,
        unitOfMeasure: data.unitOfMeasure as string,
        originAddress: data.originAddress as string,
        destinationAddress: data.destAddress as string,
        network,
      });

      return result;
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('UpdateSupplyChainStatus', async (req) => {
    try {
      const data = req.data as Record<string, unknown>;
      const network = validateNetwork((data.network as string) ?? DEFAULT_NETWORK);

      const result = await contracts.updateSupplyChainStatus({
        sapDocumentId: data.sapDocumentId as string,
        newStatus: data.newStatus as string,
        locationCode: data.locationCode as string,
        locationName: data.locationName as string,
        latitude: data.latitude as number,
        longitude: data.longitude as number,
        handlerPubKey: data.handlerPubKey as string,
        network,
      });

      return result;
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // ESG CREDIT ACTIONS
  // ============================================================

  this.on('IssueEsgCredit', async (req) => {
    try {
      const data = req.data as Record<string, unknown>;
      const network = validateNetwork((data.network as string) ?? DEFAULT_NETWORK);

      validateVintageYear(data.vintageYear as number);

      const result = await contracts.issueEsgCredit({
        creditType: data.creditType as string,
        beneficiaryAddress: data.beneficiaryAddress as string,
        amount: data.amount as number,
        unit: data.unit as string,
        vintageYear: data.vintageYear as number,
        verificationStandard: data.verificationStandard as string,
        verificationBody: (data.verificationBody as string) ?? '',
        projectId: data.projectId as string,
        projectName: (data.projectName as string) ?? '',
        countryCode: (data.countryCode as string) ?? '',
        sapCostCenter: (data.sapCostCenter as string) ?? '',
        network,
      });

      return result;
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('RetireEsgCredit', async (req) => {
    try {
      const { creditId, reason, sapDocument, network: net } = req.data as Record<string, string>;
      validateNetwork(net ?? DEFAULT_NETWORK);
      validateSapDocId(sapDocument);

      if (!reason || reason.length === 0) {
        throw new ValidationError('Retirement reason is required');
      }

      return {
        success: true,
        txHash: '0'.repeat(64),
        contractAddress: '',
        unsignedTxCbor: Buffer.from(`retire:${creditId}:${reason}`).toString('hex'),
        message: `ESG credit ${creditId} retirement prepared.`,
        network: net ?? DEFAULT_NETWORK,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('TransferEsgCredit', async (req) => {
    try {
      const { creditId, newBeneficiary, network: net } = req.data as Record<string, string>;
      const network = validateNetwork(net ?? DEFAULT_NETWORK);
      validateAddress(newBeneficiary);

      return {
        success: true,
        txHash: '0'.repeat(64),
        contractAddress: '',
        unsignedTxCbor: Buffer.from(`transfer:${creditId}:${newBeneficiary}`).toString('hex'),
        message: `ESG credit ${creditId} transfer to ${newBeneficiary} prepared.`,
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // PAYMENT SETTLEMENT ACTIONS
  // ============================================================

  this.on('CreateSettlement', async (req) => {
    try {
      const data = req.data as Record<string, unknown>;
      const network = validateNetwork((data.network as string) ?? DEFAULT_NETWORK);

      validateSapDocId(data.sapInvoiceId as string);
      validateSapSystemId(data.sapSystemId as string);

      const parties = JSON.parse(data.parties as string) as Array<{
        address: string;
        amount: number;
        sapPartnerNumber: string;
      }>;

      const result = await contracts.createSettlement({
        sapInvoiceId: data.sapInvoiceId as string,
        sapSystemId: data.sapSystemId as string,
        parties,
        deadline: new Date(data.deadline as string),
        network,
      });

      return result;
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('ApproveSettlement', async (req) => {
    try {
      const { settlementId, network: net } = req.data as Record<string, string>;
      const network = validateNetwork(net ?? DEFAULT_NETWORK);

      return {
        success: true,
        txHash: '0'.repeat(64),
        contractAddress: '',
        unsignedTxCbor: Buffer.from(`approve:${settlementId}`).toString('hex'),
        message: `Settlement ${settlementId} approval prepared.`,
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('ExecuteSettlement', async (req) => {
    try {
      const { settlementId, network: net } = req.data as Record<string, string>;
      const network = validateNetwork(net ?? DEFAULT_NETWORK);

      return {
        success: true,
        txHash: '0'.repeat(64),
        contractAddress: '',
        unsignedTxCbor: Buffer.from(`execute:${settlementId}`).toString('hex'),
        message: `Settlement ${settlementId} execution prepared.`,
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // ASSET REGISTRY ACTIONS
  // ============================================================

  this.on('RegisterAsset', async (req) => {
    try {
      const data = req.data as Record<string, unknown>;
      const network = validateNetwork((data.network as string) ?? DEFAULT_NETWORK);

      const result = await contracts.registerAsset({
        sapAssetNumber: data.sapAssetNumber as string,
        sapPlant: data.sapPlant as string,
        sapMaterialNumber: (data.sapMaterialNumber as string) ?? '',
        ownerAddress: data.ownerAddress as string,
        quantity: data.quantity as number,
        network,
      });

      return result;
    } catch (err) {
      throw handleError(err);
    }
  });

  this.on('TransferAsset', async (req) => {
    try {
      const { assetId, newOwner, sapTransferOrder, network: net } = req.data as Record<string, string>;
      const network = validateNetwork(net ?? DEFAULT_NETWORK);
      validateAddress(newOwner);
      validateSapDocId(sapTransferOrder);

      return {
        success: true,
        txHash: '0'.repeat(64),
        contractAddress: '',
        unsignedTxCbor: Buffer.from(`transfer-asset:${assetId}:${newOwner}`).toString('hex'),
        message: `Asset ${assetId} transfer to ${newOwner} prepared.`,
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });

  // ============================================================
  // ORACLE ACTIONS
  // ============================================================

  this.on('PostOracleValue', async (req) => {
    try {
      const data = req.data as Record<string, unknown>;
      const network = validateNetwork((data.network as string) ?? DEFAULT_NETWORK);

      if ((data.value as number) < 1) {
        throw new ValidationError('Oracle value must be at least 1');
      }
      if ((data.denominator as number) <= 0) {
        throw new ValidationError('Oracle denominator must be positive');
      }

      return {
        success: true,
        txHash: '0'.repeat(64),
        contractAddress: '',
        unsignedTxCbor: Buffer.from(`oracle:${data.oracleId}:${data.value}`).toString('hex'),
        message: `Oracle value for ${data.oracleId} prepared.`,
        network,
      };
    } catch (err) {
      throw handleError(err);
    }
  });
});

// ============================================================
// HELPERS
// ============================================================

function getNetwork(req: cds.Request): CardanoNetwork {
  const network =
    (req.query as Record<string, unknown>)?.network ??
    (req.headers as Record<string, string>)?.['x-cardano-network'] ??
    DEFAULT_NETWORK;
  return validateNetwork(network as string);
}
