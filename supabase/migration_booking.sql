-- ============================================================
-- VédettSarok – Booking Platform Migration
-- Futtasd a Supabase SQL Editorban
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Feature flag: booking_live = false → csak admin látja
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  key   text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'false',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, value) VALUES ('booking_live', 'false')
  ON CONFLICT (key) DO NOTHING;

-- Booking per-hely engedélyezés
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────
-- 1. provider_registrations — regisztrációs kérelmek (admin jóváhagyásig)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id        uuid REFERENCES places(id) ON DELETE SET NULL,
  -- Céges adatok
  company_name    text NOT NULL,
  contact_name    text NOT NULL,
  contact_email   text NOT NULL,
  contact_phone   text,
  tax_number      text,           -- adószám (opcionális)
  -- Foglalás típusa: 'appointment' | 'accommodation' | 'both'
  booking_type    text NOT NULL DEFAULT 'appointment'
    CHECK (booking_type IN ('appointment', 'accommodation', 'both')),
  -- Leírás pontosítása
  custom_description text,
  -- Admin workflow
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason   text,
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. provider_profiles — jóváhagyott szolgáltatók
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id        uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES provider_registrations(id),
  company_name    text NOT NULL,
  contact_email   text NOT NULL,
  contact_phone   text,
  booking_type    text NOT NULL DEFAULT 'appointment'
    CHECK (booking_type IN ('appointment', 'accommodation', 'both')),
  custom_description text,
  -- Megjelenítési beállítások
  booking_notice_hours  int NOT NULL DEFAULT 24,  -- min. előzetes foglalás (óra)
  max_advance_days      int NOT NULL DEFAULT 90,  -- max. előre foglalás (nap)
  auto_confirm          boolean NOT NULL DEFAULT false,
  cancellation_policy   text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. service_packages — szolgáltatás csomagok + árak
-- Árak: RLS csak bejelentkezett usernek látható
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  place_id        uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  -- Foglalás típusa
  package_type    text NOT NULL DEFAULT 'appointment'
    CHECK (package_type IN ('appointment', 'accommodation')),
  -- Időpont típusnál
  duration_minutes int,           -- foglalás hossza percben
  -- Szállás típusnál
  unit_name       text,           -- pl. "Szoba", "Apartman", "Sátorhely"
  max_guests      int,
  -- Ár (kötelező)
  price_amount    numeric(10,2) NOT NULL,
  price_currency  text NOT NULL DEFAULT 'HUF',
  price_unit      text NOT NULL DEFAULT 'alkalom'
    CHECK (price_unit IN ('alkalom', 'éjszaka', 'fő', 'fő/éjszaka', 'óra')),
  -- Közzétett-e
  active          boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. availability_slots — elérhetőség / nyitvatartás
-- Kétféle: recurring (hetente ismétlődő) és specific (konkrét dátum)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  package_id      uuid REFERENCES service_packages(id) ON DELETE CASCADE,
  slot_type       text NOT NULL DEFAULT 'recurring'
    CHECK (slot_type IN ('recurring', 'specific', 'blocked')),
  -- Ismétlődőnél: 0=hétfő … 6=vasárnap
  day_of_week     int CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      time,           -- pl. '09:00'
  end_time        time,           -- pl. '17:00'
  -- Konkrét dátumnál
  specific_date   date,
  -- Szállásnál: check-in / check-out dátumok blokkban
  date_from       date,
  date_to         date,
  -- Max. párhuzamos foglalás (pl. 3 szoba)
  capacity        int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. bookings — foglalások
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  package_id      uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
  place_id        uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  guest_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Foglalási adatok
  booking_type    text NOT NULL CHECK (booking_type IN ('appointment', 'accommodation')),
  -- Időpontos foglaláshoz
  appointment_date date,
  appointment_time time,
  -- Szállásos foglaláshoz
  checkin_date    date,
  checkout_date   date,
  num_guests      int NOT NULL DEFAULT 1,
  -- Kapcsolati adatok (titkosítva tároljuk a mezőneveket)
  guest_name      text NOT NULL,
  guest_email     text NOT NULL,
  guest_phone     text,
  guest_note      text,
  -- Összeg
  total_amount    numeric(10,2),
  currency        text DEFAULT 'HUF',
  -- Státusz
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  reject_reason   text,
  confirmed_at    timestamptz,
  cancelled_at    timestamptz,
  -- GDPR: adatmegőrzési határidő
  data_retention_until date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '2 years'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Indexek (lekérdezési teljesítmény)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_provider_profiles_user_id ON provider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_place_id ON provider_profiles(place_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_provider_id ON service_packages(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_place_id ON service_packages(place_id);
CREATE INDEX IF NOT EXISTS idx_availability_slots_provider_id ON availability_slots(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_user_id ON bookings(guest_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_place_id ON bookings(place_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- ─────────────────────────────────────────────────────────────
-- RLS engedélyezés
-- ─────────────────────────────────────────────────────────────
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Helper: admin ellenőrzés
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- Helper: provider ellenőrzés
CREATE OR REPLACE FUNCTION is_provider()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM provider_profiles WHERE user_id = auth.uid() AND active = true
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- feature_flags: csak admin írhat, mindenki olvashat
-- ─────────────────────────────────────────────────────────────
CREATE POLICY feature_flags_read ON feature_flags FOR SELECT USING (true);
CREATE POLICY feature_flags_admin_write ON feature_flags FOR ALL USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- provider_registrations
-- ─────────────────────────────────────────────────────────────
-- Saját regisztráció megtekintése
CREATE POLICY prov_reg_select_own ON provider_registrations FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
-- Beküldés (bejelentkezett user)
CREATE POLICY prov_reg_insert ON provider_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid() AND auth.uid() IS NOT NULL);
-- Admin módosíthat (jóváhagy/elutasít)
CREATE POLICY prov_reg_update_admin ON provider_registrations FOR UPDATE
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────
-- provider_profiles
-- ─────────────────────────────────────────────────────────────
-- Saját profil + admin
CREATE POLICY prov_profile_select ON provider_profiles FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
-- Csak admin hozhat létre (jóváhagyáskor)
CREATE POLICY prov_profile_insert_admin ON provider_profiles FOR INSERT
  WITH CHECK (is_admin());
-- Saját profil módosítása + admin
CREATE POLICY prov_profile_update ON provider_profiles FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

-- ─────────────────────────────────────────────────────────────
-- service_packages — árak CSAK bejelentkezett usernek
-- ─────────────────────────────────────────────────────────────
-- Bejelentkezett user olvashat (árak láthatósága)
CREATE POLICY packages_select_auth ON service_packages FOR SELECT
  USING (auth.uid() IS NOT NULL AND active = true);
-- Admin mindent lát
CREATE POLICY packages_select_admin ON service_packages FOR SELECT
  USING (is_admin());
-- Saját provider módosíthatja
CREATE POLICY packages_write_own ON service_packages FOR ALL
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM provider_profiles pp
      WHERE pp.id = service_packages.provider_id AND pp.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- availability_slots
-- ─────────────────────────────────────────────────────────────
-- Bejelentkezett user láthatja (foglaláshoz kell)
CREATE POLICY avail_select_auth ON availability_slots FOR SELECT
  USING (auth.uid() IS NOT NULL);
-- Saját provider kezeli
CREATE POLICY avail_write_own ON availability_slots FOR ALL
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM provider_profiles pp
      WHERE pp.id = availability_slots.provider_id AND pp.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- bookings — GDPR kritikus
-- ─────────────────────────────────────────────────────────────
-- Saját foglalás (vendég)
CREATE POLICY bookings_select_guest ON bookings FOR SELECT
  USING (guest_user_id = auth.uid());
-- Provider látja a saját helyéhez érkező foglalásokat
CREATE POLICY bookings_select_provider ON bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM provider_profiles pp
      WHERE pp.id = bookings.provider_id AND pp.user_id = auth.uid()
    )
  );
-- Admin mindent lát
CREATE POLICY bookings_select_admin ON bookings FOR SELECT
  USING (is_admin());
-- Foglalás beküldése: bejelentkezett user
CREATE POLICY bookings_insert ON bookings FOR INSERT
  WITH CHECK (guest_user_id = auth.uid() AND auth.uid() IS NOT NULL);
-- Provider frissítheti a saját foglalásait (confirm/reject)
CREATE POLICY bookings_update_provider ON bookings FOR UPDATE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM provider_profiles pp
      WHERE pp.id = bookings.provider_id AND pp.user_id = auth.uid()
    )
  );
-- Vendég lemondhat
CREATE POLICY bookings_cancel_guest ON bookings FOR UPDATE
  USING (guest_user_id = auth.uid() AND status = 'pending');
