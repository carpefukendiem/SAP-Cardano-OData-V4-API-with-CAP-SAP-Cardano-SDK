// SAP-Cardano Utility Functions
// Shared helper functions used across all SAP-Cardano validators

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{Blake2b_224, Hash, VerificationKey, VerificationKeyHash}
use aiken/primitive/bytearray
use cardano/transaction.{Input, Output, Transaction, find_input}
use cardano/value.{Value, lovelace_of}
use sap_cardano/types.{
  AddressHash, Lovelace, Metadata, SettlementParty, Timestamp,
}

// ============================================================
// SIGNATURE VERIFICATION
// ============================================================

/// Check that a given verification key hash signed this transaction
pub fn signed_by(tx: Transaction, vk_hash: AddressHash) -> Bool {
  list.has(tx.extra_signatories, vk_hash)
}

/// Require that ALL keys in a list have signed the transaction
pub fn all_signed_by(tx: Transaction, vk_hashes: List<AddressHash>) -> Bool {
  list.all(vk_hashes, fn(vk) { signed_by(tx, vk) })
}

/// Require that AT LEAST ONE key in a list has signed the transaction
pub fn any_signed_by(tx: Transaction, vk_hashes: List<AddressHash>) -> Bool {
  list.any(vk_hashes, fn(vk) { signed_by(tx, vk) })
}

/// Require that AT LEAST N keys in a list have signed the transaction (m-of-n)
pub fn threshold_signed_by(
  tx: Transaction,
  vk_hashes: List<AddressHash>,
  threshold: Int,
) -> Bool {
  let signer_count =
    list.foldr(
      vk_hashes,
      0,
      fn(vk, count) {
        if signed_by(tx, vk) {
          count + 1
        } else {
          count
        }
      },
    )
  signer_count >= threshold
}

// ============================================================
// TIME / VALIDITY RANGE CHECKS
// ============================================================

/// Check that the transaction validity range is entirely before a deadline
pub fn before_deadline(tx: Transaction, deadline: Timestamp) -> Bool {
  when tx.validity_range.upper_bound.bound_type is {
    cardano/interval.Finite(upper) -> upper <= deadline
    _ -> False
  }
}

/// Check that the transaction validity range starts after a given time
pub fn after_time(tx: Transaction, time: Timestamp) -> Bool {
  when tx.validity_range.lower_bound.bound_type is {
    cardano/interval.Finite(lower) -> lower >= time
    _ -> False
  }
}

/// Check that the current time is within the oracle's validity window
pub fn within_validity_window(
  tx: Transaction,
  valid_from: Timestamp,
  valid_until: Timestamp,
) -> Bool {
  when tx.validity_range.lower_bound.bound_type is {
    cardano/interval.Finite(lower) ->
      when tx.validity_range.upper_bound.bound_type is {
        cardano/interval.Finite(upper) ->
          lower >= valid_from && upper <= valid_until
        _ -> False
      }
    _ -> False
  }
}

// ============================================================
// VALUE / LOVELACE UTILITIES
// ============================================================

/// Sum the total lovelace across a list of outputs
pub fn total_lovelace_in_outputs(outputs: List<Output>) -> Lovelace {
  list.foldr(
    outputs,
    0,
    fn(output, acc) { acc + lovelace_of(output.value) },
  )
}

/// Check that an output contains at least a minimum lovelace amount
pub fn has_min_lovelace(output: Output, min_lovelace: Lovelace) -> Bool {
  lovelace_of(output.value) >= min_lovelace
}

/// Verify total settlement amounts match the expected total
pub fn verify_settlement_amounts(
  parties: List<SettlementParty>,
  expected_total: Lovelace,
) -> Bool {
  let computed_total =
    list.foldr(parties, 0, fn(party, acc) { acc + party.amount })
  computed_total == expected_total
}

// ============================================================
// METADATA UTILITIES
// ============================================================

/// Look up a value in the metadata dict
pub fn get_metadata(meta: Metadata, key: ByteArray) -> Option<ByteArray> {
  dict.get(meta, key)
}

/// Check that metadata contains a required key
pub fn has_metadata_key(meta: Metadata, key: ByteArray) -> Bool {
  when dict.get(meta, key) is {
    Some(_) -> True
    None -> False
  }
}

/// Build required SAP metadata keys list
pub fn required_sap_keys() -> List<ByteArray> {
  ["sap_doc_id", "sap_system_id", "created_by"]
}

/// Validate that all required SAP metadata keys are present
pub fn validate_sap_metadata(meta: Metadata) -> Bool {
  list.all(required_sap_keys(), fn(key) { has_metadata_key(meta, key) })
}

// ============================================================
// BYTEARRAY UTILITIES
// ============================================================

/// Check that a byte array is not empty
pub fn non_empty(ba: ByteArray) -> Bool {
  bytearray.length(ba) > 0
}

/// Check byte array length within bounds
pub fn valid_length(ba: ByteArray, min: Int, max: Int) -> Bool {
  let len = bytearray.length(ba)
  len >= min && len <= max
}

/// Validate a SAP document ID format (non-empty, max 35 chars per SAP standard)
pub fn valid_sap_doc_id(doc_id: ByteArray) -> Bool {
  valid_length(doc_id, 1, 35)
}

/// Validate a SAP system ID (3-character SID)
pub fn valid_sap_system_id(sid: ByteArray) -> Bool {
  bytearray.length(sid) == 3
}

/// Validate IATA/UN location code (5 chars: 2 country + 3 location)
pub fn valid_location_code(code: ByteArray) -> Bool {
  bytearray.length(code) == 5
}

// ============================================================
// LIST UTILITIES
// ============================================================

/// Count items in a list matching a predicate
pub fn count_matching(items: List<a>, predicate: fn(a) -> Bool) -> Int {
  list.foldr(
    items,
    0,
    fn(item, count) {
      if predicate(item) {
        count + 1
      } else {
        count
      }
    },
  )
}

/// Check that a list has exactly n elements
pub fn has_exactly(items: List<a>, n: Int) -> Bool {
  list.length(items) == n
}

/// Check that a list has at least n elements
pub fn has_at_least(items: List<a>, n: Int) -> Bool {
  list.length(items) >= n
}

/// Find first element matching predicate
pub fn find_first(
  items: List<a>,
  predicate: fn(a) -> Bool,
) -> Option<a> {
  list.find(items, predicate)
}

// ============================================================
// TRANSACTION OUTPUT UTILITIES
// ============================================================

/// Find an output going to a specific address (by payment credential hash)
pub fn find_output_to_address(
  outputs: List<Output>,
  addr_hash: AddressHash,
) -> Option<Output> {
  list.find(
    outputs,
    fn(output) {
      when output.address.payment_credential is {
        cardano/address.VerificationKey(hash) -> hash == addr_hash
        _ -> False
      }
    },
  )
}

/// Get all outputs going to a specific address
pub fn outputs_to_address(
  outputs: List<Output>,
  addr_hash: AddressHash,
) -> List<Output> {
  list.filter(
    outputs,
    fn(output) {
      when output.address.payment_credential is {
        cardano/address.VerificationKey(hash) -> hash == addr_hash
        _ -> False
      }
    },
  )
}

/// Verify no additional scripts are being run (prevent draining attacks)
pub fn no_other_scripts(tx: Transaction, own_script_hash: ByteArray) -> Bool {
  let script_inputs =
    list.filter(
      tx.inputs,
      fn(input) {
        when input.output.address.payment_credential is {
          cardano/address.Script(hash) -> hash != own_script_hash
          _ -> False
        }
      },
    )
  list.is_empty(script_inputs)
}
