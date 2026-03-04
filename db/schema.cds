namespace sap.cardano;

using { cuid, managed, temporal } from '@sap/cds/common';

// ============================================================
// CORE BLOCKCHAIN ENTITIES
// ============================================================

/**
 * Cardano Transaction entity
 * Maps to Cardano transaction data retrieved from indexers
 */
entity Transactions {
  key txHash         : String(64) not null;
  blockHash          : String(64);
  blockHeight        : Integer64;
  blockTime          : Timestamp;
  slot               : Integer64;
  fees               : Integer64;       // lovelace
  totalInput         : Integer64;       // lovelace
  totalOutput        : Integer64;       // lovelace
  size               : Integer;         // bytes
  confirmations      : Integer;
  isValid            : Boolean default true;
  inputs             : Composition of many TransactionInputs on inputs.transaction = $self;
  outputs            : Composition of many TransactionOutputs on outputs.transaction = $self;
  metadata           : Composition of many TransactionMetadata on metadata.transaction = $self;
  network            : String(10) default 'mainnet';
  fetchedAt          : Timestamp;
}

entity TransactionInputs {
  key ID             : UUID;
  transaction        : Association to Transactions;
  txHash             : String(64);
  outputIndex        : Integer;
  address            : String(200);
  lovelace           : Integer64;
  assets             : LargeString;     // JSON array of assets
}

entity TransactionOutputs {
  key ID             : UUID;
  transaction        : Association to Transactions;
  outputIndex        : Integer;
  address            : String(200);
  lovelace           : Integer64;
  datumHash          : String(64);
  inlineDatum        : LargeString;     // CBOR hex or JSON
  scriptRef          : String(64);
  assets             : LargeString;     // JSON array of assets
}

entity TransactionMetadata {
  key ID             : UUID;
  transaction        : Association to Transactions;
  label              : Integer64;
  jsonMetadata       : LargeString;     // JSON
}

/**
 * Cardano Address entity
 * Balance and assets for a Cardano address
 */
entity Addresses {
  key address        : String(200) not null;
  stakeAddress       : String(200);
  lovelace           : Integer64;
  assetCount         : Integer default 0;
  utxoCount          : Integer default 0;
  txCount            : Integer default 0;
  assets             : Composition of many AddressAssets on assets.address = $self;
  network            : String(10) default 'mainnet';
  fetchedAt          : Timestamp;
}

entity AddressAssets {
  key ID             : UUID;
  address            : Association to Addresses;
  policyId           : String(56);
  assetName          : String(64);
  assetNameHex       : String(64);
  quantity           : Integer64;
  fingerprint        : String(44);
}

/**
 * Cardano Block entity
 */
entity Blocks {
  key blockHash      : String(64) not null;
  blockHeight        : Integer64;
  slot               : Integer64;
  epoch              : Integer;
  epochSlot          : Integer;
  blockTime          : Timestamp;
  txCount            : Integer;
  outputLovelace     : Integer64;
  fees               : Integer64;
  size               : Integer;
  slotLeader         : String(56);
  network            : String(10) default 'mainnet';
  fetchedAt          : Timestamp;
}

/**
 * Cardano Epoch entity
 */
entity Epochs {
  key epochNo        : Integer not null;
  startTime          : Timestamp;
  endTime            : Timestamp;
  txCount            : Integer64;
  outputLovelace     : Integer64;
  fees               : Integer64;
  activeStake        : Integer64;
  blockCount         : Integer;
  network            : String(10) default 'mainnet';
  fetchedAt          : Timestamp;
}

/**
 * Cardano Stake Account entity
 */
entity Accounts {
  key stakeAddress   : String(200) not null;
  isRegistered       : Boolean default true;
  lovelace           : Integer64;       // controllable stake
  rewardsSum         : Integer64;       // total rewards earned
  withdrawalsSum     : Integer64;       // total withdrawn
  reservesSum        : Integer64;
  treasurySum        : Integer64;
  withdrawableAmount : Integer64;
  poolId             : String(56);
  poolName           : String(100);
  network            : String(10) default 'mainnet';
  fetchedAt          : Timestamp;
}

/**
 * Cardano Network Information entity
 */
entity NetworkInformation {
  key network        : String(10) not null;
  networkMagic       : Integer;
  currentEpoch       : Integer;
  currentSlot        : Integer64;
  blockHeight        : Integer64;
  circulatingSupply  : Integer64;
  totalSupply        : Integer64;
  activeStake        : Integer64;
  protocolVersion    : String(10);
  fetchedAt          : Timestamp;
}

// ============================================================
// SAP SMART CONTRACT ENTITIES
// ============================================================

/**
 * Supply Chain Event — on-chain supply chain tracking
 */
entity SupplyChainEvents {
  key sapDocumentId  : String(35) not null;
  sapSystemId        : String(3) not null;
  contractAddress    : String(200);
  txHash             : String(64);      // latest contract update tx
  productCode        : String(40);
  productDescription : String(255);
  quantity           : Decimal(13,3);
  unitOfMeasure      : String(3);
  originAddress      : String(200);
  destinationAddress : String(200);
  status             : String(20)       @assert.range enum {
    Created; Dispatched; InTransit; UnderInspection; Cleared; Received; Rejected
  };
  checkpoints        : Composition of many SupplyChainCheckpoints on checkpoints.event = $self;
  network            : String(10) default 'preview';
  createdAt          : Timestamp;
  updatedAt          : Timestamp;
  schemaVersion      : Integer default 1;
}

entity SupplyChainCheckpoints {
  key ID             : UUID;
  event              : Association to SupplyChainEvents;
  locationCode       : String(5);
  locationName       : String(100);
  latitude           : Decimal(10,6);
  longitude          : Decimal(11,6);
  timestamp          : Timestamp;
  handlerAddress     : String(200);
  txHash             : String(64);
}

/**
 * ESG Credit — on-chain carbon and sustainability credits
 */
entity EsgCredits {
  key creditId       : String(50) not null;
  creditType         : String(30)       @assert.range enum {
    CarbonCredit; RenewableEnergyCertificate; WaterCredit; BiodiversityCredit; SocialImpact
  };
  contractAddress    : String(200);
  txHash             : String(64);
  issuerAddress      : String(200);
  beneficiaryAddress : String(200);
  amount             : Integer64;
  unit               : String(10);
  vintageYear        : Integer;
  verificationStandard : String(20);
  verificationBody   : String(100);
  projectId          : String(50);
  projectName        : String(200);
  countryCode        : String(2);
  sapCostCenter      : String(20);
  sapProfitCenter    : String(20);
  sapWbsElement      : String(24);
  isRetired          : Boolean default false;
  retiredAt          : Timestamp;
  retirementReason   : String(500);
  network            : String(10) default 'preview';
  schemaVersion      : Integer default 1;
}

/**
 * Payment Settlement — multi-party payment settlement
 */
entity PaymentSettlements {
  key settlementId   : String(50) not null;
  sapInvoiceId       : String(35);
  sapSystemId        : String(3);
  contractAddress    : String(200);
  txHash             : String(64);
  initiatorAddress   : String(200);
  totalAmount        : Integer64;       // lovelace
  status             : String(20)       @assert.range enum {
    Pending; Approved; Executed; Disputed; Refunded; Expired
  };
  deadline           : Timestamp;
  parties            : Composition of many SettlementParties on parties.settlement = $self;
  network            : String(10) default 'preview';
  createdAt          : Timestamp;
  schemaVersion      : Integer default 1;
}

entity SettlementParties {
  key ID             : UUID;
  settlement         : Association to PaymentSettlements;
  address            : String(200);
  amount             : Integer64;
  hasApproved        : Boolean default false;
  sapPartnerNumber   : String(10);
}

/**
 * Asset Registry — tokenized SAP assets
 */
entity AssetRegistry {
  key assetId        : String(50) not null;
  assetType          : String(20)       @assert.range enum {
    Material; FixedAsset; Document; Custom
  };
  sapAssetNumber     : String(12);
  sapPlant           : String(4);
  sapStorageLocation : String(4);
  sapMaterialNumber  : String(40);
  ownerAddress       : String(200);
  custodianAddress   : String(200);
  contractAddress    : String(200);
  txHash             : String(64);
  policyId           : String(56);
  assetName          : String(64);
  quantity           : Integer64;
  state              : String(20)       @assert.range enum {
    Active; Locked; Transferred; Decommissioned
  };
  lockReason         : String(200);
  documentHash       : String(100);
  network            : String(10) default 'preview';
  createdAt          : Timestamp;
  updatedAt          : Timestamp;
  schemaVersion      : Integer default 1;
}

/**
 * Oracle Data — SAP-verified on-chain oracle values
 */
entity OracleData {
  key oracleId       : String(50) not null;
  sapSystemId        : String(3);
  dataType           : String(30)       @assert.range enum {
    ExchangeRate; CommodityPrice; InterestRate; SapConditionType
  };
  fromCurrency       : String(3);
  toCurrency         : String(3);
  commodityCode      : String(18);
  conditionType      : String(4);
  value              : Integer64;       // value * denominator
  denominator        : Integer64 default 1000000;
  decimalValue       : Decimal(20,6);   // computed: value / denominator
  validFrom          : Timestamp;
  validUntil         : Timestamp;
  postedAt           : Timestamp;
  oracleOperator     : String(200);
  contractAddress    : String(200);
  txHash             : String(64);
  isExpired          : Boolean default false;
  network            : String(10) default 'preview';
  schemaVersion      : Integer default 1;
}

// ============================================================
// VIEWS
// ============================================================

/**
 * Active supply chain events view
 */
view ActiveSupplyChain as
  select from SupplyChainEvents {
    sapDocumentId, sapSystemId, productCode, quantity, unitOfMeasure,
    status, network, createdAt, updatedAt, txHash
  } where status not in ('Received', 'Rejected');

/**
 * Unretired ESG credits view
 */
view ActiveEsgCredits as
  select from EsgCredits {
    creditId, creditType, issuerAddress, beneficiaryAddress,
    amount, unit, vintageYear, projectName, countryCode,
    sapCostCenter, network
  } where isRetired = false;
