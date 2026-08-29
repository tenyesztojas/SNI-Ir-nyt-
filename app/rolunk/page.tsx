import { Heart, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYoutubeEmbedUrl } from "@/lib/media-utils";

export const dynamic = "force-dynamic";

async function getMediaAppearances() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("media_appearances")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export const metadata = {
  title: "Rólunk – VédettSarok",
  description:
    "A VédettSarok egy közösségi térkép és tudástár, amely autizmussal és ADHD-val érintett családoknak, felnőtteknek és szakembereknek segít biztonságos helyeket találni.",
};

export default async function RolunkPage() {
  const mediaItems = await getMediaAppearances();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Fejléc */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sni-brand-teal/10">
          <Heart className="text-sni-brand-teal" size={22} />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900">Rólunk</h1>
      </div>

      <div className="mt-8 space-y-6 text-base leading-relaxed text-gray-800">
        <p>
          A <strong>VédettSarok</strong> egy magyar nyelvű, közösségi alapú webapplikáció, amely autizmussal és ADHD-val
          élő gyermekek családjainak, érintett felnőtteknek és segítő szakembereknek segít biztonságosabb, elfogadóbb és
          kiszámíthatóbb helyeket találni.
        </p>

        <p>
          Az alkalmazás lényege egyszerű: a felhasználók kereshetnek a térképen és a helylistában, megnézhetik mások
          tapasztalatait, majd saját élményeik alapján ők is ajánlhatnak vagy értékelhetnek helyeket. Így fokozatosan egy
          olyan közösségi tudástár épül, amely valós családi és érintetti tapasztalatokon alapul.
        </p>

        <p>
          A VédettSarok <strong>nem orvosi, diagnosztikai vagy terápiás szolgáltatás</strong>. Nem azt állítja, hogy egy
          hely minden autista vagy ADHD-val élő ember számára biztosan megfelelő, hanem abban segít, hogy a családok
          előzetesen tájékozódhassanak: mennyire nyugodt, elfogadó, szenzorosan terhelhető vagy kiszámítható az adott hely.
        </p>

        <p>
          A webapplikációban ajánlhatók például éttermek, kávézók, játszóterek, játszóházak, fodrászok, orvosi rendelők,
          fogorvosok, fejlesztőhelyek, múzeumok, szállások, kirándulóhelyek és családi programok. A cél nem egy általános
          értékelőoldal létrehozása, hanem egy speciális, bizalmi tér, ahol a legfontosabb kérdés az:{" "}
          <em>&bdquo;El tudok-e ide menni nyugodtabban a gyermekemmel vagy érintettként?&rdquo;</em>
        </p>

        <p>
          Az első verzió célja egy egyszerűen használható, mobilbarát rendszer, ahol lehet helyet keresni, új helyet
          beküldeni, tapasztalatot megosztani és térképen böngészni. A hosszabb távú cél egy országos, megbízható,
          moderált adatbázis létrehozása, amely valódi segítséget ad a mindennapi döntésekhez.
        </p>

        {/* Üzenet kiemelő doboz */}
        <div className="rounded-2xl bg-gradient-to-br from-sni-brand-teal/10 to-sni-brand-blue/10 border border-sni-brand-teal/20 px-6 py-5 text-center">
          <p className="text-lg font-bold text-sni-brand-navy">
            A VédettSarok üzenete: itt biztonságban vagy.
          </p>
        </div>
      </div>

      {/* Médiamegjelenések */}
      {mediaItems.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-extrabold text-gray-900">Médiamegjelenések</h2>
          <div className="mt-6 flex flex-col gap-8">
            {mediaItems.map((item) => {
              if (item.type === "youtube") {
                const embedUrl = getYoutubeEmbedUrl(item.url);
                if (!embedUrl) return null;
                return (
                  <div key={item.id}>
                    <p className="mb-2 font-semibold text-gray-800">{item.title}</p>
                    {item.published_at && (
                      <p className="mb-2 text-xs text-gray-400">
                        {new Date(item.published_at).toLocaleDateString("hu-HU", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-black aspect-video">
                      <iframe
                        src={embedUrl}
                        title={item.title}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                );
              }

              // Cikk – külső link
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5 transition hover:border-sni-brand-teal/40 hover:bg-sni-brand-teal/5"
                >
                  <ExternalLink className="mt-0.5 shrink-0 text-sni-brand-teal" size={20} />
                  <div>
                    <p className="font-semibold text-gray-900 group-hover:text-sni-brand-navy">
                      {item.title}
                    </p>
                    {item.published_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(item.published_at).toLocaleDateString("hu-HU", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
