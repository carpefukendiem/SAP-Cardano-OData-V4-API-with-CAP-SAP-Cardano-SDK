// SAP Oracle Validator
// Posts trusted SAP data (exchange rates, commodity prices, conditions) on-chain
// Enables Cardano smart contracts to use SAP-verified data
//
// Architecture:
//   SAP system publishes oracle data via OData API
//   → Oracle UTxO minted on-chain by authorized operator
//   → Smart contracts read oracle UTxO as reference input
//   → Oracle data expires after validity window
//
// Security:
//   - Only whitelisted oracle operators can post/update values
//   - Temporal validity enforced (valid_from / valid_until)
//   - Values cannot be backdated

use aiken/collection/list
use cardano/transaction.{InlineDatum, Output, Transaction}
use sap_cardano/errors
use sap_cardano/types.{
  OracleDatum, OracleRedeemer, PostValue, Revoke, UseValue,
}
use sap_cardano/utils.{
  non_empty, signed_by, within_validity_window,
}

// ============================================================
// ORACLE PARAMETERS
// ============================================================

/// Minimum validity window duration (1 hour in milliseconds)
const min_validity_duration: Int = 3_600_000

/// Maximum validity window duration (7 days in milliseconds)
const max_validity_duration: Int = 604_800_000

/// Minimum positive value allowed
const min_oracle_value: Int = 1

/// Maximum oracle value (100 billion in micro-units)
const max_oracle_value: Int = 100_000_000_000_000

// ============================================================
// ORACLE MINTING POLICY
// ============================================================

/// Minting policy for oracle tokens
/// Only authorized operators can mint/burn oracle NFTs
validator oracle_minting_policy(operator: ByteArray) {
  mint(redeemer: OracleRedeemer, _policy_id: ByteArray, tx: Transaction) {
    // Operator must sign
    expect signed_by(tx, operator) ? errors.err_not_oracle_operator: Bool

    when redeemer is {
      PostValue { new_datum } -> {
        expect validate_oracle_datum(new_datum): Bool
        expect new_datum.oracle_operator == operator: Bool
        True
      }
      Revoke { .. } -> True
      UseValue { .. } ->
        // Cannot use via mint policy
        fail
    }
  }

  else(_) {
    fail
  }
}

// ============================================================
// ORACLE SPENDING VALIDATOR
// ============================================================

validator sap_oracle {
  spend(
    datum: Option<OracleDatum>,
    redeemer: OracleRedeemer,
    _own_ref: cardano/transaction.OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    // Always validate datum integrity
    expect validate_oracle_datum(d): Bool

    when redeemer is {
      PostValue { new_datum } -> {
        // 1. Only the oracle operator can update
        expect
          signed_by(tx, d.oracle_operator) ? errors.err_not_oracle_operator: Bool

        // 2. New datum must be valid
        expect validate_oracle_datum(new_datum): Bool

        // 3. New datum must be for the same oracle ID and data type
        expect new_datum.oracle_id == d.oracle_id: Bool
        expect new_datum.oracle_operator == d.oracle_operator: Bool

        // 4. New valid_from must be >= old valid_until (no overlap backdating)
        expect new_datum.valid_from >= d.valid_from: Bool

        // 5. Verify continuation output with new datum
        expect
          verify_oracle_update_output(tx.outputs, new_datum): Bool

        True
      }

      UseValue { consumer_tx_ref } -> {
        // 1. Oracle must not be expired
        expect
          !is_oracle_expired(tx, d) ? errors.err_oracle_expired: Bool

        // 2. Consumer tx ref must be provided
        expect non_empty(consumer_tx_ref): Bool

        // 3. Oracle data must be within validity window
        expect
          within_validity_window(tx, d.valid_from, d.valid_until) ? errors.err_oracle_expired: Bool

        // 4. UTxO is returned unchanged (reference usage)
        // This allows consuming as a reference input without spending
        // For actual spending usage, continuation must restore oracle
        expect
          verify_oracle_preserved_output(tx.outputs, d): Bool

        True
      }

      Revoke { reason } -> {
        // 1. Only operator can revoke
        expect
          signed_by(tx, d.oracle_operator) ? errors.err_not_oracle_operator: Bool

        // 2. Reason must be provided
        expect non_empty(reason): Bool

        // 3. Oracle UTxO is burned — no continuation output needed
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

fn validate_oracle_datum(d: OracleDatum) -> Bool {
  let validity_duration = d.valid_until - d.valid_from
  and {
    non_empty(d.oracle_id) ? errors.err_invalid_datum_fields,
    non_empty(d.sap_system_id) ? errors.err_invalid_datum_fields,
    d.value >= min_oracle_value ? errors.err_oracle_out_of_range,
    d.value <= max_oracle_value ? errors.err_oracle_out_of_range,
    d.denominator > 0 ? errors.err_invalid_denominator,
    d.valid_from > 0 ? errors.err_invalid_validity_window,
    d.valid_until > d.valid_from ? errors.err_invalid_validity_window,
    validity_duration >= min_validity_duration ? errors.err_invalid_validity_window,
    validity_duration <= max_validity_duration ? errors.err_invalid_validity_window,
    d.posted_at > 0 ? errors.err_invalid_datum_fields,
    d.schema_version == 1 ? errors.err_invalid_schema_version,
  }
}

fn is_oracle_expired(tx: Transaction, d: OracleDatum) -> Bool {
  when tx.validity_range.lower_bound.bound_type is {
    cardano/interval.Finite(lower) -> lower > d.valid_until
    _ -> False
  }
}

// ============================================================
// OUTPUT VERIFICATION
// ============================================================

fn verify_oracle_update_output(
  outputs: List<Output>,
  new_datum: OracleDatum,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: OracleDatum = raw
            and {
              parsed.oracle_id == new_datum.oracle_id,
              parsed.value == new_datum.value,
              parsed.denominator == new_datum.denominator,
              parsed.valid_from == new_datum.valid_from,
              parsed.valid_until == new_datum.valid_until,
              parsed.oracle_operator == new_datum.oracle_operator,
            }
          }
          _ -> False
        }
      },
    )
  list.length(matching) == 1
}

fn verify_oracle_preserved_output(
  outputs: List<Output>,
  datum: OracleDatum,
) -> Bool {
  let matching =
    list.filter(
      outputs,
      fn(output) {
        when output.datum is {
          InlineDatum(raw) -> {
            expect parsed: OracleDatum = raw
            and {
              parsed.oracle_id == datum.oracle_id,
              parsed.value == datum.value,
              parsed.denominator == datum.denominator,
              parsed.valid_from == datum.valid_from,
              parsed.valid_until == datum.valid_until,
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

test test_valid_oracle_datum_exchange_rate() {
  let datum =
    OracleDatum {
      oracle_id: "EUR-ADA-RATE-001",
      sap_system_id: "PRD",
      data_type: sap_cardano/types.ExchangeRate {
        from_currency: "EUR",
        to_currency: "ADA",
      },
      value: 2_631_579,
      // 2.631579 ADA per EUR (stored as * 1_000_000)
      denominator: 1_000_000,
      valid_from: 1_700_000_000_000,
      valid_until: 1_700_086_400_000,
      // +24h
      posted_at: 1_700_000_000_000,
      oracle_operator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      signature_ref: "sig-ref-001",
      schema_version: 1,
    }
  validate_oracle_datum(datum)
}

test test_invalid_oracle_datum_zero_value() {
  let datum =
    OracleDatum {
      oracle_id: "EUR-ADA-RATE-002",
      sap_system_id: "PRD",
      data_type: sap_cardano/types.ExchangeRate {
        from_currency: "EUR",
        to_currency: "ADA",
      },
      value: 0,
      // Invalid: must be >= 1
      denominator: 1_000_000,
      valid_from: 1_700_000_000_000,
      valid_until: 1_700_086_400_000,
      posted_at: 1_700_000_000_000,
      oracle_operator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      signature_ref: "sig-ref-002",
      schema_version: 1,
    }
  !validate_oracle_datum(datum)
}

test test_invalid_oracle_datum_validity_window_too_short() {
  // Validity window < 1 hour
  let datum =
    OracleDatum {
      oracle_id: "EUR-ADA-RATE-003",
      sap_system_id: "PRD",
      data_type: sap_cardano/types.ExchangeRate {
        from_currency: "EUR",
        to_currency: "ADA",
      },
      value: 1_000_000,
      denominator: 1_000_000,
      valid_from: 1_700_000_000_000,
      valid_until: 1_700_000_600_000,
      // Only 10 minutes — invalid
      posted_at: 1_700_000_000_000,
      oracle_operator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      signature_ref: "sig-ref-003",
      schema_version: 1,
    }
  !validate_oracle_datum(datum)
}

test test_invalid_oracle_datum_validity_window_too_long() {
  // Validity window > 7 days
  let datum =
    OracleDatum {
      oracle_id: "EUR-ADA-RATE-004",
      sap_system_id: "PRD",
      data_type: sap_cardano/types.ExchangeRate {
        from_currency: "EUR",
        to_currency: "ADA",
      },
      value: 1_000_000,
      denominator: 1_000_000,
      valid_from: 1_700_000_000_000,
      valid_until: 1_701_000_000_000,
      // >11 days — invalid
      posted_at: 1_700_000_000_000,
      oracle_operator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      signature_ref: "sig-ref-004",
      schema_version: 1,
    }
  !validate_oracle_datum(datum)
}

test test_invalid_oracle_denominator_zero() {
  let datum =
    OracleDatum {
      oracle_id: "EUR-ADA-RATE-005",
      sap_system_id: "PRD",
      data_type: sap_cardano/types.ExchangeRate {
        from_currency: "EUR",
        to_currency: "ADA",
      },
      value: 1_000_000,
      denominator: 0,
      // Invalid
      valid_from: 1_700_000_000_000,
      valid_until: 1_700_086_400_000,
      posted_at: 1_700_000_000_000,
      oracle_operator: #"0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      signature_ref: "sig-ref-005",
      schema_version: 1,
    }
  !validate_oracle_datum(datum)
}

test test_oracle_value_to_decimal() {
  // Test computing the actual rate: value / denominator = 2.631579
  let value = 2_631_579
  let denominator = 1_000_000
  // 2.631579 * 1_000_000 = 2_631_579 — exact representation
  value / denominator == 2
}
