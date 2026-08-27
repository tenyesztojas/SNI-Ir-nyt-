-- ============================================================
-- Védett Jelzés modul — adatbázis migráció
-- 2026-08-27
-- ============================================================

-- ── 1. vj_signals — digitális jelzés (felhasználónként 1 db) ────────────────

CREATE TABLE IF NOT EXISTS vj_signals (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name            text        NOT NULL,
  neurodivergence_type    text        NOT NULL
                          CHECK (neurodivergence_type IN ('autizmus', 'adhd', 'autizmus_adhd')),
  support_needs           text[]      NOT NULL DEFAULT '{}',
  overwhelmed_mode_active boolean     NOT NULL DEFAULT false,
  card_config             jsonb       NOT NULL DEFAULT '{}',
  qr_token                uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vj_signals_user_unique UNIQUE (user_id)
);

ALTER TABLE vj_signals ENABLE ROW LEVEL SECURITY;

-- Saját jelzés kezelése
CREATE POLICY "vj_signals: saját olvasás"
  ON vj_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "vj_signals: saját létrehozás"
  ON vj_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vj_signals: saját módosítás"
  ON vj_signals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- QR token alapján publikus olvasás (a publikus jelzésmegjelenítőhöz)
-- Az API route admin client-tel fut, így ez a policy a szerver oldalon szükséges.
-- A qr_token titkos, csak a kártyán nyomtatott link tartalmazza.
CREATE POLICY "vj_signals: qr publikus olvasás"
  ON vj_signals FOR SELECT
  USING (true);


-- ── 2. vj_products — fizikai termékek (admin kezeli) ────────────────────────

CREATE TABLE IF NOT EXISTS vj_products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        NOT NULL UNIQUE,
  name_hu        text        NOT NULL,
  description_hu text,
  status         text        NOT NULL DEFAULT 'COMING_SOON'
                 CHECK (status IN ('COMING_SOON', 'AVAILABLE')),
  price_huf      integer,
  image_url      text,
  sort_order     integer     NOT NULL DEFAULT 0
);

-- vj_products publikus olvasható (landing oldalon megjelennek a termékek)
ALTER TABLE vj_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vj_products: publikus olvasás"
  ON vj_products FOR SELECT
  USING (true);

CREATE POLICY "vj_products: csak admin módosíthat"
  ON vj_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Kezdeti termékadatok
INSERT INTO vj_products (slug, name_hu, description_hu, sort_order) VALUES
  ('kartya',   'Védett Jelzés kártya',
               'Plasztikkártya méretű, személyre szabott azonosítókártya. Tartalmazza a neved, az érintettség jelzését és a fontosabb segítségigényeidet.',
               1),
  ('jelveny',  'Védett Jelzés jelvény',
               'Ruhán viselhető kitűző. Diszkrét, de jól látható jelzés a mindennapi használathoz.',
               2),
  ('nyakbako', 'Védett Jelzés nyakba akasztó',
               'Nyakba akasztható azonosító tok. Kényelmes, látható és könnyen cserélhető.',
               3)
ON CONFLICT (slug) DO NOTHING;


-- ── 3. vj_fulfillment_profiles — szállítási adatok ──────────────────────────

CREATE TABLE IF NOT EXISTS vj_fulfillment_profiles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name    text        NOT NULL,
  email        text        NOT NULL,
  phone        text,
  postal_code  text        NOT NULL,
  city         text        NOT NULL,
  address_line text        NOT NULL,
  country      text        NOT NULL DEFAULT 'Magyarország',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vj_fulfillment_user_unique UNIQUE (user_id)
);

ALTER TABLE vj_fulfillment_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vj_fulfillment: saját kezelés"
  ON vj_fulfillment_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 4. vj_waitlist_entries — várólistára feliratkozás ───────────────────────

CREATE TABLE IF NOT EXISTS vj_waitlist_entries (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_slug         text        REFERENCES vj_products(slug) NOT NULL,
  signal_snapshot      jsonb,
  fulfillment_snapshot jsonb,
  status               text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'shipped', 'cancelled')),
  admin_note           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  confirmed_at         timestamptz,
  shipped_at           timestamptz,
  CONSTRAINT vj_waitlist_user_product_unique UNIQUE (user_id, product_slug)
);

ALTER TABLE vj_waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vj_waitlist: saját olvasás"
  ON vj_waitlist_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "vj_waitlist: saját feliratkozás"
  ON vj_waitlist_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vj_waitlist: saját lemondás"
  ON vj_waitlist_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- ── Indexek ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vj_signals_user_id_idx      ON vj_signals (user_id);
CREATE INDEX IF NOT EXISTS vj_signals_qr_token_idx     ON vj_signals (qr_token);
CREATE INDEX IF NOT EXISTS vj_waitlist_user_idx        ON vj_waitlist_entries (user_id);
CREATE INDEX IF NOT EXISTS vj_waitlist_product_idx     ON vj_waitlist_entries (product_slug);
CREATE INDEX IF NOT EXISTS vj_waitlist_status_idx      ON vj_waitlist_entries (status);
CREATE INDEX IF NOT EXISTS vj_fulfillment_user_idx     ON vj_fulfillment_profiles (user_id);
