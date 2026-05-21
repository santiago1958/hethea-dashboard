"use server";

import { createClient } from "@/lib/supabase/server";

const DELETE_PASSWORD = "Bancol125*";

export async function deleteMovimiento(
  id: number | string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password !== DELETE_PASSWORD) {
    return { ok: false, error: "Contraseña incorrecta." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión inválida." };

  const { error } = await supabase.from("movimientos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
