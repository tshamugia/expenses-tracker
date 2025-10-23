import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Use server-side environment variables (not NEXT_PUBLIC_)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
