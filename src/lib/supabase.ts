import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      const baseHeaders = new Headers(
        init.headers || (input instanceof Request ? input.headers : undefined)
      );

      baseHeaders.set('apikey', supabaseAnonKey);
      baseHeaders.set('Authorization', `Bearer ${supabaseAnonKey}`);

      const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      let body = init.body as BodyInit | undefined;

      const shouldSerializeBody =
        body &&
        typeof body === 'object' &&
        !(body instanceof FormData) &&
        !(body instanceof Blob) &&
        !(body instanceof ArrayBuffer);

      if (['POST', 'PUT', 'PATCH'].includes(method) && shouldSerializeBody) {
        body = JSON.stringify(body);
        if (!baseHeaders.has('Content-Type')) {
          baseHeaders.set('Content-Type', 'application/json');
        }
      }

      console.log('📡 Fetching:', requestUrl, {
        ...init,
        method,
        headers: Object.fromEntries(baseHeaders.entries()),
      });

      return fetch(requestUrl, {
        ...init,
        method,
        headers: baseHeaders,
        body,
      });
    },
  },
});

// 🔍 Fonction de test de la connexion
export async function testConnection() {
  try {
    console.log('🔄 Test de connexion à Supabase...');
    const { data, error } = await supabase.from('inventory').select('*').limit(1);

    if (error) {
      console.error('❌ Erreur Supabase:', error.message);
    } else {
      console.log('✅ Connexion Supabase réussie. Exemple de données:', data);
    }
  } catch (err) {
    console.error('❌ Exception pendant le test de connexion:', err);
  }
}
