// Payment Settlement Validator
// Multi-party payment settlement triggered by SAP SD/FI invoices
// Integrates with SAP FI/AP/AR via OData API
//
// Flow:
//   SAP Invoice Created → Settlement Initiated (Pending)
//   → All Parties Approve (Approved)
//   → Settlement Executed on-chain
//   → SAP Payment Advice Posted (via webhook)

use aiken/collection/list
use cardano/transaction.{InlineDatum, Output, Transaction}
use cardano/value.{lovelace_of}
use sap_cardano/errors
use sap_cardano/types.{
  Approve, Cancel, Dispute, Execute, Pending, Approved, Executed, Disputed,
  Refunded, Expired, Refund, SettlementDatum, SettlementParty, SettlementRedeemer,
}
use sap_cardano/utils.{
  any_signed_by, non_empty, signed_by, valid_sap_doc_id, valid_sap_system_id,
  verify_settlement_amounts,
}

// ============================================================
// VALIDATOR
// ============================================================

validator payment_settlement {
  spend(
    datum: Option<SettlementDatum>,
    redeemer: SettlementRedeemer,
    _own_ref: cardano/transaction.OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    // Always validate datum integrity
    expect validate_settlement_datum(d): Bool

    when redeemer is {
      Approve -> {
        // 1. Must be in Pending state
        expect
          d.status == Pending ? errors.err_invalid_settlement_state: Bool

        // 2. Deadline not passed
        expect
          !has_deadline_passed(tx, d.deadline) ? errors.err_deadline_exceeded: Bool

        // 3. A settlement party must sign
        let party_addresses = list.map(d.parties, fn(p) { p.address })
        expect
          any_signed_by(tx, party_addresses) ? errors.err_not_settlement_party: Bool

        // 4. Verify continuation output with updated approval
        expect
          verify_approval_output(tx, d): Bool

        True
      }

      Execute -> {
        // 1. Must be in Approved state (all parties approved)
        expect
          d.status == Approved ? errors.err_missing_approvals: Bool

        // 2. Check all parties have approved
        expect
          all_parties_approved(d.parties) ? errors.err_missing_approvals: Bool

        // 3. Initiator or any party can execute
        let party_addresses = list.map(d.parties, fn(p) { p.address })
        let all_addresses = [d.initiator, ..party_addresses]
        expect
          any_signed_by(tx, all_addresses) ? errors.err_not_settlement_party: Bool

        // 4. Verify outputs correctly distribute funds to parties
        expect
          verify_distribution_outputs(tx.outputs, d): Bool

        True
      }

      Dispute { reason } -> {
        // 1. Must be in Pending or Approved state
        expect
          (
            d.status == Pending || d.status == Approved
          ) ? errors.err_invalid_settlement_state: Bool

        // 2. A party must sign to dispute
        let party_addresses = list.map(d.parties, fn(p) { p.address })
        expect
          any_signed_by(tx, party_addresses) ? errors.err_not_settlement_party: Bool

        // 3. Reason must be provided
        expect non_empty(reason): Bool

        // 4. Verify continuation output marks disputed
        expect
          verify_status_update_output(tx.outputs, d, Disputed): Bool

        True
      }

      Refund -> {
        // 1. Can refund if: (a) Disputed, or (b) Pending/Approved AND past deadline
        let can_refund =
          d.status == Disputed || (
            (
              d.status == Pending || d.status == Approved
            ) && has_deadline_passed(tx, d.deadline)
          )
        expect can_refund ? errors.err_settlement_disputed: Bool

        // 2. Initiator must sign for refund
        expect signed_by(tx, d.initiator): Bool

        // 3. Funds return to initiator — no output validation needed (funds go to initiator)
        True
      }

      Cancel -> {
        // 1. Can only cancel from Pending state
        expect
          d.status == Pending ? errors.err_invalid_settlement_state: Bool

        // 2. No approvals must have been given yet
        expect
          !any_party_approved(d.parties) ? errors.err_missing_approvals: Bool

        // 3. Only initiator can cancel
        expect signed_by(tx, d.initiator): Bool

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

fn validate_settlement_datum(d: SettlementDatum) -> Bool {
  and {
    non_empty(d.settlement_id) ? errors.err_invalid_datum_fields,
    valid_sap_doc_id(d.sap_invoice_id) ? errors.err_invalid_sap_doc_id,
    valid_sap_system_id(d.sap_system_id) ? errors.err_invalid_sap_system_id,
    list.length(d.parties) >= 1 ? errors.err_invalid_datum_fields,
    d.total_amount > 0 ? errors.err_amount_mismatch,
    verify_settlement_amounts(d.parties, d.total_amount) ? errors.err_amount_mismatch,
    d.deadline > d.created_at ? errors.err_invalid_datum_fields,
    d.schema_version == 1 ? errors.err_invalid_schema_version,
  }
}

// ============================================================
// APPROVAL LOGIC
// ============================================================

fn all_parties_approved(parties: List<SettlementParty>) -> Bool {
  list.all(parties, fn(p) { p.has_approved })
}

fn any_party_approved(parties: List<SettlementParty>) -> Bool {
  list.any(parties, fn(p) { p.has_approved })
}

/// Get the address of the signer who approved (from transaction signatories)
fn get_signing_party(
  tx: Transaction,
  parties: List<SettlementParty>,
) -> Option<SettlementParty> {
  list.find(parties, fn(p) { signed_by(tx, p.address) })
}

/// Mark a party as approved in the list
fn mark_party_approved(
  parties: List<SettlementParty>,
  signer: sap_cardano/types.AddressHash,
) -> List<SettlementParty> {
  list.map(
    parties,
    fn(p) {
      if p.address == signer {
        SettlementParty { ..p, has_approved: True }
      } else {
        p
      }
    },
  )
}

fn has_deadline_passed(tx: Transaction, deadline: sap_cardano/types.Timestamp) -> Bool {
  when tx.validity_range.lower_bound.bound_type is {
    cardano/interval.Finite(lower) -> lower > deadline
    _ -> False
  }
}

// ============================================================
// OUTPUT VERIFICATION
// ============================================================

fn verify_approval_output(tx: Transaction, old_datum: SettlementDatum) -> Bool {
  // Find which party is signing
  expect Some(signing_party) = get_signing_party(tx, old_datum.parties)

  let updated_parties = mark_party_approved(old_datum.parties, signing_party.address)
  let new_status =
    if all_parties_approved(updated_parties) {
      Approved
    } else {
      Pending
    }

  verify_status_update_output_with_parties(
    tx.outputs,
    old_datum,
    new_status,
    updated_parties,
  )
}

fn verify_distribution_outputs(
  outputs: List<Output>,
  datum: SettlementDatum,
) -> Bool {
  // Each party must receive their allocated amount
  list.all(
    datum.parties,
    fn(party) {
      // Find output going to this party
      let party_outputs =
        list.filter(
          outputs,
          fn(output) {
            when output.address.payment_credential is {
              cardano/address.VerificationKey(hash) ->
                hash == party.address && lovelace_of(output.value) >= party.amount
              _ -> False
            }
          },
        )
      list.length(party_outputs) >= 1
    },
  )
}

fn verify_status_update_output(
  outputs: List<Output>,
  old_datum: SettlementDatum,
  new_status: sap_cardano/types.SettlementStatus,
) -> Bool {
  verify_status_update_output_with_parties(
    outputs,
    old_datum,
    new_status,
    old_datum.parties,
  )
}

fn verify_status_update_output_with_parties(
  outputs: List<Output>,
  old_datum: SettlementDatum,
  new_status: sap_cardano/types.SettlementStatus,
  new_parties: List<SettlementParty>,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: SettlementDatum = raw
            and {
              parsed.settlement_id == old_datum.settlement_id,
              parsed.sap_invoice_id == old_datum.sap_invoice_id,
              parsed.status == new_status,
              parsed.parties == new_parties,
              parsed.total_amount == old_datum.total_amount,
              parsed.initiator == old_datum.initiator,
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

test test_valid_settlement_datum() {
  let party1 =
    SettlementParty {
      address: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      amount: 5_000_000,
      has_approved: False,
      sap_partner_number: "0000100001",
    }
  let party2 =
    SettlementParty {
      address: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      amount: 3_000_000,
      has_approved: False,
      sap_partner_number: "0000200002",
    }
  let datum =
    SettlementDatum {
      settlement_id: "SET-2024-001",
      sap_invoice_id: "INV-90000001",
      sap_system_id: "PRD",
      initiator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      parties: [party1, party2],
      total_amount: 8_000_000,
      assets: [],
      status: Pending,
      deadline: 1_800_000_000_000,
      created_at: 1_700_000_000_000,
      metadata: aiken/collection/dict.new(),
      schema_version: 1,
    }
  validate_settlement_datum(datum)
}

test test_invalid_settlement_datum_amount_mismatch() {
  let party1 =
    SettlementParty {
      address: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      amount: 5_000_000,
      has_approved: False,
      sap_partner_number: "0000100001",
    }
  let datum =
    SettlementDatum {
      settlement_id: "SET-2024-002",
      sap_invoice_id: "INV-90000002",
      sap_system_id: "PRD",
      initiator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      parties: [party1],
      total_amount: 10_000_000,
      // Mismatch: party only gets 5M
      assets: [],
      status: Pending,
      deadline: 1_800_000_000_000,
      created_at: 1_700_000_000_000,
      metadata: aiken/collection/dict.new(),
      schema_version: 1,
    }
  !validate_settlement_datum(datum)
}

test test_all_parties_approved_true() {
  let parties =
    [
      SettlementParty {
        address: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
        amount: 5_000_000,
        has_approved: True,
        sap_partner_number: "V001",
      },
      SettlementParty {
        address: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
        amount: 3_000_000,
        has_approved: True,
        sap_partner_number: "V002",
      },
    ]
  all_parties_approved(parties)
}

test test_all_parties_approved_false() {
  let parties =
    [
      SettlementParty {
        address: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
        amount: 5_000_000,
        has_approved: True,
        sap_partner_number: "V001",
      },
      SettlementParty {
        address: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
        amount: 3_000_000,
        has_approved: False,
        // Not yet approved
        sap_partner_number: "V002",
      },
    ]
  !all_parties_approved(parties)
}

test test_mark_party_approved() {
  let addr = #"0123456789abcdef0123456789abcdef0123456789abcdef01234567"
  let parties =
    [
      SettlementParty {
        address: addr,
        amount: 5_000_000,
        has_approved: False,
        sap_partner_number: "V001",
      },
    ]
  let updated = mark_party_approved(parties, addr)
  expect Some(p) = list.head(updated)
  p.has_approved
}

test test_verify_settlement_amounts_valid() {
  let parties =
    [
      SettlementParty {
        address: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
        amount: 5_000_000,
        has_approved: False,
        sap_partner_number: "V001",
      },
      SettlementParty {
        address: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
        amount: 3_000_000,
        has_approved: False,
        sap_partner_number: "V002",
      },
    ]
  verify_settlement_amounts(parties, 8_000_000)
}
