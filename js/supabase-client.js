import { createClient } from '@supabase/supabase-js';
const _SURL = import.meta.env.VITE_SUPABASE_URL;
const _SKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supa = createClient(_SURL, _SKEY);
