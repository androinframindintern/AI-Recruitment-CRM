import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && serviceKey && anonKey);

function createStubClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: null }, error: { message: 'Supabase auth is not configured' } };
      },
      admin: {
        async listUsers() {
          return { data: { users: [] }, error: { message: 'Supabase auth is not configured' } };
        },
      },
    },
    from() {
      return {
        select() { return this; },
        insert() { return this; },
        update() { return this; },
        upsert() { return this; },
        delete() { return this; },
        eq() { return this; },
        neq() { return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({ data: null, error: { message: 'Supabase database is not configured' } }),
        single: async () => ({ data: null, error: { message: 'Supabase database is not configured' } }),
        then(resolve) {
          return Promise.resolve({ data: [], error: { message: 'Supabase database is not configured' } }).then(resolve);
        },
      };
    },
    storage: {
      from() {
        return {
          async upload() {
            return { data: null, error: { message: 'Supabase storage is not configured' } };
          },
          getPublicUrl(path = '') {
            return { data: { publicUrl: path } };
          },
        };
      },
    },
  };
}

if (!supabaseConfigured) {
  console.warn('Supabase env vars missing — backend will run in limited demo mode until configured');
}

export const supabaseAdmin = supabaseConfigured
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : createStubClient();

export function supabaseAsUser(accessToken) {
  if (!url || !anonKey) return createStubClient();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
