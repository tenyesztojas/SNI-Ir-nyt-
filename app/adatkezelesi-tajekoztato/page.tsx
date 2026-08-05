import Link from "next/link";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="mb-4 text-xl font-bold text-sni-text border-b border-gray-200 pb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-700 leading-relaxed">{children}</p>;
}

function Sub({ n, title, children }: { n: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      {title ? (
        <p className="font-semibold text-gray-900 mb-1">{n} {title}</p>
      ) : (
        <p className="font-medium text-gray-800 mb-1">{n}</p>
      )}
      <div className="pl-4 space-y-2 text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function DataTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
      {rows.map(([label, value]) => (
        <div key={label} className="flex border-b border-gray-100 last:border-0">
          <div className="w-40 shrink-0 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {label}
          </div>
          <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed">{value}</div>
        </div>
      ))}
    </div>
  );
}

function LetterList({ items }: { items: string[] }) {
  return (
    <ul className="list-none space-y-1 pl-2">
      {items.map((item, i) => (
        <li key={i} className="text-gray-700 leading-relaxed">{item}</li>
      ))}
    </ul>
  );
}

export default function AdatkezelesiTajekoztato() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold text-sni-text">Adatkezelési Tájékoztató</h1>
      <p className="mb-1 text-sm text-gray-500">Hatályos: 2026. augusztus 5. napjától</p>
      <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <strong>Adatkezelő:</strong> [Üzemeltető teljes neve / cégneve, székhelye, cégjegyzékszáma vagy
        nyilvántartási száma, adószáma, elérhetősége – kitöltendő]
        <span className="ml-1 text-gray-400">(a továbbiakban: „Adatkezelő")</span>
      </div>

      <P>Jelen tájékoztató a Weboldal (a továbbiakban: „Weboldal") működésével összefüggő adatkezelésekről nyújt tájékoztatást, az Európai Parlament és a Tanács (EU) 2016/679 rendelete (a továbbiakban: „GDPR"), valamint az információs önrendelkezési jogról és az információszabadságról szóló 2011. évi CXII. törvény (a továbbiakban: „Infotv.") rendelkezéseivel összhangban. A jelen tájékoztató a Weboldal <Link href="/aszf" className="text-sni-brand-blue hover:underline">Általános Szerződési Feltételeivel (ÁSZF)</Link> együtt értelmezendő; a fogalommeghatározások tekintetében az ÁSZF-ben foglaltak az irányadók.</P>

      <div className="my-8" />

      <Section id="alapelvek" title="1. Az adatkezelés alapelvei">
        <Sub n="1.1.">
          <P>Az Adatkezelő a személyes adatokat jogszerűen, tisztességesen és az érintett számára átlátható módon, célhoz kötötten, a szükséges mértékre korlátozva, pontosan, korlátozott ideig tárolva, valamint megfelelő biztonsági intézkedésekkel kezeli, a GDPR 5. cikkében rögzített elvekkel összhangban.</P>
        </Sub>
        <Sub n="1.2.">
          <P>Az Adatkezelő kifejezetten rögzíti, hogy egyetlen adatkezelési célhoz kapcsolódó személyes adatot sem használ fel más, azzal összeegyeztethetetlen célra anélkül, hogy erről az érintettet tájékoztatná, illetve – ahol jogszabály ezt előírja – hozzájárulását kérné.</P>
        </Sub>
      </Section>

      <Section id="adatkezelesek" title="2. Az egyes adatkezelések">
        <Sub n="2.1." title="Regisztráció">
          <DataTable rows={[
            ["Kezelt adatok", "e-mail cím, jelszó (titkosítva), felhasználónév, regisztráció időpontja, IP-cím"],
            ["Cél", "fiók létrehozása, azonosítás, a Weboldal biztonságos működésének biztosítása"],
            ["Jogalap", "szerződés teljesítése (GDPR 6. cikk (1) b) pont) – a Weboldal használatára vonatkozó ÁSZF elfogadása"],
            ["Megőrzési idő", "a fiók fennállásának ideje, törlési kérelemig, illetve jogszabályi megőrzési kötelezettség esetén az arra irányadó ideig"],
          ]} />
        </Sub>

        <Sub n="2.2." title="Hely-javaslat">
          <DataTable rows={[
            ["Kezelt adatok", "a javasolt Hely adatai, a javaslattevő felhasználói fiókjához kapcsolt azonosító, időpont"],
            ["Cél", "a Hely-adatbázis bővítése, az Automatikus technikai ellenőrzés lefolytatása"],
            ["Jogalap", "szerződés teljesítése (GDPR 6. cikk (1) b) pont)"],
            ["Megőrzési idő", "a Hely adatbázisban való szereplésének ideje, illetve a fiók törléséig"],
          ]} />
        </Sub>

        <Sub n="2.3." title="Értékelés közzététele">
          <DataTable rows={[
            ["Kezelt adatok", "az Értékelés szövege, minősítése (pl. csillagszám), a közzétevő felhasználói fiókjához kapcsolt azonosító, időpont, technikai adatok (IP-cím, eszközazonosító – kizárólag az Automatikus technikai ellenőrzés céljára)"],
            ["Cél", "az Értékelés közzététele, Automatikus technikai ellenőrzés, visszaélések (pl. manipulált, duplikált Értékelés) kiszűrése"],
            ["Jogalap", "szerződés teljesítése (GDPR 6. cikk (1) b) pont); a visszaélés-szűrés tekintetében az Adatkezelő jogos érdeke (GDPR 6. cikk (1) f) pont)"],
            ["Megőrzési idő", "az Értékelés közzétételének ideje, illetve jogsértés-bejelentés esetén a bejelentés elbírálásához szükséges ideig"],
          ]} />
        </Sub>

        <Sub n="2.4." title="Nyilvános Válasz (az Érintett Hely részéről)">
          <DataTable rows={[
            ["Kezelt adatok", "az Érintett Hely képviselőjének igazoláshoz megadott adatai (pl. céges e-mail cím, kapcsolattartó neve), a Nyilvános Válasz szövege, időpont"],
            ["Cél", "az Érintett Hely jogosultságának igazolása, a Nyilvános Válasz közzététele az ÁSZF 7. pontja szerint"],
            ["Jogalap", "szerződés teljesítése, illetve az Adatkezelő jogos érdeke a jogosultság-igazolás lefolytatásához (GDPR 6. cikk (1) b) és f) pont)"],
            ["Megőrzési idő", "a Nyilvános Válasz közzétételének ideje"],
          ]} />
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Fontos, kiemelt tájékoztatás:</strong> Az Adatkezelő a jelen 2.4. pont szerinti Nyilvános Válasz funkció keretében az Értékelést közzétevő Felhasználó valós nevét, e-mail címét, telefonszámát vagy egyéb, a személyazonosságára közvetlenül utaló adatát az Érintett Hely részére nem továbbítja, és azt az Érintett Hely számára a Weboldal felületén sem teszi megismerhetővé. A Nyilvános Válasz kizárólag az Értékeléshez, nem a Felhasználó személyéhez kapcsolódóan, nyilvánosan jelenik meg.
          </div>
        </Sub>

        <Sub n="2.5." title="Anonimizált üzenetküldő funkció (amennyiben elérhető)">
          <DataTable rows={[
            ["Kezelt adatok", "az üzenet szövege, a felek felhasználói fiókjához kapcsolt azonosító, időpont; a felek valós elérhetősége (e-mail, telefonszám) nem kerül felfedésre, kivéve, ha a Felhasználó ezt a jelen tájékoztató 3. pontja szerint kifejezetten engedélyezi"],
            ["Cél", "az Érintett Hely és a Felhasználó közötti, a valós elérhetőség felfedése nélküli kapcsolatfelvétel lehetővé tétele"],
            ["Jogalap", "az érintett hozzájárulása (GDPR 6. cikk (1) a) pont) – az üzenetküldő funkció igénybevétele önkéntes"],
            ["Megőrzési idő", "az üzenetváltás lezárását követő, az Adatkezelő által meghatározott idő, illetve törlési kérelemig"],
          ]} />
        </Sub>

        <Sub n="2.6." title="Jogsértés-bejelentés (Notice-and-Action)">
          <DataTable rows={[
            ["Kezelt adatok", "a bejelentő elérhetősége, a bejelentés tartalma, az érintett Tartalom megjelölése, időpont"],
            ["Cél", "a bejelentés kivizsgálása, a jogszabályi (Ekertv., DSA) bejelentés-alapú eljárás lefolytatása"],
            ["Jogalap", "jogi kötelezettség teljesítése (GDPR 6. cikk (1) c) pont), illetve az Adatkezelő jogos érdeke"],
            ["Megőrzési idő", "a bejelentés elbírálásától számított, jogi igényérvényesítési határidőn belüli, indokolt ideig"],
          ]} />
        </Sub>
      </Section>

      <Section id="adatadas" title="3. A Felhasználó személyes adatainak Érintett Hely részére történő átadása – kifejezett, elkülönített hozzájárulás">
        <Sub n="3.1.">
          <P>Az Adatkezelő elsődleges és alapértelmező eljárása szerint a Felhasználó személyes adatait nem továbbítja az Érintett Hely részére. Amennyiben a Weboldal ezen felül olyan funkciót is biztosít, amelynek keretében a Felhasználó – kifejezetten és önként – hozzájárulhat ahhoz, hogy elérhetőségét egy adott Értékeléssel kapcsolatban az Érintett Hely megismerhesse, ez a hozzájárulás:</P>
          <LetterList items={[
            "a) kizárólag az adott, konkrét Értékeléshez kapcsolódóan, eseti jelleggel kérhető (nem az általános ÁSZF-elfogadás vagy regisztráció részeként);",
            "b) egyértelmű, aktív cselekvést (pl. jelölőnégyzet bejelölése, gombra kattintás) igényel, hallgatás vagy előre bejelölt opció nem minősül hozzájárulásnak;",
            "c) bármikor, korlátozás nélkül visszavonható, a visszavonás azonban nem érinti a visszavonás előtt már megtörtént adatátadás jogszerűségét;",
            "d) elutasítása esetén a Felhasználó a Weboldal egyéb funkcióit (pl. Értékelés közzététele) korlátozás nélkül továbbra is használhatja – a hozzájárulás megadása semmilyen szolgáltatás feltételéül nem szabható.",
          ]} />
        </Sub>
        <Sub n="3.2.">
          <P>Az Adatkezelő a 3.1. pont szerinti hozzájárulás megadása előtt köteles a Felhasználót tájékoztatni arról, hogy adatai mely körben, milyen célból és mely Érintett Hely számára kerülnek átadásra.</P>
        </Sub>
      </Section>

      <Section id="automatizalt" title="4. Automatizált döntéshozatal">
        <Sub n="4.1.">
          <P>A Weboldal az Értékelések és Hely-javaslatok közzétételéről az ÁSZF 3. pontja szerinti Automatikus technikai ellenőrzés keretében, kizárólag automatizált módon dönt, amely a GDPR 22. cikke szerinti, kizárólag automatizált döntéshozatalnak minősülhet, amennyiben az a Felhasználóra vonatkozó joghatással jár (pl. a Tartalom elutasítása).</P>
        </Sub>
        <Sub n="4.2.">
          <P>A Felhasználót az ilyen automatizált döntéssel kapcsolatban megilleti:</P>
          <LetterList items={[
            "a) a döntés emberi beavatkozás útján történő felülvizsgálatának kérelmezéséhez való jog;",
            "b) a saját álláspontja kifejtésének joga;",
            "c) a döntés megtámadásának joga.",
          ]} />
          <P>E jogokat az Üzemeltető az ÁSZF 5.2. pontja szerinti panaszeljárás útján biztosítja.</P>
        </Sub>
      </Section>

      <Section id="adattovabbitas" title="5. Adattovábbítás, adatfeldolgozók">
        <Sub n="5.1.">
          <P>Az Adatkezelő a Weboldal működtetéséhez adatfeldolgozókat (pl. tárhelyszolgáltató, adatbázis-szolgáltató – Supabase Inc., e-mail küldő szolgáltató) vehet igénybe. Az adatfeldolgozók listája és az esetleges harmadik országba (EGT-n kívüli) irányuló adattovábbítás részletei a Weboldalon elérhető, mindenkor aktuális adatfeldolgozói jegyzékben találhatók.</P>
        </Sub>
        <Sub n="5.2.">
          <P>Az Adatkezelő a Felhasználó személyes adatait – a jelen tájékoztató 3. pontjában rögzített, kifejezett hozzájáruláson alapuló eseten kívül – harmadik személy (így különösen az Érintett Hely) részére nem továbbítja.</P>
        </Sub>
      </Section>

      <Section id="jogok" title="6. Az érintett jogai">
        <Sub n="6.1.">
          <P>A Felhasználót és az Érintett Helyet a GDPR alapján megilleti:</P>
          <LetterList items={[
            "a hozzáféréshez való jog (15. cikk);",
            "a helyesbítéshez való jog (16. cikk);",
            "a törléshez való jog (17. cikk);",
            "az adatkezelés korlátozásához való jog (18. cikk);",
            "az adathordozhatósághoz való jog (20. cikk);",
            "a tiltakozáshoz való jog (21. cikk);",
            "a hozzájárulás visszavonásához való jog, amennyiben az adatkezelés hozzájáruláson alapul (7. cikk (3) bekezdés).",
          ]} />
        </Sub>
        <Sub n="6.2.">
          <P>A jogok gyakorlására vonatkozó kérelmet az Adatkezelő [kapcsolattartási e-mail cím – kitöltendő] címen fogadja, és azt a GDPR-ban meghatározott határidőn (alapesetben egy hónapon) belül teljesíti.</P>
        </Sub>
        <Sub n="6.3.">
          <P>Az érintett jogosult a Nemzeti Adatvédelmi és Információszabadság Hatósághoz (NAIH, 1055 Budapest, Falk Miksa utca 9–11., www.naih.hu) panasszal fordulni, illetve jogainak megsértése esetén bírósághoz fordulni.</P>
        </Sub>
      </Section>

      <Section id="adatbiztonsag" title="7. Adatbiztonság">
        <Sub n="7.1.">
          <P>Az Adatkezelő megfelelő technikai és szervezési intézkedésekkel gondoskodik a személyes adatok jogosulatlan hozzáféréstől, megváltoztatástól, továbbítástól, nyilvánosságra hozataltól, törléstől vagy megsemmisítéstől való védelméről.</P>
        </Sub>
      </Section>

      <Section id="modositas" title="8. A tájékoztató módosítása">
        <Sub n="8.1.">
          <P>Az Adatkezelő fenntartja a jogot a jelen Adatkezelési Tájékoztató módosítására. A módosított tájékoztató a Weboldalon történő közzétételt követően lép hatályba.</P>
        </Sub>
      </Section>

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-xs text-gray-500 italic">
        <strong className="not-italic font-semibold text-gray-700">Jogi megjegyzés:</strong> A jelen dokumentum mintaszövegként készült, és az ÁSZF 7. és 12. pontjában rögzített Nyilvános Válasz funkcióhoz, valamint az esetleges anonimizált üzenetküldő funkcióhoz igazodóan tartalmazza a szükséges adatvédelmi rendelkezéseket. A dokumentum véglegesítése előtt – az adatfeldolgozói kör tényleges összeállítása, valamint a mindenkori jogszabályi változások figyelembevétele érdekében – elengedhetetlen ügyvéd/adatvédelmi szakjogász általi felülvizsgálat.
      </div>
    </div>
  );
}
