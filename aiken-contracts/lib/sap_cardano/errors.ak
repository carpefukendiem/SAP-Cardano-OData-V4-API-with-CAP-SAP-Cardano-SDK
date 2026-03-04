// SAP-Cardano Error Messages
// Standardized error trace labels for all validators
// These map to OData error codes in the CAP service

// ============================================================
// GENERIC ERRORS (1xxx)
// ============================================================

/// Invalid schema version in datum
pub const err_invalid_schema_version = "SAP-001: invalid schema version"

/// Datum fields failed validation
pub const err_invalid_datum_fields = "SAP-002: invalid datum fields"

/// Transaction not signed by required party
pub const err_unauthorized_signer = "SAP-003: unauthorized signer"

/// Transaction submitted after deadline
pub const err_deadline_exceeded = "SAP-004: deadline exceeded"

/// SAP document ID format invalid
pub const err_invalid_sap_doc_id = "SAP-005: invalid SAP document ID"

/// SAP system ID format invalid
pub const err_invalid_sap_system_id = "SAP-006: invalid SAP system ID"

/// Required metadata field missing
pub const err_missing_metadata = "SAP-007: required metadata field missing"

// ============================================================
// SUPPLY CHAIN ERRORS (2xxx)
// ============================================================

/// Invalid status transition (e.g. Received → Dispatched)
pub const err_invalid_status_transition = "SC-001: invalid status transition"

/// Checkpoint location code invalid
pub const err_invalid_checkpoint = "SC-002: invalid checkpoint data"

/// Cannot add checkpoint to completed/cancelled shipment
pub const err_shipment_finalized = "SC-003: shipment already finalized"

/// Checkpoint handler not authorized
pub const err_unauthorized_handler = "SC-004: unauthorized handler"

/// Duplicate checkpoint at same location
pub const err_duplicate_checkpoint = "SC-005: duplicate checkpoint"

// ============================================================
// ESG ERRORS (3xxx)
// ============================================================

/// Credit has already been retired
pub const err_credit_already_retired = "ESG-001: credit already retired"

/// Insufficient credit amount for split
pub const err_insufficient_credit = "ESG-002: insufficient credit amount"

/// Split amounts do not match total
pub const err_split_amount_mismatch = "ESG-003: split amount mismatch"

/// Invalid vintage year
pub const err_invalid_vintage_year = "ESG-004: invalid vintage year"

/// Transfer to zero address
pub const err_invalid_beneficiary = "ESG-005: invalid beneficiary address"

/// Only issuer can perform this action
pub const err_not_issuer = "ESG-006: only issuer can perform this action"

// ============================================================
// PAYMENT SETTLEMENT ERRORS (4xxx)
// ============================================================

/// Settlement has already been executed
pub const err_settlement_executed = "PAY-001: settlement already executed"

/// Not all parties have approved
pub const err_missing_approvals = "PAY-002: not all parties have approved"

/// Settlement amount mismatch
pub const err_amount_mismatch = "PAY-003: settlement amount mismatch"

/// Caller is not a settlement party
pub const err_not_settlement_party = "PAY-004: caller is not a settlement party"

/// Settlement is in invalid state for this action
pub const err_invalid_settlement_state = "PAY-005: invalid settlement state"

/// Cannot execute disputed settlement
pub const err_settlement_disputed = "PAY-006: settlement is disputed"

/// Settlement deadline not yet passed for refund
pub const err_deadline_not_passed = "PAY-007: deadline not yet passed"

/// Output amounts do not match party allocations
pub const err_output_amount_mismatch = "PAY-008: output amounts do not match"

// ============================================================
// ASSET REGISTRY ERRORS (5xxx)
// ============================================================

/// Asset is not in Active state
pub const err_asset_not_active = "AST-001: asset is not active"

/// Asset is locked and cannot be transferred
pub const err_asset_locked = "AST-002: asset is locked"

/// Only asset owner can perform this action
pub const err_not_asset_owner = "AST-003: not the asset owner"

/// Only asset custodian can perform this action
pub const err_not_custodian = "AST-004: not the asset custodian"

/// Asset quantity must be positive
pub const err_invalid_quantity = "AST-005: invalid asset quantity"

/// SAP asset number format invalid
pub const err_invalid_sap_asset_number = "AST-006: invalid SAP asset number"

// ============================================================
// ORACLE ERRORS (6xxx)
// ============================================================

/// Oracle data has expired
pub const err_oracle_expired = "ORC-001: oracle data has expired"

/// Oracle value is outside acceptable range
pub const err_oracle_out_of_range = "ORC-002: oracle value out of range"

/// Not an authorized oracle operator
pub const err_not_oracle_operator = "ORC-003: not an authorized oracle operator"

/// Oracle validity window is invalid
pub const err_invalid_validity_window = "ORC-004: invalid validity window"

/// Oracle denominator must be positive
pub const err_invalid_denominator = "ORC-005: oracle denominator must be positive"
