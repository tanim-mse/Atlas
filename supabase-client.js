import { CONFIG } from "./config.js";

export const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
    storageKey: "atlas-auth"
  }
});

export async function insertOwned(table, payload) {
  const { data: { user } } = await sb.auth.getUser();
  const uid = user?.id;
  if (!uid) throw new Error("Not authenticated");
  const rows = Array.isArray(payload)
    ? payload.map(r => ({ ...r, user_id: uid }))
    : { ...payload, user_id: uid };
  return sb.from(table).insert(rows).select();
}

export async function signInWithPassword(email, password) {
  if (email.toLowerCase() !== CONFIG.OWNER_EMAIL.toLowerCase()) {
    throw new Error("This instance of Atlas is private.");
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  if (email.toLowerCase() !== CONFIG.OWNER_EMAIL.toLowerCase()) {
    throw new Error("This instance of Atlas is private.");
  }
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function currentUser() {
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

export async function hasPasskey() {
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) return false;
  return (data?.all ?? []).some(f => f.factor_type === "webauthn" && f.status === "verified");
}

export async function enrollPasskey(label = "This device") {
  if (!window.PublicKeyCredential) throw new Error("Passkeys aren't supported on this browser.");
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "webauthn", friendlyName: label });
  if (error) throw error;
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: data.id });
  if (chErr) throw chErr;
  const cred = await navigator.credentials.create({ publicKey: ch.credentialOptions.publicKey });
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: data.id, challengeId: ch.id, credential: cred });
  if (vErr) throw vErr;
  return true;
}

export async function signInWithPasskey() {
  if (!window.PublicKeyCredential) throw new Error("Passkeys aren't supported on this browser.");
  const user = await currentUser();
  if (!user) throw new Error("Sign in once with your password, then enroll a passkey.");
  const { data: list } = await sb.auth.mfa.listFactors();
  const factor = (list?.all ?? []).find(f => f.factor_type === "webauthn" && f.status === "verified");
  if (!factor) throw new Error("No passkey enrolled yet.");
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if (chErr) throw chErr;
  const cred = await navigator.credentials.get({ publicKey: ch.credentialOptions.publicKey });
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, credential: cred });
  if (vErr) throw vErr;
  return true;
}
