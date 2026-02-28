export function makeLogger(nodeIdShort) {
  return {
    info: (msg) => console.log(`[${new Date().toISOString()}][${nodeIdShort}][INFO] ${msg}`),
    warn: (msg) => console.warn(`[${new Date().toISOString()}][${nodeIdShort}][WARN] ${msg}`),
    error: (msg) => console.error(`[${new Date().toISOString()}][${nodeIdShort}][ERR ] ${msg}`),
  };
}
