import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getMySignal } from "@/lib/vedett-jelzes/data";
import {
  NEURODIVERGENCE_LABELS,
  SUPPORT_NEEDS_CATALOG,
} from "@/lib/vedett-jelzes/types";
import DigitalisKartya from "./DigitalisKartya";

export const metadata = {
  title: "Védett Jelzés – Digitális kártya",
};

export const dynamic = "force-dynamic";

export default async function KijelzesPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes?next=/vedett-jelzes/sajat-jelzes/kijelzes");

  const signal = await getMySignal();
  if (!signal) redirect("/vedett-jelzes/sajat-jelzes");

  const needLabels = SUPPORT_NEEDS_CATALOG.filter((n) =>
    signal.support_needs.includes(n.id)
  ).map((n) => n.label);

  const qrUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/vj/${signal.qr_token}`;

  return (
    <DigitalisKartya
      displayName={signal.display_name}
      neurodivergenceLabel={NEURODIVERGENCE_LABELS[signal.neurodivergence_type]}
      needLabels={needLabels}
      overwhelmedMode={signal.overwhelmed_mode_active}
      qrUrl={qrUrl}
      signalId={signal.id}
    />
  );
}
