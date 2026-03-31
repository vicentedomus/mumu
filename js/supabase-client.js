// Supabase client singleton
let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
      console.error('Supabase no configurado. Revisa js/config.js');
      return null;
    }
    _supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      db: { schema: CONFIG.SUPABASE_SCHEMA }
    });
  }
  return _supabase;
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
