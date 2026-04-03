// Supabase client singleton
let _supabase = null;
let _supabaseProxy = null;

// Sandbox helpers
const Sandbox = {
  isActive() { return sessionStorage.getItem('mumu_sandbox') === '1'; },
  enable() { sessionStorage.setItem('mumu_sandbox', '1'); document.body.classList.add('sandbox-mode'); },
  disable() { sessionStorage.removeItem('mumu_sandbox'); document.body.classList.remove('sandbox-mode'); },
};

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
  }
  return Sandbox.isActive() ? _supabaseProxy : _supabase;
}

// Proxy que intercepta escrituras en modo sandbox
function wrapSupabaseForSandbox(sb) {
  const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert'];

  return new Proxy(sb, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) => {
          const query = target.from(table);
          return new Proxy(query, {
            get(q, method) {
              if (WRITE_METHODS.includes(method)) {
                return (data) => {
                  UI.toast(`Sandbox: ${method} en ${table} bloqueado`, 'warning');
                  console.log(`[SANDBOX] ${method} ${table}:`, data);
                  // Retornar objeto compatible con la API de Supabase
                  const fakeResult = { data: null, error: null };
                  const chainable = {
                    select: () => chainable,
                    single: () => Promise.resolve(fakeResult),
                    then: (fn) => Promise.resolve(fakeResult).then(fn),
                    eq: () => chainable,
                    neq: () => chainable,
                    order: () => chainable,
                    limit: () => chainable,
                  };
                  return chainable;
                };
              }
              return q[method];
            }
          });
        };
      }
      if (prop === 'rpc') {
        return (fnName, params) => {
          if (!Sandbox.isActive()) return target.rpc(fnName, params);
          UI.toast(`Sandbox: rpc ${fnName} bloqueado`, 'warning');
          console.log(`[SANDBOX] rpc ${fnName}:`, params);
          return Promise.resolve({ data: null, error: null });
        };
      }
      // storage, auth, etc. — pasar directamente
      return target[prop];
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
