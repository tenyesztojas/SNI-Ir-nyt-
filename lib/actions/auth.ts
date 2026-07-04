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

  if (!email || !password) return { error: "Add meg az emailt és a jelszót." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "Hibás email vagy jelszó." };

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
  const noNewsletter = formData.get("noNewsletter") === "on";

  if (!email || !password || !displayName) return { error: "Tölts ki minden mezőt." };
  if (password.length < 6) return { error: "A jelszó legalább 6 karakter legyen." };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered"))
      return { error: "Ezzel az emaillel már van regisztráció." };
    return { error: "Nem sikerült a regisztráció. Próbáld újra." };
  }

  if (data.user && !noNewsletter === false) {
    await supabase
      .from("profiles")
      .update({ newsletter_subscribed: !noNewsletter })
      .eq("id", data.user.id);
  }

  if (!data.session) {
    return { info: "Sikeres regisztráció! Erősítsd meg az emailcímedet a belépéshez." };
  }

  revalidatePath("/", "layout");
  redirect("/profil");
}

export async function changePasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword)
    return { error: "Tölts ki minden mezőt." };
  if (newPassword.length < 6)
    return { error: "Az új jelszó legalább 6 karakter legyen." };
  if (newPassword !== confirmPassword)
    return { error: "A két jelszó nem egyezik." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.email) return { error: "Nem vagy bejelentkezve." };

  // Jelenlegi jelszó ellenőrzése
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (verifyError) return { error: "A jelenlegi jelszó helytelen." };

  // Új jelszó beállítása
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: "Nem sikerült a jelszóváltoztatás. Próbáld újra." };

  return { info: "Jelszó sikeresen megváltoztatva." };
}

export async function signOutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export type ProfileActionState = { error?: string; success?: boolean } | null;

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Nem vagy bejelentkezve." };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const showFirstName = formData.get("showFirstName") === "on";
  const displayName = String(formData.get("displayName") ?? "").trim();
  const newsletterSubscribed = formData.get("newsletterSubscribed") === "on";

  const update: Record<string, unknown> = {
    show_first_name: showFirstName,
    newsletter_subscribed: newsletterSubscribed,
  };
  if (firstName) update.first_name = firstName;
  if (displayName.length >= 2) update.display_name = displayName;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userData.user.id);

  if (error) return { error: "Nem sikerült menteni. Próbáld újra." };

  revalidatePath("/profil");
  return { success: true };
}
