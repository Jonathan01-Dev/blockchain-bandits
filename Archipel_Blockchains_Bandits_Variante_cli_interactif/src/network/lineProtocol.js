import { safeJsonParse } from '../core/json.js';

export function sendLine(socket, obj) {
  socket.write(`${JSON.stringify(obj)}\n`);
}

export function attachLineReader(socket, onMessage) {
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx = buffer.indexOf('\n');

    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.length > 0) {
        const obj = safeJsonParse(line);
        if (obj) onMessage(obj);
      }
      idx = buffer.indexOf('\n');
    }
  });
}
