// Asset Registry Validator
// Tokenized asset management for SAP EWM/FI-AA/MM
// Each UTxO represents one tokenized SAP asset (material, fixed asset, certificate)
//
// Integrates with:
//   - SAP MM: material management, goods movements
//   - SAP EWM: extended warehouse management
//   - SAP FI-AA: fixed asset accounting
//   - SAP EHS: environment, health & safety

use aiken/collection/list
use cardano/transaction.{InlineDatum, Output, Transaction}
use sap_cardano/errors
use sap_cardano/types.{
  Active, AssetRegistryDatum, AssetRedeemer, Decommission, Lock, Locked,
  Transfer, Transferred, Decommissioned, Unlock, UpdateMetadata,
}
use sap_cardano/utils.{
  non_empty, signed_by, valid_sap_doc_id,
}

// ============================================================
// VALIDATOR
// ============================================================

validator asset_registry {
  spend(
    datum: Option<AssetRegistryDatum>,
    redeemer: AssetRedeemer,
    _own_ref: cardano/transaction.OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    // Always validate datum integrity
    expect validate_asset_datum(d): Bool

    when redeemer is {
      Transfer { new_owner, sap_transfer_order } -> {
        // 1. Asset must be Active
        expect
          d.state == Active ? errors.err_asset_not_active: Bool

        // 2. Only owner can transfer
        expect signed_by(tx, d.owner) ? errors.err_not_asset_owner: Bool

        // 3. SAP transfer order must be provided
        expect valid_sap_doc_id(sap_transfer_order) ? errors.err_invalid_sap_doc_id: Bool

        // 4. New owner must be valid
        expect non_empty(new_owner): Bool

        // 5. Verify continuation output with new owner
        expect
          verify_transfer_output(tx.outputs, d, new_owner): Bool

        True
      }

      Lock { reason } -> {
        // 1. Asset must be Active to lock
        expect
          d.state == Active ? errors.err_asset_not_active: Bool

        // 2. Owner or custodian can lock
        let authorized =
          signed_by(tx, d.owner) || when d.custodian is {
            Some(custodian) -> signed_by(tx, custodian)
            None -> False
          }
        expect authorized ? errors.err_not_asset_owner: Bool

        // 3. Reason must be provided
        expect non_empty(reason): Bool

        // 4. Verify continuation output with Locked state
        expect
          verify_lock_output(tx.outputs, d, reason): Bool

        True
      }

      Unlock -> {
        // 1. Asset must be in Locked state
        let is_locked =
          when d.state is {
            Locked { .. } -> True
            _ -> False
          }
        expect is_locked ? errors.err_asset_not_active: Bool

        // 2. Owner or custodian can unlock
        let authorized =
          signed_by(tx, d.owner) || when d.custodian is {
            Some(custodian) -> signed_by(tx, custodian)
            None -> False
          }
        expect authorized ? errors.err_not_asset_owner: Bool

        // 3. Verify continuation output with Active state
        expect
          verify_unlock_output(tx.outputs, d): Bool

        True
      }

      Decommission { sap_document } -> {
        // 1. Asset must be Active
        expect
          d.state == Active ? errors.err_asset_not_active: Bool

        // 2. Only owner can decommission
        expect signed_by(tx, d.owner) ? errors.err_not_asset_owner: Bool

        // 3. SAP document reference required
        expect valid_sap_doc_id(sap_document) ? errors.err_invalid_sap_doc_id: Bool

        // 4. UTxO is consumed/burned — no continuation output
        True
      }

      UpdateMetadata { new_document_hash, new_metadata } -> {
        // 1. Asset must be Active
        expect
          d.state == Active ? errors.err_asset_not_active: Bool

        // 2. Only owner can update metadata
        expect signed_by(tx, d.owner) ? errors.err_not_asset_owner: Bool

        // 3. Verify continuation output with updated metadata
        expect
          verify_metadata_output(tx.outputs, d, new_document_hash, new_metadata): Bool

        True
      }
    }
  }

  else(_) {
    fail
  }
}

// ============================================================
// DATUM VALIDATION
// ============================================================

fn validate_asset_datum(d: AssetRegistryDatum) -> Bool {
  and {
    non_empty(d.asset_id) ? errors.err_invalid_datum_fields,
    non_empty(d.sap_asset_number) ? errors.err_invalid_sap_asset_number,
    non_empty(d.sap_plant) ? errors.err_invalid_datum_fields,
    non_empty(d.asset_name) ? errors.err_invalid_datum_fields,
    d.quantity > 0 ? errors.err_invalid_quantity,
    d.created_at > 0 ? errors.err_invalid_datum_fields,
    d.updated_at >= d.created_at ? errors.err_invalid_datum_fields,
    d.schema_version == 1 ? errors.err_invalid_schema_version,
  }
}

// ============================================================
// OUTPUT VERIFICATION HELPERS
// ============================================================

fn verify_transfer_output(
  outputs: List<Output>,
  old_datum: AssetRegistryDatum,
  new_owner: sap_cardano/types.AddressHash,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: AssetRegistryDatum = raw
            and {
              parsed.asset_id == old_datum.asset_id,
              parsed.owner == new_owner,
              parsed.policy_id == old_datum.policy_id,
              parsed.asset_name == old_datum.asset_name,
              parsed.quantity == old_datum.quantity,
              parsed.state == Active,
              parsed.sap_asset_number == old_datum.sap_asset_number,
              parsed.schema_version == old_datum.schema_version,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching) == 1
}

fn verify_lock_output(
  outputs: List<Output>,
  old_datum: AssetRegistryDatum,
  reason: ByteArray,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: AssetRegistryDatum = raw
            and {
              parsed.asset_id == old_datum.asset_id,
              parsed.owner == old_datum.owner,
              parsed.state == Locked { reason: reason },
              parsed.policy_id == old_datum.policy_id,
              parsed.quantity == old_datum.quantity,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching) == 1
}

fn verify_unlock_output(
  outputs: List<Output>,
  old_datum: AssetRegistryDatum,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: AssetRegistryDatum = raw
            and {
              parsed.asset_id == old_datum.asset_id,
              parsed.owner == old_datum.owner,
              parsed.state == Active,
              parsed.policy_id == old_datum.policy_id,
              parsed.quantity == old_datum.quantity,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching) == 1
}

fn verify_metadata_output(
  outputs: List<Output>,
  old_datum: AssetRegistryDatum,
  new_document_hash: Option<ByteArray>,
  new_metadata: sap_cardano/types.Metadata,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: AssetRegistryDatum = raw
            and {
              parsed.asset_id == old_datum.asset_id,
              parsed.owner == old_datum.owner,
              parsed.state == old_datum.state,
              parsed.document_hash == new_document_hash,
              parsed.metadata == new_metadata,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching) == 1
}

// ============================================================
// TESTS
// ============================================================

test test_valid_asset_datum() {
  let datum =
    AssetRegistryDatum {
      asset_id: "ASSET-DE-PLANT1-001",
      asset_type: sap_cardano/types.Material,
      sap_asset_number: "000000001000",
      sap_plant: "1000",
      sap_storage_location: "0001",
      sap_material_number: "MAT-100-001",
      owner: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      custodian: None,
      policy_id: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      asset_name: "SteelBeam-Grade-A",
      quantity: 100,
      state: Active,
      document_hash: None,
      metadata: aiken/collection/dict.new(),
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_000,
      schema_version: 1,
    }
  validate_asset_datum(datum)
}

test test_invalid_asset_datum_zero_quantity() {
  let datum =
    AssetRegistryDatum {
      asset_id: "ASSET-DE-PLANT1-001",
      asset_type: sap_cardano/types.Material,
      sap_asset_number: "000000001000",
      sap_plant: "1000",
      sap_storage_location: "0001",
      sap_material_number: "MAT-100-001",
      owner: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      custodian: None,
      policy_id: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      asset_name: "SteelBeam-Grade-A",
      quantity: 0,
      // Invalid
      state: Active,
      document_hash: None,
      metadata: aiken/collection/dict.new(),
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_000,
      schema_version: 1,
    }
  !validate_asset_datum(datum)
}

test test_asset_state_active() {
  Active == Active
}

test test_asset_state_locked() {
  Locked { reason: "InTransit" } == Locked { reason: "InTransit" }
}

test test_asset_state_locked_different_reason() {
  Locked { reason: "Inspection" } != Locked { reason: "Transit" }
}
