"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = { error?: string; info?: string } | null;

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Add meg az emailt és a jelszót." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Hibás email vagy jelszó." };
  }

  revalidatePath("/", "layout");
  redirect("/profil");
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password || !displayName) {
    return { error: "Tölts ki minden mezőt." };
  }
  if (password.length < 6) {
    return { error: "A jelszó legalább 6 karakter legyen." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "Ezzel az emaillel már van regisztráció." };
    }
    return { error: "Nem sikerült a regisztráció. Próbáld újra." };
  }

  if (!data.session) {
    return { info: "Sikeres regisztráció! Erősítsd meg az emailcímedet a belépéshez." };
  }

  revalidatePath("/", "layout");
  redirect("/profil");
}

export async function signOutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
