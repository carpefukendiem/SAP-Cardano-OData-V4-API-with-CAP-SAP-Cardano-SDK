// Vesting Contract Validator
// Time-locked milestone payment releases linked to SAP project milestones
// Ideal for Project Catalyst milestone payouts, SAP project delivery escrow,
// and supplier payment release schedules tied to confirmed deliverables.
//
// Architecture:
//   SAP Project (CJ20N/PS) creates a vesting schedule
//   → Funds locked on-chain in milestones
//   → Each milestone released when: (a) time window passed AND (b) SAP signed off
//   → Recipient claims each tranche independently
//   → Initiator can claw back unreleased tranches if cancelled

use aiken/collection/list
use aiken/primitive/bytearray
use cardano/transaction.{InlineDatum, Output, Transaction}
use cardano/value.{lovelace_of}
use sap_cardano/errors
use sap_cardano/types.{
  AddressHash, Lovelace, SapDocumentId, SapSystemId, Timestamp,
}
use sap_cardano/utils.{
  non_empty, signed_by, valid_sap_doc_id, valid_sap_system_id,
}

// ============================================================
// VESTING TYPES
// ============================================================

/// A single milestone tranche in the vesting schedule
pub type VestingTranche {
  /// Tranche sequence number (1-based)
  tranche_id: Int,
  /// Lovelace amount locked in this tranche
  amount: Lovelace,
  /// Earliest time the tranche can be claimed (POSIX ms)
  cliff_time: Timestamp,
  /// SAP document reference proving milestone completion
  sap_milestone_id: SapDocumentId,
  /// Whether this tranche has been claimed
  is_claimed: Bool,
  /// Whether this tranche has been approved by SAP
  sap_approved: Bool,
}

/// Status of the overall vesting agreement
pub type VestingStatus {
  /// Active and accepting claims
  VestingActive
  /// Paused by initiator (e.g., dispute)
  VestingPaused { reason: ByteArray }
  /// Fully completed — all tranches claimed
  VestingCompleted
  /// Cancelled — unclaimed funds returned to initiator
  VestingCancelled { reason: ByteArray }
}

/// Main vesting datum
pub type VestingDatum {
  vesting_id: ByteArray,
  sap_project_id: SapDocumentId,
  sap_system_id: SapSystemId,
  /// Who created and funded the vesting (e.g., buyer / project sponsor)
  initiator: AddressHash,
  /// Who receives the vested funds (e.g., vendor / contractor)
  recipient: AddressHash,
  /// SAP approver key (signs off on milestone completion)
  sap_approver: AddressHash,
  tranches: List<VestingTranche>,
  total_amount: Lovelace,
  status: VestingStatus,
  created_at: Timestamp,
  schema_version: Int,
}

/// Redeemer actions for the vesting contract
pub type VestingRedeemer {
  /// Recipient claims a specific tranche after cliff + SAP approval
  ClaimTranche { tranche_id: Int }
  /// SAP approver signs off a milestone (marks SAP approval)
  ApproveMilestone { tranche_id: Int, sap_confirmation: ByteArray }
  /// Initiator pauses vesting (e.g., during dispute)
  Pause { reason: ByteArray }
  /// Initiator resumes paused vesting
  Resume
  /// Initiator cancels and claws back unclaimed tranches
  Cancel { reason: ByteArray }
}

// ============================================================
// VALIDATOR
// ============================================================

validator vesting_contract {
  spend(
    datum: Option<VestingDatum>,
    redeemer: VestingRedeemer,
    _own_ref: cardano/transaction.OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    expect validate_vesting_datum(d): Bool

    when redeemer is {
      ClaimTranche { tranche_id } -> {
        // 1. Contract must be Active
        expect
          d.status == VestingActive ? "VEST-001: vesting is not active": Bool

        // 2. Recipient must sign
        expect signed_by(tx, d.recipient) ? errors.err_unauthorized_signer: Bool

        // 3. Find the tranche
        expect Some(tranche) = find_tranche(d.tranches, tranche_id): Bool

        // 4. Tranche must not be claimed
        expect !tranche.is_claimed ? "VEST-002: tranche already claimed": Bool

        // 5. SAP must have approved
        expect tranche.sap_approved ? "VEST-003: SAP approval required": Bool

        // 6. Cliff time must have passed
        expect cliff_passed(tx, tranche.cliff_time) ? "VEST-004: cliff time not yet reached": Bool

        // 7. Verify recipient receives correct amount
        expect
          verify_recipient_payment(tx.outputs, d.recipient, tranche.amount): Bool

        // 8. Verify continuation output with tranche marked claimed
        expect
          verify_tranche_claimed_output(tx.outputs, d, tranche_id): Bool

        True
      }

      ApproveMilestone { tranche_id, sap_confirmation } -> {
        // 1. Only SAP approver can mark milestones
        expect
          signed_by(tx, d.sap_approver) ? errors.err_unauthorized_signer: Bool

        // 2. Contract must be Active
        expect
          d.status == VestingActive ? "VEST-001: vesting is not active": Bool

        // 3. Confirmation reference must be provided
        expect non_empty(sap_confirmation): Bool

        // 4. Find the tranche
        expect Some(tranche) = find_tranche(d.tranches, tranche_id): Bool

        // 5. Must not already be approved
        expect !tranche.sap_approved ? "VEST-005: tranche already approved": Bool

        // 6. Verify continuation output with SAP approval set
        expect
          verify_tranche_approved_output(tx.outputs, d, tranche_id): Bool

        True
      }

      Pause { reason } -> {
        expect signed_by(tx, d.initiator) ? errors.err_unauthorized_signer: Bool
        expect non_empty(reason): Bool
        expect
          d.status == VestingActive ? "VEST-006: cannot pause non-active vesting": Bool
        expect
          verify_status_output(tx.outputs, d, VestingPaused { reason: reason }): Bool
        True
      }

      Resume -> {
        expect signed_by(tx, d.initiator) ? errors.err_unauthorized_signer: Bool
        let is_paused =
          when d.status is {
            VestingPaused { .. } -> True
            _ -> False
          }
        expect is_paused ? "VEST-007: vesting is not paused": Bool
        expect
          verify_status_output(tx.outputs, d, VestingActive): Bool
        True
      }

      Cancel { reason } -> {
        expect signed_by(tx, d.initiator) ? errors.err_unauthorized_signer: Bool
        expect non_empty(reason): Bool

        // Cannot cancel if all tranches are claimed
        let all_claimed = list.all(d.tranches, fn(t) { t.is_claimed })
        expect !all_claimed ? "VEST-008: all tranches already claimed": Bool

        // Unclaimed funds return to initiator — verify output
        expect
          verify_clawback_output(tx.outputs, d): Bool

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

fn validate_vesting_datum(d: VestingDatum) -> Bool {
  and {
    non_empty(d.vesting_id) ? errors.err_invalid_datum_fields,
    valid_sap_doc_id(d.sap_project_id) ? errors.err_invalid_sap_doc_id,
    valid_sap_system_id(d.sap_system_id) ? errors.err_invalid_sap_system_id,
    list.length(d.tranches) >= 1 ? errors.err_invalid_datum_fields,
    d.total_amount > 0 ? errors.err_invalid_datum_fields,
    validate_tranches(d.tranches, d.total_amount),
    d.schema_version == 1 ? errors.err_invalid_schema_version,
  }
}

fn validate_tranches(tranches: List<VestingTranche>, expected_total: Int) -> Bool {
  let computed_total =
    list.foldr(tranches, 0, fn(t, acc) { acc + t.amount })
  and {
    computed_total == expected_total ? errors.err_amount_mismatch,
    list.all(tranches, fn(t) { t.amount > 0 && t.tranche_id >= 1 }),
  }
}

// ============================================================
// HELPERS
// ============================================================

fn find_tranche(
  tranches: List<VestingTranche>,
  tranche_id: Int,
) -> Option<VestingTranche> {
  list.find(tranches, fn(t) { t.tranche_id == tranche_id })
}

fn cliff_passed(tx: Transaction, cliff_time: Timestamp) -> Bool {
  when tx.validity_range.lower_bound.bound_type is {
    cardano/interval.Finite(lower) -> lower >= cliff_time
    _ -> False
  }
}

fn unclaimed_amount(tranches: List<VestingTranche>) -> Int {
  list.foldr(
    tranches,
    0,
    fn(t, acc) {
      if t.is_claimed {
        acc
      } else {
        acc + t.amount
      }
    },
  )
}

// ============================================================
// OUTPUT VERIFICATION
// ============================================================

fn verify_recipient_payment(
  outputs: List<Output>,
  recipient: AddressHash,
  amount: Lovelace,
) -> Bool {
  let valid_outputs =
    list.filter(
      outputs,
      fn(output) {
        when output.address.payment_credential is {
          cardano/address.VerificationKey(hash) ->
            hash == recipient && lovelace_of(output.value) >= amount
          _ -> False
        }
      },
    )
  list.length(valid_outputs) >= 1
}

fn verify_tranche_claimed_output(
  outputs: List<Output>,
  old_datum: VestingDatum,
  tranche_id: Int,
) -> Bool {
  let updated_tranches =
    list.map(
      old_datum.tranches,
      fn(t) {
        if t.tranche_id == tranche_id {
          VestingTranche { ..t, is_claimed: True }
        } else {
          t
        }
      },
    )

  let all_claimed = list.all(updated_tranches, fn(t) { t.is_claimed })
  let new_status =
    if all_claimed {
      VestingCompleted
    } else {
      VestingActive
    }

  verify_datum_output(outputs, old_datum, updated_tranches, new_status)
}

fn verify_tranche_approved_output(
  outputs: List<Output>,
  old_datum: VestingDatum,
  tranche_id: Int,
) -> Bool {
  let updated_tranches =
    list.map(
      old_datum.tranches,
      fn(t) {
        if t.tranche_id == tranche_id {
          VestingTranche { ..t, sap_approved: True }
        } else {
          t
        }
      },
    )
  verify_datum_output(outputs, old_datum, updated_tranches, old_datum.status)
}

fn verify_status_output(
  outputs: List<Output>,
  old_datum: VestingDatum,
  new_status: VestingStatus,
) -> Bool {
  verify_datum_output(outputs, old_datum, old_datum.tranches, new_status)
}

fn verify_datum_output(
  outputs: List<Output>,
  old_datum: VestingDatum,
  new_tranches: List<VestingTranche>,
  new_status: VestingStatus,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: VestingDatum = raw
            and {
              parsed.vesting_id == old_datum.vesting_id,
              parsed.initiator == old_datum.initiator,
              parsed.recipient == old_datum.recipient,
              parsed.sap_approver == old_datum.sap_approver,
              parsed.tranches == new_tranches,
              parsed.status == new_status,
              parsed.total_amount == old_datum.total_amount,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching) == 1
}

fn verify_clawback_output(
  outputs: List<Output>,
  datum: VestingDatum,
) -> Bool {
  let clawback = unclaimed_amount(datum.tranches)
  let valid_outputs =
    list.filter(
      outputs,
      fn(output) {
        when output.address.payment_credential is {
          cardano/address.VerificationKey(hash) ->
            hash == datum.initiator && lovelace_of(output.value) >= clawback
          _ -> False
        }
      },
    )
  list.length(valid_outputs) >= 1
}

// ============================================================
// TESTS
// ============================================================

fn make_tranche(id: Int, amount: Int, cliff: Int) -> VestingTranche {
  VestingTranche {
    tranche_id: id,
    amount: amount,
    cliff_time: cliff,
    sap_milestone_id: "PROJ-MS-001",
    is_claimed: False,
    sap_approved: False,
  }
}

test test_valid_vesting_datum() {
  let t1 = make_tranche(1, 10_000_000, 1_700_000_000_000)
  let t2 = make_tranche(2, 15_000_000, 1_702_000_000_000)
  let t3 = make_tranche(3, 5_000_000, 1_704_000_000_000)
  let d =
    VestingDatum {
      vesting_id: "VEST-PRD-2024-001",
      sap_project_id: "PS-2024-001",
      sap_system_id: "PRD",
      initiator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      recipient: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      sap_approver: #"deadbeef0123456789abcdef0123456789abcdef0123456789abcdef",
      tranches: [t1, t2, t3],
      total_amount: 30_000_000,
      status: VestingActive,
      created_at: 1_700_000_000_000,
      schema_version: 1,
    }
  validate_vesting_datum(d)
}

test test_invalid_vesting_datum_total_mismatch() {
  let t1 = make_tranche(1, 10_000_000, 1_700_000_000_000)
  let d =
    VestingDatum {
      vesting_id: "VEST-PRD-2024-002",
      sap_project_id: "PS-2024-002",
      sap_system_id: "PRD",
      initiator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      recipient: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      sap_approver: #"deadbeef0123456789abcdef0123456789abcdef0123456789abcdef",
      tranches: [t1],
      total_amount: 99_000_000,
      // Mismatch!
      status: VestingActive,
      created_at: 1_700_000_000_000,
      schema_version: 1,
    }
  !validate_vesting_datum(d)
}

test test_find_tranche_exists() {
  let tranches =
    [make_tranche(1, 10_000_000, 0), make_tranche(2, 20_000_000, 0)]
  when find_tranche(tranches, 2) is {
    Some(t) -> t.tranche_id == 2
    None -> False
  }
}

test test_find_tranche_not_exists() {
  let tranches = [make_tranche(1, 10_000_000, 0)]
  find_tranche(tranches, 99) == None
}

test test_unclaimed_amount_all_unclaimed() {
  let tranches =
    [make_tranche(1, 10_000_000, 0), make_tranche(2, 20_000_000, 0)]
  unclaimed_amount(tranches) == 30_000_000
}

test test_unclaimed_amount_one_claimed() {
  let t1 = VestingTranche { ..make_tranche(1, 10_000_000, 0), is_claimed: True }
  let t2 = make_tranche(2, 20_000_000, 0)
  unclaimed_amount([t1, t2]) == 20_000_000
}

test test_unclaimed_amount_all_claimed() {
  let t1 = VestingTranche { ..make_tranche(1, 10_000_000, 0), is_claimed: True }
  let t2 = VestingTranche { ..make_tranche(2, 20_000_000, 0), is_claimed: True }
  unclaimed_amount([t1, t2]) == 0
}

test test_vesting_status_variants() {
  VestingActive == VestingActive
}

test test_vesting_paused_with_reason() {
  VestingPaused { reason: "dispute" } == VestingPaused { reason: "dispute" }
}
