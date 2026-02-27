export const PROTOCOL = {
  VERSION: 'v1',
  MAGIC: 'ARCH',
};

export const NETWORK = {
  DISCOVERY_GROUP: '239.255.42.99',
  DISCOVERY_PORT: 6000,
  DEFAULT_TCP_PORT: 7777,
  HELLO_INTERVAL_MS: 30_000,
  PEER_STALE_MS: 90_000,
};

export const SECURITY = {
  HANDSHAKE_MAX_SKEW_MS: 120_000,
  HKDF_INFO: 'archipel-v1',
  HKDF_SALT: 'archipel-salt-v1',
};

export const TRANSFER = {
  DEFAULT_CHUNK_SIZE: 512 * 1024,
  MAX_RETRIES: 2,
  RETRY_BACKOFF_MS: 150,
};

export const STORAGE = {
  ROOT: '.archipel',
  PEERS_FILE: '.archipel/peers.json',
  TRUST_FILE: '.archipel/trust-store.json',
  DOWNLOADS_DIR: '.archipel/downloads',
  KEYS_DIR: '.archipel/keys',
};
