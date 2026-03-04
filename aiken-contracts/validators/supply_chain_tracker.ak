// Supply Chain Tracker Validator
// Records and verifies product provenance milestones on Cardano
// Integrates with SAP MM/WM/EWM via the OData API
//
// Flow:
//   SAP PO Created → Contract Minted (Created)
//   → Goods Dispatch (Dispatched)
//   → Transit Checkpoints (InTransit × N)
//   → Customs Inspection (UnderInspection)
//   → Cleared
//   → SAP Goods Receipt posted (Received)

use aiken/collection/list
use aiken/primitive/bytearray
use cardano/transaction.{InlineDatum, Output, Transaction}
use sap_cardano/errors
use sap_cardano/types.{
  AddCheckpoint, Cancel, Checkpoint, Complete, Created, Dispatched, Cleared,
  InTransit, Received, Rejected, SupplyChainDatum, SupplyChainRedeemer,
  SupplyChainStatus, UnderInspection, UpdateStatus,
}
use sap_cardano/utils.{
  non_empty, signed_by, valid_location_code, valid_sap_doc_id,
  valid_sap_system_id,
}

// ============================================================
// VALIDATOR
// ============================================================

/// Supply Chain Tracker spending validator
/// Controls when and how supply chain UTxOs can be spent/updated
validator supply_chain_tracker {
  spend(
    datum: Option<SupplyChainDatum>,
    redeemer: SupplyChainRedeemer,
    own_ref: cardano/transaction.OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    // Always validate datum integrity
    expect validate_datum(d): Bool

    when redeemer is {
      UpdateStatus { new_status, checkpoint } -> {
        // 1. Validate the status transition is legal
        expect validate_status_transition(d.status, new_status): Bool

        // 2. Validate checkpoint data
        expect validate_checkpoint(checkpoint): Bool

        // 3. Signer must be the checkpoint handler
        expect
          signed_by(tx, checkpoint.handler_key) || signed_by(
            tx,
            d.origin_address,
          ): Bool

        // 4. Find continuation output and verify updated datum
        expect
          verify_continuation_output(
            tx.outputs,
            own_ref,
            d,
            new_status,
            Some(checkpoint),
          ): Bool

        True
      }

      AddCheckpoint { checkpoint } -> {
        // 1. Cannot add checkpoint to finalized shipment
        expect
          !is_finalized(d.status) ? errors.err_shipment_finalized: Bool

        // 2. Validate checkpoint data
        expect validate_checkpoint(checkpoint): Bool

        // 3. Handler must sign
        expect signed_by(tx, checkpoint.handler_key): Bool

        // 4. Verify continuation output keeps same status but adds checkpoint
        expect
          verify_continuation_output(
            tx.outputs,
            own_ref,
            d,
            d.status,
            Some(checkpoint),
          ): Bool

        True
      }

      Complete { sap_confirmation_id } -> {
        // 1. Only destination address can complete
        expect signed_by(tx, d.destination_address): Bool

        // 2. Must be in Cleared state to complete
        expect
          (
            d.status == Cleared
          ) ? errors.err_invalid_status_transition: Bool

        // 3. SAP confirmation ID must be non-empty
        expect non_empty(sap_confirmation_id): Bool

        // 4. No continuation output — UTxO is consumed / burned
        True
      }

      Cancel { reason } -> {
        // 1. Only origin address can cancel
        expect signed_by(tx, d.origin_address): Bool

        // 2. Cannot cancel if already received or cleared
        expect
          !(d.status == Received || d.status == Cleared) ? errors.err_shipment_finalized: Bool

        // 3. Reason must be provided
        expect non_empty(reason): Bool

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

fn validate_datum(d: SupplyChainDatum) -> Bool {
  and {
    valid_sap_doc_id(d.sap_document_id) ? errors.err_invalid_sap_doc_id,
    valid_sap_system_id(d.sap_system_id) ? errors.err_invalid_sap_system_id,
    non_empty(d.product_code) ? errors.err_invalid_datum_fields,
    d.quantity > 0 ? errors.err_invalid_datum_fields,
    non_empty(d.unit_of_measure) ? errors.err_invalid_datum_fields,
    d.schema_version == 1 ? errors.err_invalid_schema_version,
    d.created_at > 0 ? errors.err_invalid_datum_fields,
    d.updated_at >= d.created_at ? errors.err_invalid_datum_fields,
  }
}

// ============================================================
// STATUS TRANSITION LOGIC
// ============================================================

/// Valid state machine transitions:
/// Created → Dispatched
/// Dispatched → InTransit | UnderInspection
/// InTransit → InTransit | UnderInspection | Cleared
/// UnderInspection → InTransit | Cleared | Rejected
/// Cleared → Received
fn validate_status_transition(
  current: SupplyChainStatus,
  next: SupplyChainStatus,
) -> Bool {
  let valid =
    when current is {
      Created ->
        next == Dispatched
      Dispatched ->
        next == InTransit || next == UnderInspection
      InTransit ->
        next == InTransit || next == UnderInspection || next == Cleared
      UnderInspection ->
        next == InTransit || next == Cleared || next == Rejected
      Cleared ->
        next == Received
      Received ->
        False
      Rejected ->
        False
    }
  valid ? errors.err_invalid_status_transition
}

fn is_finalized(status: SupplyChainStatus) -> Bool {
  status == Received || status == Rejected
}

// ============================================================
// CHECKPOINT VALIDATION
// ============================================================

fn validate_checkpoint(cp: Checkpoint) -> Bool {
  and {
    valid_location_code(cp.location_code) ? errors.err_invalid_checkpoint,
    non_empty(cp.location_name) ? errors.err_invalid_checkpoint,
    cp.timestamp > 0 ? errors.err_invalid_checkpoint,
    // Latitude: -90_000_000 to 90_000_000 microdegrees
    (cp.latitude >= -90_000_000 && cp.latitude <= 90_000_000) ? errors.err_invalid_checkpoint,
    // Longitude: -180_000_000 to 180_000_000 microdegrees
    (cp.longitude >= -180_000_000 && cp.longitude <= 180_000_000) ? errors.err_invalid_checkpoint,
  }
}

// ============================================================
// CONTINUATION OUTPUT VERIFICATION
// ============================================================

/// Verify that the transaction produces a valid continuation UTxO
/// at the same script address with updated datum
fn verify_continuation_output(
  outputs: List<Output>,
  own_ref: cardano/transaction.OutputReference,
  old_datum: SupplyChainDatum,
  new_status: SupplyChainStatus,
  new_checkpoint: Option<Checkpoint>,
) -> Bool {
  // Find the output going back to the script
  let continuation_outputs =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: SupplyChainDatum = raw
            parsed.sap_document_id == old_datum.sap_document_id
          }
          _ -> False
        }
      },
    )

  expect list.length(continuation_outputs) == 1: Bool

  expect Some(cont_output) = list.head(continuation_outputs)

  expect InlineDatum(raw_datum) = cont_output.datum
  expect new_datum: SupplyChainDatum = raw_datum

  // Verify immutable fields haven't changed
  let immutable_fields_preserved =
    and {
      new_datum.sap_document_id == old_datum.sap_document_id,
      new_datum.sap_system_id == old_datum.sap_system_id,
      new_datum.product_code == old_datum.product_code,
      new_datum.quantity == old_datum.quantity,
      new_datum.unit_of_measure == old_datum.unit_of_measure,
      new_datum.origin_address == old_datum.origin_address,
      new_datum.destination_address == old_datum.destination_address,
      new_datum.created_at == old_datum.created_at,
      new_datum.schema_version == old_datum.schema_version,
    }

  // Verify status updated correctly
  let status_updated = new_datum.status == new_status

  // Verify checkpoint appended if provided
  let checkpoints_valid =
    when new_checkpoint is {
      Some(cp) ->
        // New checkpoint list = old list + new checkpoint
        new_datum.checkpoints == list.concat(
          old_datum.checkpoints,
          [cp],
        )
      None ->
        new_datum.checkpoints == old_datum.checkpoints
    }

  // updated_at must be >= old updated_at
  let timestamp_valid = new_datum.updated_at >= old_datum.updated_at

  and {
    immutable_fields_preserved,
    status_updated,
    checkpoints_valid,
    timestamp_valid,
  }
}

// ============================================================
// TESTS
// ============================================================

test test_valid_status_transition_created_to_dispatched() {
  validate_status_transition(Created, Dispatched)
}

test test_valid_status_transition_dispatched_to_in_transit() {
  validate_status_transition(Dispatched, InTransit)
}

test test_valid_status_transition_in_transit_to_cleared() {
  validate_status_transition(InTransit, Cleared)
}

test test_valid_status_transition_cleared_to_received() {
  validate_status_transition(Cleared, Received)
}

test test_invalid_status_transition_received_to_dispatched() {
  !validate_status_transition(Received, Dispatched)
}

test test_invalid_status_transition_created_to_received() {
  !validate_status_transition(Created, Received)
}

test test_valid_checkpoint() {
  let cp =
    Checkpoint {
      location_code: "DEHAM",
      location_name: "Hamburg Port",
      latitude: 53_550_000,
      longitude: 9_993_690,
      timestamp: 1_700_000_000_000,
      handler_key: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
    }
  validate_checkpoint(cp)
}

test test_invalid_checkpoint_bad_location_code() {
  let cp =
    Checkpoint {
      location_code: "XX",
      // Too short — must be 5 chars
      location_name: "Unknown",
      latitude: 0,
      longitude: 0,
      timestamp: 1_700_000_000_000,
      handler_key: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
    }
  !validate_checkpoint(cp)
}

test test_invalid_checkpoint_out_of_range_latitude() {
  let cp =
    Checkpoint {
      location_code: "DEHAM",
      location_name: "Hamburg Port",
      latitude: 91_000_000,
      // Invalid: > 90 degrees
      longitude: 0,
      timestamp: 1_700_000_000_000,
      handler_key: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
    }
  !validate_checkpoint(cp)
}

test test_is_finalized_received() {
  is_finalized(Received)
}

test test_is_finalized_rejected() {
  is_finalized(Rejected)
}

test test_not_finalized_created() {
  !is_finalized(Created)
}

test test_not_finalized_in_transit() {
  !is_finalized(InTransit)
}
