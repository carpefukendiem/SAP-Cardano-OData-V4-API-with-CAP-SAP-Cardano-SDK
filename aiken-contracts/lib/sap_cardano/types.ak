// SAP-Cardano Integration Types
// Core type definitions for all SAP-Cardano smart contracts

use aiken/collection/dict.{Dict}
use aiken/crypto.{Blake2b_224, Hash, VerificationKey}

// ============================================================
// COMMON TYPES
// ============================================================

/// A wallet address hash (28 bytes)
pub type AddressHash =
  Hash<Blake2b_224, VerificationKey>

/// A policy ID (28 bytes) identifying a native asset family
pub type PolicyId =
  Hash<Blake2b_224, ByteArray>

/// An asset name (up to 32 bytes)
pub type AssetName =
  ByteArray

/// SAP document identifier (e.g. purchase order number, delivery ID)
pub type SapDocumentId =
  ByteArray

/// SAP system identifier (e.g. SID like "PRD", "DEV", "QAS")
pub type SapSystemId =
  ByteArray

/// POSIX timestamp in milliseconds
pub type Timestamp =
  Int

/// ADA amount in lovelace (1 ADA = 1,000,000 lovelace)
pub type Lovelace =
  Int

/// Generic metadata map for arbitrary key-value pairs
pub type Metadata =
  Dict<ByteArray, ByteArray>

// ============================================================
// SUPPLY CHAIN TYPES
// ============================================================

/// Status of a supply chain shipment/product
pub type SupplyChainStatus {
  /// Item created in SAP (e.g. Purchase Order raised)
  Created
  /// Item dispatched from origin
  Dispatched
  /// Item at intermediate checkpoint
  InTransit
  /// Customs / compliance check underway
  UnderInspection
  /// Item cleared and confirmed
  Cleared
  /// Item received at final destination (SAP GR posted)
  Received
  /// Item rejected / returned
  Rejected
}

/// A geographic checkpoint on the supply chain route
pub type Checkpoint {
  location_code: ByteArray,
  location_name: ByteArray,
  latitude: Int,
  // stored as microdegrees (degrees * 1_000_000)
  longitude: Int,
  // stored as microdegrees
  timestamp: Timestamp,
  handler_key: AddressHash,
}

/// Datum stored on-chain for a supply chain event
pub type SupplyChainDatum {
  sap_document_id: SapDocumentId,
  sap_system_id: SapSystemId,
  product_code: ByteArray,
  product_description: ByteArray,
  quantity: Int,
  unit_of_measure: ByteArray,
  origin_address: AddressHash,
  destination_address: AddressHash,
  status: SupplyChainStatus,
  checkpoints: List<Checkpoint>,
  metadata: Metadata,
  created_at: Timestamp,
  updated_at: Timestamp,
  schema_version: Int,
}

/// Redeemer actions for supply chain contract
pub type SupplyChainRedeemer {
  /// Advance the supply chain status
  UpdateStatus { new_status: SupplyChainStatus, checkpoint: Checkpoint }
  /// Add a checkpoint without changing status
  AddCheckpoint { checkpoint: Checkpoint }
  /// Complete the supply chain (finalize in SAP)
  Complete { sap_confirmation_id: ByteArray }
  /// Cancel / reject the supply chain event
  Cancel { reason: ByteArray }
}

// ============================================================
// ESG COMPLIANCE TYPES
// ============================================================

/// Type of ESG credit / certificate
pub type EsgCreditType {
  /// Carbon offset credit (tonnes CO2e)
  CarbonCredit
  /// Renewable energy certificate
  RenewableEnergyCertificate
  /// Water stewardship credit
  WaterCredit
  /// Biodiversity credit
  BiodiversityCredit
  /// Social impact certificate
  SocialImpact
}

/// Verification standard for ESG credits
pub type VerificationStandard {
  /// Verified Carbon Standard (Verra)
  VCS
  /// Gold Standard
  GoldStandard
  /// Climate, Community & Biodiversity
  CCB
  /// Science Based Targets initiative
  SBTi
  /// Custom internal standard
  CustomStandard { issuer: ByteArray }
}

/// ESG credit datum stored on-chain
pub type EsgCreditDatum {
  credit_id: ByteArray,
  credit_type: EsgCreditType,
  issuer: AddressHash,
  beneficiary: AddressHash,
  /// Amount in smallest unit (e.g. kg CO2e for carbon credits)
  amount: Int,
  /// Human-readable unit string
  unit: ByteArray,
  vintage_year: Int,
  verification_standard: VerificationStandard,
  verification_body: ByteArray,
  project_id: ByteArray,
  project_name: ByteArray,
  country_code: ByteArray,
  sap_cost_center: ByteArray,
  sap_profit_center: ByteArray,
  sap_wbs_element: ByteArray,
  is_retired: Bool,
  retired_at: Option<Timestamp>,
  retirement_reason: Option<ByteArray>,
  metadata: Metadata,
  schema_version: Int,
}

/// Redeemer actions for ESG contract
pub type EsgRedeemer {
  /// Transfer credit to new beneficiary
  Transfer { new_beneficiary: AddressHash }
  /// Retire/offset the credit (burns it)
  Retire { reason: ByteArray, sap_document: ByteArray }
  /// Split credit into two smaller credits
  Split { amount_a: Int, recipient_b: AddressHash }
  /// Update metadata (e.g. SAP cost center reassignment)
  UpdateMetadata { new_metadata: Metadata }
}

// ============================================================
// PAYMENT SETTLEMENT TYPES
// ============================================================

/// Payment settlement status
pub type SettlementStatus {
  /// Awaiting all party confirmations
  Pending
  /// All parties confirmed, ready to execute
  Approved
  /// Payment executed on-chain
  Executed
  /// Settlement disputed
  Disputed
  /// Settlement refunded
  Refunded
  /// Settlement expired
  Expired
}

/// A party in a multi-party payment settlement
pub type SettlementParty {
  address: AddressHash,
  /// Amount this party receives (lovelace)
  amount: Lovelace,
  /// Whether this party has approved
  has_approved: Bool,
  /// SAP vendor/customer number
  sap_partner_number: ByteArray,
}

/// Payment settlement datum
pub type SettlementDatum {
  settlement_id: ByteArray,
  sap_invoice_id: SapDocumentId,
  sap_system_id: SapSystemId,
  initiator: AddressHash,
  parties: List<SettlementParty>,
  total_amount: Lovelace,
  /// Additional native assets to distribute
  assets: List<(PolicyId, AssetName, Int)>,
  status: SettlementStatus,
  deadline: Timestamp,
  created_at: Timestamp,
  metadata: Metadata,
  schema_version: Int,
}

/// Redeemer for payment settlement
pub type SettlementRedeemer {
  /// Party approves settlement
  Approve
  /// Execute the settlement (after all approvals)
  Execute
  /// Dispute the settlement
  Dispute { reason: ByteArray }
  /// Refund after dispute or deadline
  Refund
  /// Cancel before any approvals
  Cancel
}

// ============================================================
// ASSET REGISTRY TYPES
// ============================================================

/// Asset lifecycle state
pub type AssetState {
  /// Asset created and registered
  Active
  /// Asset temporarily locked (e.g. in transit)
  Locked { reason: ByteArray }
  /// Asset transferred to new owner
  Transferred
  /// Asset decommissioned / consumed
  Decommissioned
}

/// Type of SAP-managed asset
pub type SapAssetType {
  /// Material / inventory item (SAP MM)
  Material
  /// Fixed asset (SAP FI-AA)
  FixedAsset
  /// Document / certificate
  Document
  /// Custom asset type
  Custom { type_code: ByteArray }
}

/// Asset registry datum — one per tokenized asset
pub type AssetRegistryDatum {
  asset_id: ByteArray,
  asset_type: SapAssetType,
  sap_asset_number: ByteArray,
  sap_plant: ByteArray,
  sap_storage_location: ByteArray,
  sap_material_number: ByteArray,
  owner: AddressHash,
  custodian: Option<AddressHash>,
  policy_id: PolicyId,
  asset_name: AssetName,
  /// Total quantity (1 for NFTs)
  quantity: Int,
  state: AssetState,
  /// IPFS CID or URL for off-chain documentation
  document_hash: Option<ByteArray>,
  metadata: Metadata,
  created_at: Timestamp,
  updated_at: Timestamp,
  schema_version: Int,
}

/// Redeemer for asset registry
pub type AssetRedeemer {
  /// Transfer asset to new owner
  Transfer { new_owner: AddressHash, sap_transfer_order: ByteArray }
  /// Lock asset for transit or inspection
  Lock { reason: ByteArray }
  /// Unlock a previously locked asset
  Unlock
  /// Decommission / consume asset (triggers SAP goods issue)
  Decommission { sap_document: ByteArray }
  /// Update asset metadata
  UpdateMetadata {
    new_document_hash: Option<ByteArray>,
    new_metadata: Metadata,
  }
}

// ============================================================
// SAP ORACLE TYPES
// ============================================================

/// Oracle data type for SAP → Cardano price/rate feeds
pub type OracleDataType {
  /// Currency exchange rate
  ExchangeRate { from_currency: ByteArray, to_currency: ByteArray }
  /// Commodity price
  CommodityPrice { commodity_code: ByteArray }
  /// Interest rate
  InterestRate { rate_type: ByteArray }
  /// Custom SAP condition type
  SapConditionType { condition_type: ByteArray }
}

/// Oracle datum posted by authorized SAP system
pub type OracleDatum {
  oracle_id: ByteArray,
  sap_system_id: SapSystemId,
  data_type: OracleDataType,
  /// Value multiplied by 1_000_000 for precision
  value: Int,
  /// Denominator for the value (default 1_000_000)
  denominator: Int,
  valid_from: Timestamp,
  valid_until: Timestamp,
  posted_at: Timestamp,
  oracle_operator: AddressHash,
  signature_ref: ByteArray,
  schema_version: Int,
}

/// Redeemer for oracle contract
pub type OracleRedeemer {
  /// Post a new oracle value
  PostValue { new_datum: OracleDatum }
  /// Consume the oracle value in a transaction
  UseValue { consumer_tx_ref: ByteArray }
  /// Revoke / invalidate oracle data
  Revoke { reason: ByteArray }
}
