// 跟遊戲 studio_focus.mjs 的 focusReceipt 同一套：SHA-256 前 56 位元轉成 4 個字
async function focusReceipt(id) {
  const digest = new DataView(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)));
  let bits = digest.getBigUint64(0) >> 8n;
  const chars = [];
  for (let i = 0; i < 4; i++) { chars.push(0x4e00 + Number(bits & 0x3fffn)); bits >>= 14n; }
  return String.fromCharCode(...chars);
}
const DATABASE = 'nyhm-phone-activities';
let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { database = null; throw error; });
  }
  return database;
}

async function storeOperation(mode, operate) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('records', mode);
    const request = operate(transaction.objectStore('records'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function activityScope(api, key) {
  return JSON.stringify(api.mode === 'mock' ? ['mock', key] : ['worker', api.base, key]);
}

export function phoneStorage(scope) {
  const prefix = scope + ':';
  return {
    mode: 'phone',
    get: key => storeOperation('readonly', store => store.get(prefix + key)),
    set: (key, value) => storeOperation('readwrite', store => store.put(value, prefix + key)),
    remove: key => storeOperation('readwrite', store => store.delete(prefix + key)),
    list: key => storeOperation('readonly', store => store.getAll(IDBKeyRange.bound(prefix + key, prefix + key + '\uffff'))),
    reconcile(removals, snapshot) {
      return storeOperation('readwrite', store => {
        for (const key of removals) store.delete(prefix + key);
        return store.put(snapshot, prefix + 'focus-snapshot');
      });
    },
    clear: () => storeOperation('readwrite', store => store.delete(IDBKeyRange.bound(prefix, prefix + '\uffff')))
  };
}

const taipei = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', dateStyle: 'short' });
export const focusDay = time => taipei.format(new Date(time));
const focusMinutes = (snapshot, day) => Number(snapshot?.focus?.days?.find(record => record.d === day)?.m) || 0;

export function createActivityStore({ api, key, onChange, onRejected }) {
  const scope = activityScope(api, key);
  const storage = phoneStorage(scope);
  let running = Promise.resolve();

  function serialize(operation) {
    const job = running.then(() => navigator.locks ? navigator.locks.request('nyhm-activity:' + scope, operation) : operation());
    running = job.catch(() => {});
    return job;
  }

  async function sync(trackId) {
    if (!navigator.onLine || activityScope(api, key) !== scope) return { queued: true };
    const records = await storage.list('out:');
    const pending = records.filter(record => !record.sentAt).sort((a, b) => a.createdAt - b.createdAt);
    const delayed = new Set();
    let result = { queued: true };
    for (const record of pending) {
      if (activityScope(api, key) !== scope) break;
      const { kind, payload } = record;
      if (delayed.has(kind)) continue;
      const slot = 'out:' + payload.id;
      let receipt;
      try {
        receipt = await api[kind](key, kind === 'focus' ? { sessions: [payload] } : payload);
        if (receipt?.ok !== true) throw new Error(receipt?.message || '作品伺服器暫時無法儲存。');
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && ![401, 404, 408, 429].includes(error.status)) {
          await storage.remove(slot);
          onChange();
          if (payload.id === trackId) throw error;
          onRejected(kind, error);
        }
        if (error.status === 401 || error.status === 404 || !navigator.onLine) break;
        if (error.status === 429) delayed.add(kind);
        continue;
      }
      if (kind === 'focus') {
        await storage.set(slot, { ...record, sentAt: Date.now() });
      } else {
        await storage.remove(slot);
      }
      if (payload.id === trackId) result = receipt;
      else if (kind === 'coloring') onChange('畫已傳回遊戲。');
    }
    return result;
  }

  return {
    storage,
    clear: () => serialize(storage.clear),
    async submit(kind, fields) {
      const payload = { id: crypto.randomUUID(), ...fields };
      await storage.set('out:' + payload.id, { kind, payload, createdAt: Date.now(), sentAt: 0 });
      onChange();
      return serialize(() => sync(payload.id));
    },
    flush: () => serialize(() => sync()),
    receive(snapshot) {
      return serialize(async () => {
        const { focus, updatedAt } = snapshot;
        if (!focus?.days || !updatedAt) return;
        const previous = await storage.get('focus-snapshot');
        if (previous?.updatedAt >= updatedAt) return;
        const records = (await storage.list('out:')).filter(record => record.kind === 'focus' && record.sentAt && record.sentAt <= updatedAt);
        const removals = [];
        // 新版遊戲會帶已收回的收據（focus.merged），照收據精確判斷；舊版沒有才用每日增量推算。
        if (typeof focus.merged === 'string') {
          const merged = new Set(focus.merged.match(/.{4}/gu) || []);
          for (const record of records) if (merged.has(await focusReceipt(record.payload.id))) removals.push('out:' + record.payload.id);
          await storage.reconcile(removals, { focus, updatedAt });
          return;
        }
        // 快照只有每日分鐘。只用較新快照的增量扣除已送達的手機紀錄。
        for (const { d, m } of focus.days) {
          let increase = m - focusMinutes(previous, d);
          const dayRecords = records.filter(record => focusDay(record.payload.endedAt) === d)
            .sort((a, b) => a.payload.endedAt - b.payload.endedAt);
          for (const record of dayRecords) {
            if (increase < record.payload.minutes) break;
            increase -= record.payload.minutes;
            removals.push('out:' + record.payload.id);
          }
        }
        await storage.reconcile(removals, { focus, updatedAt });
      });
    },
    async today(snapshot) {
      const day = focusDay(Date.now());
      const records = await storage.list('out:');
      return focusMinutes(snapshot, day) + records.reduce((minutes, record) =>
        record.kind === 'focus' && focusDay(record.payload.endedAt) === day ? minutes + record.payload.minutes : minutes, 0);
    }
  };
}
