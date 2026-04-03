// Supabase client singleton
let _supabase = null;
let _supabaseProxy = null;

// Sandbox helpers
const Sandbox = {
  isActive() { return sessionStorage.getItem('mumu_sandbox') === '1'; },
  enable()  { sessionStorage.setItem('mumu_sandbox', '1'); document.body.classList.add('sandbox-mode'); },
  disable() { sessionStorage.removeItem('mumu_sandbox'); document.body.classList.remove('sandbox-mode'); SandboxStore.clear(); },
};

// In-memory store for sandbox mutations — cleared on exit or page close
const SandboxStore = {
  _hidden:  {},  // { table: Set<id> } — rows to exclude from reads
  _patches: {},  // { table: Map<id, fields> } — field overrides

  clear() { this._hidden = {}; this._patches = {}; },

  hide(table, id) {
    if (!this._hidden[table]) this._hidden[table] = new Set();
    this._hidden[table].add(id);
  },

  patch(table, id, fields) {
    if (!this._patches[table]) this._patches[table] = new Map();
    const existing = this._patches[table].get(id) || {};
    this._patches[table].set(id, { ...existing, ...fields });
  },

  applyToResults(table, rows) {
    if (!rows || !Array.isArray(rows)) return rows;

    const hidden = this._hidden[table];
    let result = hidden ? rows.filter(r => !hidden.has(r.id)) : [...rows];

    const patches = this._patches[table];
    if (patches) {
      result = result.map(r => patches.has(r.id) ? { ...r, ...patches.get(r.id) } : r);
    }

    return result.map(r => this._deepPatch(r));
  },

  // Recursively patch nested relations by matching IDs across all tables
  _deepPatch(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const patched = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key of Object.keys(patched)) {
      const val = patched[key];
      if (Array.isArray(val)) {
        patched[key] = val
          .filter(item => {
            if (!item?.id) return true;
            for (const ids of Object.values(this._hidden)) {
              if (ids.has(item.id)) return false;
            }
            return true;
          })
          .map(item => {
            if (!item?.id) return item;
            let result = item;
            for (const patchMap of Object.values(this._patches)) {
              if (patchMap.has(item.id)) result = { ...result, ...patchMap.get(item.id) };
            }
            return this._deepPatch(result);
          });
      } else if (typeof val === 'object' && val !== null) {
        patched[key] = this._deepPatch(val);
      }
    }
    return patched;
  }
};

// Dynamic proxy: routes each call to sandbox proxy or real client at call-time,
// so code that captured `sb = getSupabase()` early still goes through sandbox
// if it was enabled later.
let _dynamicProxy = null;

function getSupabase() {
  if (!_supabase) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
      console.error('Supabase no configurado. Revisa js/config.js');
      return null;
    }
    _supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      db: { schema: CONFIG.SUPABASE_SCHEMA }
    });
    _supabaseProxy = wrapSupabaseForSandbox(_supabase);
    _dynamicProxy = new Proxy(_supabase, {
      get(_, prop) {
        const target = Sandbox.isActive() ? _supabaseProxy : _supabase;
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }
    });
  }
  return _dynamicProxy;
}

// Proxy: intercepts writes (stores in memory) and patches reads
function wrapSupabaseForSandbox(sb) {
  const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert'];

  // Wrap a read query builder so .then() patches results from SandboxStore
  function wrapReadQuery(query, table) {
    return new Proxy(query, {
      get(target, prop) {
        if (WRITE_METHODS.includes(prop)) {
          return (data) => createWriteChain(table, prop, data);
        }

        if (prop === 'then') {
          return (onRes, onRej) => target.then((result) => {
            if (result?.data) {
              if (Array.isArray(result.data)) {
                result = { ...result, data: SandboxStore.applyToResults(table, result.data) };
              } else if (result.data.id) {
                const [patched] = SandboxStore.applyToResults(table, [result.data]);
                result = { ...result, data: patched || null };
              }
            }
            return onRes ? onRes(result) : result;
          }, onRej);
        }

        const val = target[prop];
        if (typeof val !== 'function') return val;

        return (...args) => {
          const result = val.apply(target, args);
          if (result && typeof result.then === 'function' && typeof result.eq === 'function') {
            return wrapReadQuery(result, table);
          }
          return result;
        };
      }
    });
  }

  // Build a fake write chain that records the op and returns success
  function createWriteChain(table, method, data) {
    const filters = [];

    function resolve() {
      const idFilter = filters.find(f => f.col === 'id');
      const id = idFilter?.val;

      if (method === 'update' && id) {
        SandboxStore.patch(table, id, data);
        if (data.active === false) SandboxStore.hide(table, id);
      } else if (method === 'delete' && id) {
        SandboxStore.hide(table, id);
      }

      console.log(`[SANDBOX] ${method} ${table}:`, data, filters);
      return Promise.resolve({ data: null, error: null });
    }

    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'eq')     return (col, val) => { filters.push({ col, val }); return chain; };
        if (prop === 'neq')    return () => chain;
        if (prop === 'in')     return () => chain;
        if (prop === 'not')    return () => chain;
        if (prop === 'select') return () => chain;
        if (prop === 'single') return () => resolve();
        if (prop === 'order')  return () => chain;
        if (prop === 'limit')  return () => chain;
        if (prop === 'then')   return (onRes, onRej) => resolve().then(onRes, onRej);
        return undefined;
      }
    });

    return chain;
  }

  return new Proxy(sb, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) => wrapReadQuery(target.from(table), table);
      }
      if (prop === 'rpc') {
        return (fnName, params) => {
          console.log(`[SANDBOX] rpc ${fnName}:`, params);
          // Map known RPCs to SandboxStore operations
          if (fnName === 'delete_sale' && params?.p_sale_id) {
            SandboxStore.hide('sales', params.p_sale_id);
          }
          if (fnName === 'register_sale' && params?.p_variant_id) {
            // No need to add — the real DB won't have it, and re-reads won't include it
          }
          return Promise.resolve({ data: null, error: null });
        };
      }
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

// Helper: sb.from() ya apunta al schema mumu automáticamente
// Para llamar funciones RPC del schema mumu:
async function dbRpc(fnName, params = {}) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no disponible');
  return sb.rpc(fnName, params);
}

// Auth helpers
async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function signIn(email, password) {
  const sb = getSupabase();
  return sb.auth.signInWithPassword({ email, password });
}

async function signOut() {
  const sb = getSupabase();
  return sb.auth.signOut();
}
