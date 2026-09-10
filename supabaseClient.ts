// src/lib/supabaseClient.ts
//
// Direct browser -> Supabase connection. Uses the ANON key only
// (safe to ship to the client — never put the service-role key here).
// Requires two env vars set in Vercel Project Settings > Environment
// Variables (and locally in .env.local for dev):
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...   (the "anon" / "public" key from
//     Supabase Dashboard > Settings > API — NOT the service_role key)
//
// This bypasses the server (api/index.ts / tRPC) entirely for reads.
// Row Level Security policies on each table now control what the
// browser is allowed to see — make sure `bb_orders` and
// `chat_customer_messages` have a SELECT policy that allows the
// anon role to read, or these queries will come back empty.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fails loudly in the console instead of silently returning empty
  // data, so a missing env var is obvious immediately.
  console.error(
    "[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Set these in Vercel Project Settings > Environment Variables."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");
