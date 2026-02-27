export function makeLogger(nodeLabel) {
  return {
    info: (msg) => console.log(`[${new Date().toISOString()}][${nodeLabel}][INFO] ${msg}`),
    warn: (msg) => console.warn(`[${new Date().toISOString()}][${nodeLabel}][WARN] ${msg}`),
    error: (msg) => console.error(`[${new Date().toISOString()}][${nodeLabel}][ERR ] ${msg}`),
  };
}
