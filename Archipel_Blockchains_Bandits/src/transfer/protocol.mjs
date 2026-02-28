export const ACK_STATUS = {
  OK: 0x00,
  HASH_MISMATCH: 0x01,
  NOT_FOUND: 0x02,
};

export const TRANSFER_FRAME_TYPE = {
  CHUNK_REQ: 0x30,
  CHUNK_DATA: 0x31,
  ACK: 0x32,
};
