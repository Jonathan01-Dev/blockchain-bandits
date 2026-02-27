import crypto from 'node:crypto';

export function createNodeId(seed = '') {
  return crypto.createHash('sha256').update(`${seed}:${process.pid}:${Date.now()}:${Math.random()}`).digest('hex');
}
