import crypto from 'node:crypto';
import { HKDF_INFO, HKDF_SALT } from '../core/constants.js';

export function newEphemeralKeyPair() {
  return crypto.generateKeyPairSync('x25519');
}

export function deriveSessionKey(privateKeyObj, remotePublicKeyPem) {
  const remotePublicKeyObj = crypto.createPublicKey(remotePublicKeyPem);
  const shared = crypto.diffieHellman({ privateKey: privateKeyObj, publicKey: remotePublicKeyObj });
  return crypto.hkdfSync('sha256', shared, HKDF_SALT, HKDF_INFO, 32);
}

export function encryptJson(sessionKey, payloadObj) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
  const plaintext = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: tag.toString('base64'),
  };
}

export function decryptJson(sessionKey, encryptedObj) {
  const nonce = Buffer.from(encryptedObj.nonce, 'base64');
  const ciphertext = Buffer.from(encryptedObj.ciphertext, 'base64');
  const authTag = Buffer.from(encryptedObj.authTag, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
