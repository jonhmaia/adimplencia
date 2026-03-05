import { createClient } from "@supabase/supabase-js";

// Cliente para o lado do servidor (API routes) — usa service role
export function createServerSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createClient(url, serviceKey || anonKey, {
        auth: { persistSession: false },
    });
}

// Cliente para o lado do navegador
export function createBrowserSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createClient(url, anonKey);
}
