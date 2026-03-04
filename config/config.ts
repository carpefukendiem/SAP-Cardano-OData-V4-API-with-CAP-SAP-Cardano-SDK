// SAP-Cardano Service Configuration
// All environment variable bindings and defaults

import { CardanoNetwork } from '../srv/utils/types';

export interface ServiceConfig {
  // Server
  port: number;
  nodeEnv: string;

  // Cardano Networks
  defaultNetwork: CardanoNetwork;

  // Blockfrost API keys (per network)
  blockfrost: {
    mainnet?: string;
    preview?: string;
    preprod?: string;
    timeout: number;
  };

  // Koios (no key required)
  koios: {
    timeout: number;
    enableFallback: boolean;
  };

  // Cache TTLs (milliseconds)
  cache: {
    transactionTtl: number;
    addressTtl: number;
    blockTtl: number;
    epochTtl: number;
    accountTtl: number;
    networkInfoTtl: number;
  };

  // SAP BTP / XSUAA (production security)
  xsuaa: {
    url?: string;
    clientId?: string;
    clientSecret?: string;
  };

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT ?? '4004', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',

    defaultNetwork: (process.env.DEFAULT_CARDANO_NETWORK ?? 'preview') as CardanoNetwork,

    blockfrost: {
      mainnet: process.env.BLOCKFROST_PROJECT_ID_MAINNET,
      preview: process.env.BLOCKFROST_PROJECT_ID_PREVIEW,
      preprod: process.env.BLOCKFROST_PROJECT_ID_PREPROD,
      timeout: parseInt(process.env.BLOCKFROST_TIMEOUT ?? '8000', 10),
    },

    koios: {
      timeout: parseInt(process.env.KOIOS_TIMEOUT ?? '10000', 10),
      enableFallback: process.env.ENABLE_KOIOS_FALLBACK !== 'false',
    },

    cache: {
      transactionTtl: parseInt(process.env.CACHE_TX_TTL ?? '60000', 10),
      addressTtl: parseInt(process.env.CACHE_ADDR_TTL ?? '15000', 10),
      blockTtl: parseInt(process.env.CACHE_BLOCK_TTL ?? '20000', 10),
      epochTtl: parseInt(process.env.CACHE_EPOCH_TTL ?? '300000', 10),
      accountTtl: parseInt(process.env.CACHE_ACCOUNT_TTL ?? '30000', 10),
      networkInfoTtl: parseInt(process.env.CACHE_NETWORK_TTL ?? '20000', 10),
    },

    xsuaa: {
      url: process.env.XSUAA_URL,
      clientId: process.env.XSUAA_CLIENT_ID,
      clientSecret: process.env.XSUAA_CLIENT_SECRET,
    },

    logLevel: (process.env.LOG_LEVEL ?? 'info') as ServiceConfig['logLevel'],
  };
}

export const config = loadConfig();
