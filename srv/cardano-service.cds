using { sap.cardano as db } from '../db/schema';

/**
 * SAP-Cardano OData V4 Service
 * Exposes Cardano blockchain data and smart contract operations via OData V4
 */
service CardanoODataService @(path: '/odata/v4/cardano-odata') {

  // ============================================================
  // BLOCKCHAIN READ ENTITIES
  // ============================================================

  @readonly
  entity Transactions as projection on db.Transactions
    actions {
      // Get transaction by hash via navigation
    };

  @readonly
  entity TransactionInputs as projection on db.TransactionInputs;

  @readonly
  entity TransactionOutputs as projection on db.TransactionOutputs;

  @readonly
  entity TransactionMetadata as projection on db.TransactionMetadata;

  @readonly
  entity Addresses as projection on db.Addresses;

  @readonly
  entity AddressAssets as projection on db.AddressAssets;

  @readonly
  entity Blocks as projection on db.Blocks;

  @readonly
  entity Epochs as projection on db.Epochs;

  @readonly
  entity Accounts as projection on db.Accounts;

  @readonly
  entity NetworkInformation as projection on db.NetworkInformation;

  // ============================================================
  // SAP SMART CONTRACT ENTITIES
  // ============================================================

  entity SupplyChainEvents as projection on db.SupplyChainEvents;
  entity SupplyChainCheckpoints as projection on db.SupplyChainCheckpoints;

  entity EsgCredits as projection on db.EsgCredits;

  entity PaymentSettlements as projection on db.PaymentSettlements;
  entity SettlementParties as projection on db.SettlementParties;

  entity AssetRegistry as projection on db.AssetRegistry;

  entity OracleData as projection on db.OracleData;

  // ============================================================
  // VIEWS
  // ============================================================

  @readonly
  entity ActiveSupplyChain as projection on db.ActiveSupplyChain;

  @readonly
  entity ActiveEsgCredits as projection on db.ActiveEsgCredits;

  // ============================================================
  // BLOCKCHAIN ACTIONS (write operations)
  // ============================================================

  /**
   * Build an unsigned Cardano transaction
   * Returns CBOR hex for external signing
   */
  action BuildTransaction(
    fromAddress : String,
    toAddress   : String,
    lovelace    : Integer64,
    metadata    : LargeString,  // JSON metadata
    network     : String        // mainnet | preview | preprod
  ) returns TransactionBuildResult;

  /**
   * Submit a signed transaction to the Cardano network
   */
  action SubmitTransaction(
    signedTxCbor : String,      // signed CBOR hex
    network      : String
  ) returns TransactionSubmitResult;

  /**
   * Get transaction status from the mempool or chain
   */
  function GetTransactionStatus(
    txHash  : String,
    network : String
  ) returns TransactionStatusResult;

  // ============================================================
  // SUPPLY CHAIN ACTIONS
  // ============================================================

  /**
   * Initialize a new supply chain event on Cardano
   */
  action InitSupplyChain(
    sapDocumentId  : String,
    sapSystemId    : String,
    productCode    : String,
    quantity       : Decimal,
    unitOfMeasure  : String,
    originAddress  : String,
    destAddress    : String,
    network        : String
  ) returns ContractActionResult;

  /**
   * Update supply chain status (e.g., dispatch, receive)
   */
  action UpdateSupplyChainStatus(
    sapDocumentId : String,
    newStatus     : String,
    locationCode  : String,
    locationName  : String,
    latitude      : Decimal,
    longitude     : Decimal,
    handlerPubKey : String,
    network       : String
  ) returns ContractActionResult;

  // ============================================================
  // ESG CREDIT ACTIONS
  // ============================================================

  /**
   * Issue a new ESG credit on Cardano
   */
  action IssueEsgCredit(
    creditType           : String,
    beneficiaryAddress   : String,
    amount               : Integer64,
    unit                 : String,
    vintageYear          : Integer,
    verificationStandard : String,
    projectId            : String,
    sapCostCenter        : String,
    network              : String
  ) returns ContractActionResult;

  /**
   * Retire an ESG credit (permanent offset)
   */
  action RetireEsgCredit(
    creditId    : String,
    reason      : String,
    sapDocument : String,
    network     : String
  ) returns ContractActionResult;

  /**
   * Transfer ESG credit to new beneficiary
   */
  action TransferEsgCredit(
    creditId       : String,
    newBeneficiary : String,
    network        : String
  ) returns ContractActionResult;

  // ============================================================
  // PAYMENT SETTLEMENT ACTIONS
  // ============================================================

  /**
   * Create a new multi-party payment settlement
   */
  action CreateSettlement(
    sapInvoiceId : String,
    sapSystemId  : String,
    parties      : LargeString,  // JSON array of {address, amount, sapPartnerNumber}
    deadline     : Timestamp,
    network      : String
  ) returns ContractActionResult;

  /**
   * Approve a payment settlement (must be called by each party)
   */
  action ApproveSettlement(
    settlementId : String,
    signerPubKey : String,
    network      : String
  ) returns ContractActionResult;

  /**
   * Execute an approved settlement
   */
  action ExecuteSettlement(
    settlementId : String,
    network      : String
  ) returns ContractActionResult;

  // ============================================================
  // ASSET REGISTRY ACTIONS
  // ============================================================

  /**
   * Register a new tokenized SAP asset on Cardano
   */
  action RegisterAsset(
    sapAssetNumber     : String,
    sapPlant           : String,
    sapMaterialNumber  : String,
    ownerAddress       : String,
    quantity           : Integer64,
    network            : String
  ) returns ContractActionResult;

  /**
   * Transfer a tokenized asset to a new owner
   */
  action TransferAsset(
    assetId           : String,
    newOwner          : String,
    sapTransferOrder  : String,
    network           : String
  ) returns ContractActionResult;

  // ============================================================
  // ORACLE ACTIONS
  // ============================================================

  /**
   * Post an oracle value from SAP
   */
  action PostOracleValue(
    oracleId    : String,
    sapSystemId : String,
    dataType    : String,
    value       : Integer64,
    denominator : Integer64,
    validFrom   : Timestamp,
    validUntil  : Timestamp,
    network     : String
  ) returns ContractActionResult;

  // ============================================================
  // RETURN TYPES
  // ============================================================

  type TransactionBuildResult {
    txCborHex    : String;
    txHash       : String;
    estimatedFee : Integer64;
    network      : String;
  }

  type TransactionSubmitResult {
    txHash      : String;
    submitted   : Boolean;
    network     : String;
    timestamp   : Timestamp;
  }

  type TransactionStatusResult {
    txHash        : String;
    status        : String;  // pending | confirmed | failed
    confirmations : Integer;
    blockHash     : String;
    blockHeight   : Integer64;
    network       : String;
  }

  type ContractActionResult {
    success         : Boolean;
    txHash          : String;
    contractAddress : String;
    unsignedTxCbor  : String;
    message         : String;
    network         : String;
  }
}
