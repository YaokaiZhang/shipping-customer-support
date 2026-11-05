const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function shortId(prefix: string, len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return `${prefix}-${s}`;
}
