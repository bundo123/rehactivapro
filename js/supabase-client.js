import { createClient } from '@supabase/supabase-js';
const _SURL = import.meta.env.VITE_SUPABASE_URL || 'https://cgilpnjgrnxqmrkhaxkx.supabase.co';
const _SKEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnaWxwbmpncm54cW1ya2hheGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjUzNDcsImV4cCI6MjA5MDg0MTM0N30.xuVP5uq5DxOoEX36HbdSASDkIwKs0dTd7xoQalc-CqI';
export const supa = createClient(_SURL, _SKEY);
