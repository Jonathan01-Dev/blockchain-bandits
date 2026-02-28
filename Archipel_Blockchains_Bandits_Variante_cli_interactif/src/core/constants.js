export const ARCHIPEL_MAGIC = 'ARCHIPEL_V1';
export const ARCHIPEL_BINARY_MAGIC = Buffer.from('ARCP');
export const ARCHIPEL_PACKET_VERSION = 1;

export const PACKET_TYPES = {
  HELLO: 'HELLO',
  PEER_LIST: 'PEER_LIST',
  SECURE: 'SECURE',
  MANIFEST: 'MANIFEST',
  CHUNK_DATA: 'CHUNK_DATA',
  ACK: 'ACK',
};

export const DISCOVERY_GROUP = '239.255.42.99';
export const DISCOVERY_PORT = 6000;

export const DEFAULT_TCP_PORT = 7777;
export const HELLO_INTERVAL_MS = 30_000;
export const PEER_TIMEOUT_MS = 90_000;
export const PEER_PRUNE_MS = 24 * 60 * 60 * 1000;
export const KEEPALIVE_MS = 15_000;
export const HANDSHAKE_MAX_SKEW_MS = 120_000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const CHUNK_MAX_RETRIES = 2;
export const CHUNK_RETRY_BASE_MS = 150;
export const HMAC_BOOTSTRAP_KEY = Buffer.from('archipel-bootstrap-hmac-v1');

export const DEFAULT_CHUNK_SIZE = 512 * 1024;
export const MIN_PARALLEL_CHUNKS = 3;

export const STORAGE_ROOT = '.archipel';
export const TRUST_STORE_FILE = `${STORAGE_ROOT}/trust-store.json`;
export const PEER_STORE_FILE = `${STORAGE_ROOT}/peers.json`;
export const DOWNLOAD_DIR = `${STORAGE_ROOT}/downloads`;
export const KEY_DIR = `${STORAGE_ROOT}/keys`;
export const INDEX_DB_FILE = `${STORAGE_ROOT}/index.db`;

export const DEFAULT_REPLICATION_FACTOR = Number(process.env.ARCHIPEL_REPLICATION_FACTOR || 2);
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
export const GEMINI_API_BASE_URL = process.env.GEMINI_API_BASE_URL
  || 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_MAX_CONTEXT = Number(process.env.GEMINI_MAX_CONTEXT || 10);

export const HKDF_INFO = Buffer.from('archipel-v1');
export const HKDF_SALT = Buffer.from('archipel-salt-v1');
