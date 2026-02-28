export function isTimestampFresh(ts, maxSkewMs, nowMs = Date.now()) {
  if (typeof ts !== 'number' || Number.isNaN(ts)) return false;
  return Math.abs(nowMs - ts) <= maxSkewMs;
}
