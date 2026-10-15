"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead() {
  if (!(await getSessionProfile())) redirect("/login?next=/notifications");
  await (await createClient()).rpc("mark_notifications_read");
  revalidatePath("/notifications");
  redirect("/notifications");
}
