// POST /api/push/notify szerveroldali jogosultság-ellenőrzése (függőségmentes,
// tesztelhető; a route csak beköti a függőségeket).
//
// KIZÁRÓLAG bejelentkezett ADMIN (profiles.role = 'admin', a meglévő
// isCurrentUserAdmin()) küldhet validált címet / szöveget / saját oldalra
// mutató relatív URL-t az adminoknak. Minden más kérés (anonim, nem admin)
// elutasítva, belső részletek nélkül ({ ok: false }).
// A programajánló értesítése NEM ezen megy: azt a szerveroldali beküldés
// küldi egy sikeres beszúrás után (app/programajanlok/actions.ts).

export const DEFAULT_ADMIN_URL = "/admin";

const MAX_TITLE = 120;
const MAX_BODY = 500;
const MAX_URL = 200;
// Csak saját oldalra mutató relatív útvonal: "/" kezdet, nincs "//" vagy "/\"
// (protokoll-relatív külső link), nincs szóköz / vezérlőkarakter.
const RELATIVE_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~/?#=&%]*$/;

export interface AdminNotifyInput {
  title: string;
  body: string;
  url: string | null;
}

export interface AdminNotifyDeps {
  isAdmin(): Promise<boolean>;
  send(title: string, body: string, url: string): Promise<void>;
}

export interface AdminNotifyResult {
  status: 200 | 400 | 403;
  body: { ok: boolean };
}

const result = (status: AdminNotifyResult["status"]): AdminNotifyResult => ({ status, body: { ok: status === 200 } });

export function parseAdminNotifyRequest(raw: unknown): AdminNotifyInput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string" || typeof r.body !== "string") return null;
  const title = r.title.trim();
  const body = r.body.trim();
  if (title.length === 0 || title.length > MAX_TITLE) return null;
  if (body.length === 0 || body.length > MAX_BODY) return null;
  let url: string | null = null;
  if (r.url !== undefined && r.url !== null) {
    if (typeof r.url !== "string" || r.url.length > MAX_URL || !RELATIVE_PATH.test(r.url)) return null;
    url = r.url;
  }
  return { title, body, url };
}

export async function handleAdminNotify(raw: unknown, deps: AdminNotifyDeps): Promise<AdminNotifyResult> {
  // Jogosultság ELŐBB: nem adminnak a bemenet helyességéről sem adunk visszajelzést.
  let admin = false;
  try {
    admin = await deps.isAdmin();
  } catch {
    admin = false;
  }
  if (!admin) return result(403);

  const input = parseAdminNotifyRequest(raw);
  if (!input) return result(400);

  await deps.send(input.title, input.body, input.url ?? DEFAULT_ADMIN_URL);
  return result(200);
}
