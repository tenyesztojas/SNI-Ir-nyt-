import { createClient } from "@/lib/supabase/server";
import ProgramForm from "./ProgramForm";
import { CalendarDays, MapPin, ExternalLink } from "lucide-react";

export const metadata = {
  title: "Programajánló – VédettSarok",
  description: "Autizmus- és ADHD-barát programok, rendezvények",
};

export const revalidate = 60;

export default async function ProgramajanlokPage() {
  const supabase = createClient();
  const { data: programs } = await supabase
    .from("programs")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-sni-text">Programajánló</h1>
      <p className="mt-3 text-gray-600">
        Autizmus- és ADHD-barát programok, rendezvények közösségi gyűjteménye.
        Minden beküldött program admin jóváhagyásával kerül közzé.
      </p>

      {/* Jóváhagyott programok */}
      {programs && programs.length > 0 ? (
        <div className="mt-8 space-y-4">
          {programs.map((p) => (
            <div key={p.id} className="card">
              <h2 className="text-lg font-bold text-sni-text">{p.name}</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                <span className="flex items-center gap-1"><MapPin size={14} />{p.location}</span>
                <span className="flex items-center gap-1"><CalendarDays size={14} />{p.event_date}</span>
              </div>
              <p className="mt-2 text-sm text-gray-700">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sni-brand-blue hover:underline">
                    <ExternalLink size={14} /> Webcím
                  </a>
                )}
                {p.contact && (
                  <span className="text-gray-500">Kontakt: {p.contact}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg bg-gray-50 border border-gray-200 p-6 text-center text-sm text-gray-500">
          Még nincs jóváhagyott program. Küld be az elsőt!
        </div>
      )}

      {/* Beküldő form */}
      <div className="mt-12 border-t pt-8">
        <h2 className="text-xl font-bold text-sni-text">Program beküldése</h2>
        <p className="mt-1 text-sm text-gray-500">
          A beküldött program admin jóváhagyása után jelenik meg a listában.
        </p>
        <div className="mt-5 card">
          <ProgramForm />
        </div>
      </div>
    </div>
  );
}
