"use client";

import { useState, useTransition } from "react";
import { subscribeToWaitlist } from "@/app/vedett-jelzes/actions";
import type { VjFulfillmentProfile, ProductStatus } from "@/lib/vedett-jelzes/types";

interface Props {
  productSlug: string;
  productName: string;
  productStatus: ProductStatus;
  fulfillment: VjFulfillmentProfile | null;
}

export default function FeliratkozasForm({ productSlug, productName, productStatus, fulfillment }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await subscribeToWaitlist(fd);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const field = (
    name: string,
    label: string,
    defaultValue?: string | null,
    required = true,
    type = "text",
    placeholder = ""
  ) => (
    <div>
      <label className="mb-1 block text-sm font-semibold text-sni-text">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="product_slug" value={productSlug} />

      <div className="rounded-2xl bg-gray-50 border border-gray-100 px-5 py-4">
        <p className="text-sm font-bold text-sni-text mb-4">Szállítási adatok</p>
        <div className="flex flex-col gap-4">
          {field("full_name",    "Teljes név",      fulfillment?.full_name,    true, "text", "Kovács János")}
          {field("email",        "E-mail cím",      fulfillment?.email,        true, "email", "pelda@email.hu")}
          {field("phone",        "Telefonszám",     fulfillment?.phone,        false, "tel", "+36 30 000 0000")}
          {field("postal_code",  "Irányítószám",    fulfillment?.postal_code,  true, "text", "1234")}
          {field("city",         "Város",           fulfillment?.city,         true, "text", "Budapest")}
          {field("address_line", "Utca, házszám",   fulfillment?.address_line, true, "text", "Példa utca 12.")}

          <div>
            <label className="mb-1 block text-sm font-semibold text-sni-text">Ország</label>
            <input
              type="text"
              name="country"
              defaultValue={fulfillment?.country ?? "Magyarország"}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Szállítási adataidat titkosítva tároljuk, kizárólag a {productName} kiszállításához használjuk.
      </p>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-sni-brand-teal py-3 font-bold text-white shadow-md transition hover:bg-sni-brand-blue disabled:opacity-60"
      >
        {isPending
          ? "Feldolgozás..."
          : productStatus === "COMING_SOON"
          ? "Feliratkozás értesítőre"
          : "Megrendelés elküldése"}
      </button>
    </form>
  );
}
