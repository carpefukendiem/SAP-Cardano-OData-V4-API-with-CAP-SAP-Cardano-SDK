// ESG Compliance Validator
// Manages carbon credits and ESG certificates on Cardano
// Integrates with SAP CO (Controlling) and sustainability reporting
//
// Supports:
//   - Carbon credit issuance and transfer
//   - Credit retirement (permanent offset)
//   - Credit splitting (partial use across cost centers)
//   - SAP cost center / profit center / WBS assignment

use aiken/collection/list
use cardano/transaction.{InlineDatum, Output, Transaction}
use sap_cardano/errors
use sap_cardano/types.{
  EsgCreditDatum, EsgRedeemer, Retire, Split, Transfer, UpdateMetadata,
}
use sap_cardano/utils.{
  non_empty, signed_by, valid_sap_doc_id,
}

// ============================================================
// VALIDATOR
// ============================================================

validator esg_compliance {
  spend(
    datum: Option<EsgCreditDatum>,
    redeemer: EsgRedeemer,
    _own_ref: cardano/transaction.OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    // Always validate datum integrity
    expect validate_esg_datum(d): Bool

    when redeemer is {
      Transfer { new_beneficiary } -> {
        // 1. Credit must not be retired
        expect !d.is_retired ? errors.err_credit_already_retired: Bool

        // 2. Only current beneficiary or issuer can transfer
        expect
          (
            signed_by(tx, d.beneficiary) || signed_by(tx, d.issuer)
          ) ? errors.err_not_issuer: Bool

        // 3. New beneficiary must be a valid non-zero address
        expect
          (
            new_beneficiary != #""
          ) ? errors.err_invalid_beneficiary: Bool

        // 4. Verify continuation output has updated beneficiary
        expect
          verify_transfer_output(tx.outputs, d, new_beneficiary): Bool

        True
      }

      Retire { reason, sap_document } -> {
        // 1. Credit must not already be retired
        expect !d.is_retired ? errors.err_credit_already_retired: Bool

        // 2. Only beneficiary can retire
        expect signed_by(tx, d.beneficiary): Bool

        // 3. Reason and SAP document must be provided
        expect non_empty(reason): Bool
        expect valid_sap_doc_id(sap_document) ? errors.err_invalid_sap_doc_id: Bool

        // 4. Output must show retired = true (or UTxO is burned)
        // Retirement burns the UTxO — no continuation output needed
        True
      }

      Split { amount_a, recipient_b } -> {
        // 1. Credit must not be retired
        expect !d.is_retired ? errors.err_credit_already_retired: Bool

        // 2. Only beneficiary can split
        expect signed_by(tx, d.beneficiary): Bool

        // 3. Amount A must be positive and less than total
        expect amount_a > 0 ? errors.err_insufficient_credit: Bool
        expect amount_a < d.amount ? errors.err_insufficient_credit: Bool

        // 4. Recipient B must be valid
        expect
          (
            recipient_b != #""
          ) ? errors.err_invalid_beneficiary: Bool

        // 5. Verify outputs: part A stays with beneficiary, part B goes to recipient_b
        let amount_b = d.amount - amount_a
        expect amount_b > 0 ? errors.err_split_amount_mismatch: Bool

        expect
          verify_split_outputs(tx.outputs, d, amount_a, amount_b, recipient_b): Bool

        True
      }

      UpdateMetadata { new_metadata } -> {
        // 1. Only issuer can update metadata
        expect signed_by(tx, d.issuer) ? errors.err_not_issuer: Bool

        // 2. Credit must not be retired
        expect !d.is_retired ? errors.err_credit_already_retired: Bool

        // 3. Verify continuation output with updated metadata
        expect
          verify_metadata_update_output(tx.outputs, d, new_metadata): Bool

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

fn validate_esg_datum(d: EsgCreditDatum) -> Bool {
  and {
    non_empty(d.credit_id) ? errors.err_invalid_datum_fields,
    d.amount > 0 ? errors.err_insufficient_credit,
    non_empty(d.unit) ? errors.err_invalid_datum_fields,
    (d.vintage_year >= 1990 && d.vintage_year <= 2100) ? errors.err_invalid_vintage_year,
    non_empty(d.project_id) ? errors.err_invalid_datum_fields,
    non_empty(d.country_code) ? errors.err_invalid_datum_fields,
    d.schema_version == 1 ? errors.err_invalid_schema_version,
  }
}

// ============================================================
// OUTPUT VERIFICATION HELPERS
// ============================================================

fn verify_transfer_output(
  outputs: List<Output>,
  old_datum: EsgCreditDatum,
  new_beneficiary: sap_cardano/types.AddressHash,
) -> Bool {
  let matching_outputs =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: EsgCreditDatum = raw
            and {
              parsed.credit_id == old_datum.credit_id,
              parsed.beneficiary == new_beneficiary,
              parsed.issuer == old_datum.issuer,
              parsed.amount == old_datum.amount,
              parsed.credit_type == old_datum.credit_type,
              parsed.is_retired == False,
              parsed.schema_version == old_datum.schema_version,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching_outputs) == 1
}

fn verify_split_outputs(
  outputs: List<Output>,
  old_datum: EsgCreditDatum,
  amount_a: Int,
  amount_b: Int,
  recipient_b: sap_cardano/types.AddressHash,
) -> Bool {
  // Output A: stays with original beneficiary
  let outputs_a =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: EsgCreditDatum = raw
            and {
              parsed.beneficiary == old_datum.beneficiary,
              parsed.amount == amount_a,
              parsed.credit_type == old_datum.credit_type,
              parsed.issuer == old_datum.issuer,
              !parsed.is_retired,
            }
          }
          _ -> False
        }
      },
    )

  // Output B: goes to recipient_b
  let outputs_b =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: EsgCreditDatum = raw
            and {
              parsed.beneficiary == recipient_b,
              parsed.amount == amount_b,
              parsed.credit_type == old_datum.credit_type,
              parsed.issuer == old_datum.issuer,
              !parsed.is_retired,
            }
          }
          _ -> False
        }
      },
    )

  list.length(outputs_a) == 1 && list.length(outputs_b) == 1
}

fn verify_metadata_update_output(
  outputs: List<Output>,
  old_datum: EsgCreditDatum,
  new_metadata: sap_cardano/types.Metadata,
) -> Bool {
  let matching_outputs =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: EsgCreditDatum = raw
            and {
              parsed.credit_id == old_datum.credit_id,
              parsed.beneficiary == old_datum.beneficiary,
              parsed.issuer == old_datum.issuer,
              parsed.amount == old_datum.amount,
              parsed.metadata == new_metadata,
              parsed.is_retired == old_datum.is_retired,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching_outputs) == 1
}

// ============================================================
// TESTS
// ============================================================

test test_valid_esg_datum() {
  let datum =
    EsgCreditDatum {
      credit_id: "VCS-2024-DE-001",
      credit_type: sap_cardano/types.CarbonCredit,
      issuer: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      beneficiary: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      amount: 1_000_000,
      unit: "kgCO2e",
      vintage_year: 2023,
      verification_standard: sap_cardano/types.VCS,
      verification_body: "DNV-GL",
      project_id: "VCS-1234",
      project_name: "Amazon Reforestation",
      country_code: "BR",
      sap_cost_center: "CC-1000",
      sap_profit_center: "PC-100",
      sap_wbs_element: "WBS-ESG-2024",
      is_retired: False,
      retired_at: None,
      retirement_reason: None,
      metadata: aiken/collection/dict.new(),
      schema_version: 1,
    }
  validate_esg_datum(datum)
}

test test_invalid_esg_datum_zero_amount() {
  let datum =
    EsgCreditDatum {
      credit_id: "VCS-2024-DE-001",
      credit_type: sap_cardano/types.CarbonCredit,
      issuer: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      beneficiary: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      amount: 0,
      // Invalid
      unit: "kgCO2e",
      vintage_year: 2023,
      verification_standard: sap_cardano/types.VCS,
      verification_body: "DNV-GL",
      project_id: "VCS-1234",
      project_name: "Amazon Reforestation",
      country_code: "BR",
      sap_cost_center: "CC-1000",
      sap_profit_center: "PC-100",
      sap_wbs_element: "WBS-ESG-2024",
      is_retired: False,
      retired_at: None,
      retirement_reason: None,
      metadata: aiken/collection/dict.new(),
      schema_version: 1,
    }
  !validate_esg_datum(datum)
}

test test_invalid_esg_datum_future_vintage_year() {
  let datum =
    EsgCreditDatum {
      credit_id: "VCS-2101-DE-001",
      credit_type: sap_cardano/types.CarbonCredit,
      issuer: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      beneficiary: #"abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      amount: 1_000,
      unit: "kgCO2e",
      vintage_year: 2101,
      // Invalid — beyond 2100
      verification_standard: sap_cardano/types.VCS,
      verification_body: "DNV-GL",
      project_id: "VCS-9999",
      project_name: "Future Project",
      country_code: "XX",
      sap_cost_center: "CC-1000",
      sap_profit_center: "PC-100",
      sap_wbs_element: "WBS-ESG-2101",
      is_retired: False,
      retired_at: None,
      retirement_reason: None,
      metadata: aiken/collection/dict.new(),
      schema_version: 1,
    }
  !validate_esg_datum(datum)
}
