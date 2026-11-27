// b1: 後面是無 padding 的 base64url。編號從 0 開始，每個 byte 由低位元往高位元排。
// 舊紀錄裡未登記的鍵用 "," 分隔，接在位元組後。
export function decodeHudSeen(value, registry) {
  const raw = String(value ?? '');
  const [head, ...extra] = raw.split(',');
  if (!/^b\d+:/.test(head)) {
    return { bytes: '', keys: new Set([head, ...extra].filter(Boolean)), legacy: true };
  }
  const payload = head.slice(3);
  if (!head.startsWith('b1:') || !/^[A-Za-z0-9_-]*$/.test(payload)) return null;
  let bytes;
  try {
    bytes = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const keys = new Set(extra.filter(Boolean));
  registry.forEach((key, id) => {
    if (bytes.charCodeAt(id >> 3) & (1 << (id & 7))) keys.add(key);
  });
  return { bytes, keys, legacy: false };
}

export function encodeHudSeen(state, registry) {
  const bytes = Array.from(state.bytes, byte => byte.charCodeAt(0));
  const extra = new Set(state.keys);
  // 從原本的位元組開始，這版登記表以外的位元也會保留。
  registry.forEach((key, id) => {
    if (extra.delete(key)) bytes[id >> 3] |= 1 << (id & 7);
  });
  const payload = btoa(Array.from(bytes, byte => String.fromCharCode(byte || 0)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return ['b1:' + payload, ...extra].join(',');
}
