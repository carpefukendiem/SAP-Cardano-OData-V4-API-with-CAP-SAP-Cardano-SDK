# Indexing Strategy: Lazy On-Demand with TTL Cache

## Philosophy

The service uses **lazy on-demand indexing** rather than a continuous blockchain sync. Data is fetched only when requested, then cached with TTL (Time-To-Live) to reduce redundant API calls.

## TTL Values

| Entity | TTL | Rationale |
|--------|-----|-----------|
| Transaction | 60s | Immutable once confirmed (high TTL) |
| Address | 15s | Balance changes with each block (~20s) |
| Block | 20s | New block every ~20s on Cardano |
| Epoch | 5min | Epochs last ~5 days |
| Account | 30s | Rewards update each epoch |
| NetworkInfo | 20s | Tracks current slot |

## Cache Key Format

```
<entity>:<network>:<identifier>
Examples:
  tx:preview:abc123...
  addr:mainnet:addr1qxy...
  epoch:preprod:450
```

## Eviction

Expired entries are evicted lazily (on next access) or via the `evictExpired()` method (called periodically).

## Multi-Network Isolation

Each network (mainnet / preview / preprod) has its own cache namespace and its own `CardanoClient` instance with independent provider connections.

## Provider Failover

```
Request
  │
  ▼ Primary: Blockfrost (8s timeout)
  ├── OK → cache + return
  └── ConnectivityError / Timeout
        │
        ▼ Fallback: Koios (10s timeout)
        ├── OK → cache + return
        └── Error → AllProvidersFailedError (503)
```

Only `BlockchainConnectivityError` and `TimeoutError` trigger failover. `ResourceNotFoundError` (404) propagates immediately — no point trying the fallback.
