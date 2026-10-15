"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client (anon key only). Used solely for direct-to-storage uploads with server-issued signed tokens. */
export const createBrowserSupabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
