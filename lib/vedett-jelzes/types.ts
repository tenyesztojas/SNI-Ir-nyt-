// Védett Jelzés modul — TypeScript típusok és katalógusok

// ── Enum-szerű típusok ────────────────────────────────────────────────────────

export type NeurodivergenceType = "autizmus" | "adhd" | "autizmus_adhd";
export type WaitlistStatus = "pending" | "confirmed" | "shipped" | "cancelled";
export type ProductStatus = "COMING_SOON" | "AVAILABLE";

// ── DB modellek ───────────────────────────────────────────────────────────────

export interface VjSignal {
  id: string;
  user_id: string;
  display_name: string;
  neurodivergence_type: NeurodivergenceType;
  support_needs: string[];          // support need ID-k
  overwhelmed_mode_active: boolean;
  card_config: Record<string, unknown>;
  qr_token: string;                 // uuid — publikus QR linkhez
  created_at: string;
  updated_at: string;
}

export interface VjProduct {
  id: string;
  slug: string;                     // 'kartya' | 'jelveny' | 'nyakbako'
  name_hu: string;
  description_hu: string | null;
  status: ProductStatus;
  price_huf: number | null;
  image_url: string | null;
  sort_order: number;
}

export interface VjFulfillmentProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  postal_code: string;
  city: string;
  address_line: string;
  country: string;
  updated_at: string;
}

export interface VjWaitlistEntry {
  id: string;
  user_id: string;
  product_slug: string;
  signal_snapshot: VjSignalSnapshot | null;
  fulfillment_snapshot: VjFulfillmentSnapshot | null;
  status: WaitlistStatus;
  admin_note: string | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  // Joined
  product?: VjProduct;
}

// Snapshot típusok (feliratkozáskor rögzített állapot)
export interface VjSignalSnapshot {
  display_name: string;
  neurodivergence_type: NeurodivergenceType;
  support_needs: string[];
}

export interface VjFulfillmentSnapshot {
  full_name: string;
  email: string;
  phone: string | null;
  postal_code: string;
  city: string;
  address_line: string;
  country: string;
}

// ── Katalógusok (hardcoded — nem kell admin UI) ───────────────────────────────

export interface SupportNeedItem {
  id: string;
  category: "kommunikacio" | "erzekszervi" | "segitseg" | "egyeb";
  label: string;
  description?: string;
}

export const NEURODIVERGENCE_LABELS: Record<NeurodivergenceType, string> = {
  autizmus:      "Autizmus spektrum",
  adhd:          "ADHD",
  autizmus_adhd: "Autizmus spektrum és ADHD",
};

export const SUPPORT_NEEDS_CATALOG: SupportNeedItem[] = [
  // Kommunikáció
  { id: "lassu_beszelj",     category: "kommunikacio", label: "Kérlek, lassan és érthetően beszélj" },
  { id: "egyszeruen",        category: "kommunikacio", label: "Egyszerű mondatokat használj" },
  { id: "irj_le",            category: "kommunikacio", label: "Írd le, ha nem értem szóban" },
  { id: "ne_szemkontakt",    category: "kommunikacio", label: "A szemkontaktus nehéz számomra" },
  { id: "valasz_ido",        category: "kommunikacio", label: "Adj időt a válaszra" },
  // Érzékszervi
  { id: "csendes_ter",       category: "erzekszervi",  label: "Csendes helyre van szükségem" },
  { id: "teli_ter_nehez",    category: "erzekszervi",  label: "Teli, zajos tér nehéz számomra" },
  { id: "ne_erj",            category: "erzekszervi",  label: "Kérlek, ne érj hozzám" },
  { id: "eros_feny",         category: "erzekszervi",  label: "Az erős fényre érzékeny vagyok" },
  { id: "szag_erzekeny",     category: "erzekszervi",  label: "Erős illatokra / szagokra érzékeny vagyok" },
  // Segítség
  { id: "segitseg_kell",     category: "segitseg",     label: "Segítségre van szükségem" },
  { id: "kiserore_varok",    category: "segitseg",     label: "Kísérőre várok" },
  { id: "elvesztem",         category: "segitseg",     label: "Elvesztem / nem tudom, merre menjek" },
  { id: "nyugalom_kell",     category: "segitseg",     label: "Nyugodt helyre van szükségem" },
  // Egyéb
  { id: "nem_verbalis",      category: "egyeb",        label: "Esetleg nem verbálisan kommunikálok" },
  { id: "rutintores_nehez",  category: "egyeb",        label: "A rutinváltás nehéz számomra" },
];

export const SUPPORT_NEED_CATEGORIES: Record<SupportNeedItem["category"], string> = {
  kommunikacio: "Kommunikáció",
  erzekszervi:  "Érzékszervi igények",
  segitseg:     "Segítség",
  egyeb:        "Egyéb",
};

export const PRODUCT_SLUGS = ["kartya", "jelveny", "nyakbako"] as const;
export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export const PRODUCT_SLUG_LABELS: Record<ProductSlug, string> = {
  kartya:   "Védett Jelzés kártya",
  jelveny:  "Védett Jelzés jelvény",
  nyakbako: "Védett Jelzés nyakba akasztó",
};

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  pending:   "Várólistán",
  confirmed: "Visszaigazolva",
  shipped:   "Kiszállítva",
  cancelled: "Lemondva",
};
