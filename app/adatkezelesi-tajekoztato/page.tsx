/* eslint-disable react/no-unescaped-entities */
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

      {/* ─── VédettMunka AT kiegészítés ─── */}
      <div className="mt-12 mb-6 border-t-2 border-sni-brand-teal pt-8">
        <h2 className="text-2xl font-bold text-sni-text">VédettMunka – Adatkezelési Tájékoztató kiegészítése</h2>
        <p className="text-sm text-gray-500 mt-1">Hatályos: 2026. augusztus 30. napjától</p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A jelen kiegészítés a VédettSarok meglévő Adatkezelési Tájékoztatójának a VédettMunka szolgáltatásra vonatkozó kiegészítése. A meglévő Tájékoztató általános rendelkezései a VédettMunka adatkezelésre is alkalmazandók, kivéve, ha a jelen kiegészítés eltérően rendelkezik.
        </div>
      </div>

      <Section id="vm-at-1" title="VM 1. A VédettMunka szolgáltatásról">
        <Sub n="VM 1.1.">
          <P>A VédettMunka a VédettSarok weboldalán vagy webapplikációjában elérhető, specializált álláshirdetési, álláskeresési, önéletrajz-készítő, állásértesítő és jelentkezéstovábbító felület.</P>
        </Sub>
        <Sub n="VM 1.2.">
          <P>A VédettMunka célja, hogy könnyebben átlátható, közérthető és a munkakörülmények bemutatására külön figyelmet fordító álláskeresési lehetőséget biztosítson. A felületet különösen azok az álláskeresők is használhatják, akik számára fontos a kiszámítható, rugalmas, támogató vagy befogadó munkakörnyezet. A VédettMunka szolgáltatásai ugyanakkor nem kizárólag e személyi kör számára érhetők el.</P>
        </Sub>
        <Sub n="VM 1.3.">
          <P>A VédettMunka álláshirdetési és jelentkezéstovábbító felület. Nem garantál elhelyezkedést, interjúra hívást, munkáltatói válaszadást, kiválasztást vagy munkaviszony létrejöttét. A VédettSarok a jelenlegi szolgáltatási modellben nem végez automatizált jelölt-rangsorolást, alkalmassági pontozást, előszűrést, mesterséges intelligencián alapuló jelöltajánlást vagy egészségügyi adaton alapuló profilozást.</P>
        </Sub>
      </Section>

      <Section id="vm-at-2" title="VM 2. Adatkezelő és elérhetőségei">
        <Sub n="VM 2.1.">
          <P>A VédettMunka szolgáltatás kapcsán kezelt személyes adatok adatkezelője a jelen Tájékoztató elején megjelölt Adatkezelő. A kapcsolattartási és panaszbejelentési e-mail-cím: kapcsolat@vedettsarok.hu (vagy az Adatkezelő által meghatározott aktuális elérhetőség). Az adatvédelmi tisztviselő elérhetősége az Adatkezelő weboldalán érhető el, amennyiben kijelölésre került.</P>
        </Sub>
      </Section>

      <Section id="vm-at-3" title="VM 3. Fogalmak">
        <Sub n="VM 3.1.">
          <LetterList items={[
            "Álláskereső: a VédettMunka álláskeresői funkcióit használó természetes személy.",
            "Munkáltató vagy Hirdető: a VédettMunka felületén álláshirdetést közzétevő vagy közzétenni kívánó, a VédettSarok által jóváhagyott partner.",
            "Jelentkezés: az Álláskereső által egy konkrét álláshirdetéshez kapcsolódóan megadott személyes adat, opcionális üzenet, csatolt önéletrajz és egyéb dokumentum.",
            "Különleges adat: különösen az egészségi állapotra, fogyatékosságra, megváltozott munkaképességre, diagnózisra vagy neurodivergenciára utaló, a GDPR 9. cikke szerinti személyes adat.",
            "Felület: a VédettSarok weboldala, webapplikációja és a VédettMunka technikai funkciói.",
          ]} />
        </Sub>
      </Section>

      <Section id="vm-at-4" title="VM 4. Alapelvek és különleges adatok">
        <Sub n="VM 4.1.">
          <P>A VédettSarok a VédettMunka szolgáltatásban az adatminimalizálás, célhoz kötöttség, korlátozott tárolhatóság, átláthatóság, bizalmasság, integritás, elszámoltathatóság, valamint a beépített és alapértelmezett adatvédelem elvei szerint jár el.</P>
        </Sub>
        <Sub n="VM 4.2.">
          <P>A VédettMunka nem kér, és a szolgáltatás használatának nem teszi feltételévé diagnózis, egészségügyi dokumentum, egészségügyi lelet, fogyatékossági igazolás, komplex minősítés, megváltozott munkaképességet igazoló dokumentum vagy más egészségi állapotra vonatkozó irat megadását vagy feltöltését.</P>
        </Sub>
        <Sub n="VM 4.3.">
          <P>Az Álláskereső ugyanakkor saját döntése alapján az önéletrajzában, üzenetében vagy más jelentkezési anyagában közölhet ilyen adatot. A VédettSarok ezt nem ösztönzi, és a Felületen jól látható figyelmeztetést helyez el arra vonatkozóan, hogy az Álláskereső ne töltsön fel egészségügyi dokumentumot vagy diagnózist, kivéve, ha annak konkrét Munkáltatóval való megosztásáról tudatosan döntött.</P>
        </Sub>
        <Sub n="VM 4.4.">
          <P>Ha az Álláskereső különleges adatot tartalmazó dokumentumot egy konkrét jelentkezéshez mégis csatol, a VédettSarok azt kizárólag a Felhasználó által kezdeményezett adattovábbítás technikai teljesítéséhez szükséges ideig kezeli. A VédettSarok azt nem tárolja tartósan, nem elemzi, nem értékeli, nem profilozza, nem teszi kereshetővé és nem használja más álláshirdetéshez vagy marketingcélra.</P>
        </Sub>
      </Section>

      <Section id="vm-at-5" title="VM 5. Önéletrajz-készítő: kliensoldali működés">
        <Sub n="VM 5.1." title="A szolgáltatás működése">
          <P>A VédettMunka önéletrajz-készítője a Felhasználó saját böngészőjében működik. Az önéletrajz piszkozatához megadott adatok – ideértve az opcionálisan feltöltött fényképet is – kizárólag a Felhasználó saját eszközének és böngészőjének helyi tárhelyén, a böngésző localStorage-ában tárolódnak.</P>
          <P>A VédettSarok az önéletrajz-készítőben megadott adatokat, az opcionális fényképet és a létrehozott PDF-et nem továbbítja a VédettSarok szerverére, adatbázisába, Supabase-tárhelyére vagy más, a VédettSarok által kezelt tartós tárhelyre.</P>
          <P>A PDF-önéletrajz a Felhasználó böngészőjében generálódik, majd közvetlenül a Felhasználó saját eszközére tölthető le. A VédettSarok a létrehozott PDF példányát nem kapja meg és nem tárolja.</P>
        </Sub>
        <Sub n="VM 5.2." title="A kezelt vagy a Felhasználó eszközén tárolt adatok">
          <P>Az önéletrajz-készítőben a Felhasználó saját döntése szerint különösen az alábbi adatokat adhatja meg: név, elérhetőségek, lakóhely vagy település, születési év, iskolai végzettség, munkatapasztalat, szakma, nyelvismeret, számítógépes ismeretek, jogosítvány, munkába állás várható ideje, egyéb szakmai információ és opcionális fénykép. Ezen adatok helyi böngészőtárolására a VédettSarok nem kap hozzáférést.</P>
        </Sub>
        <Sub n="VM 5.3." title="Törlés és felhasználói felelősség">
          <P>A Felhasználó az önéletrajz-piszkozatot a Felületen biztosított funkcióval, illetve a böngésző helyi adatainak törlésével bármikor eltávolíthatja. A helyi piszkozat nem szinkronizálódik automatikusan más böngészővel vagy eszközzel. A Felhasználó felel az eszközének és böngészőjének megfelelő védelméért.</P>
        </Sub>
      </Section>

      <Section id="vm-at-6" title="VM 6. Konkrét állásra jelentkezés">
        <Sub n="VM 6.1." title="Az adatkezelés célja">
          <P>A VédettSarok a konkrét álláshirdetésre történő jelentkezéskor a jelentkezési adatokat kizárólag azért kezeli, hogy az Álláskereső által kiválasztott Munkáltatóhoz a jelentkezést technikailag eljuttassa. A VédettSarok a jelentkezési adatokat nem használja önéletrajz-adatbázis építésére, más Munkáltatónak való ajánlásra, általános jelöltkeresésre, egészségügyi adat alapú profilozásra vagy automatizált kiválasztásra.</P>
        </Sub>
        <Sub n="VM 6.2." title="Kezelt adatok">
          <P>A jelentkezés során a VédettSarok különösen az alábbi adatokat kezelheti:</P>
          <LetterList items={[
            "az Álláskereső neve;",
            "az Álláskereső e-mail-címe;",
            "az Álláskereső által opcionálisan megadott üzenet;",
            "az Álláskereső által opcionálisan csatolt önéletrajz vagy más jelentkezési dokumentum;",
            "az álláshirdetés és a Munkáltató technikai azonosítója;",
            "a csatolt fájl neve és technikai jellemzői;",
            "a jelentkezés, adattovábbítási nyilatkozat és e-mailes továbbítás időpontja;",
            "a kézbesítés technikai állapota.",
          ]} />
          <P>A jelentkezési űrlaphoz jelenleg nem szükséges telefonszám, lakcím, diagnózis, egészségügyi dokumentum, fogyatékossági igazolás vagy megváltozott munkaképességet igazoló dokumentum megadása.</P>
        </Sub>
        <Sub n="VM 6.3." title="Jogalap">
          <P>A VédettSarok a jelentkezési adatokat elsődlegesen a GDPR 6. cikk (1) bekezdés b) pontja alapján, az Álláskereső által kezdeményezett jelentkezéstovábbítási szolgáltatás teljesítése érdekében kezeli. Ha a Felhasználó a csatolt dokumentumban saját döntése alapján különleges adatot közöl, a VédettSarok annak technikai, egyszeri továbbításához a GDPR 9. cikk (2) bekezdés a) pontja szerinti kifejezett hozzájárulásra támaszkodik.</P>
        </Sub>
        <Sub n="VM 6.4." title="Adattovábbítás, tárolás és címzett">
          <P>A jelentkezési adatok, az opcionális üzenet és az opcionális csatolmány kizárólag az adott álláshirdetésben szereplő, a VédettSarok által jóváhagyott Munkáltató által megadott fogadó e-mail-címre kerülnek továbbításra, a Resend, Inc. tranzakciós e-mail-szolgáltatásának közreműködésével. A csatolt fájl kizárólag a továbbításhoz szükséges átmeneti, tranzakciós ideig lehet jelen memóriában. A csatolmány nem kerül a VédettSarok tartós adatbázisába.</P>
        </Sub>
        <Sub n="VM 6.5." title="Munkáltató mint önálló adatkezelő">
          <P>A Munkáltató a jelentkezési e-mail és a hozzá csatolt dokumentum kézhezvételétől kezdődően a jelentkezési anyagok tekintetében önálló adatkezelőként jár el. A Munkáltató felel különösen a saját kiválasztási eljárásáért, a megfelelő tájékoztatásért, az alkalmazott adatkezelési jogalap meghatározásáért, az adatmegőrzési időért, a különleges adatok kezelésének jogszerűségéért és az érintetti kérelmek megválaszolásáért. A VédettSarok és a Munkáltató a Munkáltató saját kiválasztási folyamatában nem közös adatkezelők.</P>
        </Sub>
        <Sub n="VM 6.6." title="Jelentkezési napló">
          <P>A VédettSarok a jelentkezések technikai teljesülésének igazolása, hibakezelés és jogi igények érvényesítése érdekében a job_applications_log naplóban korlátozott metaadatokat kezel. A napló nem tartalmazza a CV tartalmát és az opcionális üzenet szövegét. Jogalapja a GDPR 6. cikk (1) bekezdés f) pontja (jogos érdek). Megőrzési ideje a jelentkezéstől számított 1 év, kivéve, ha panasz, jogvita vagy hatósági eljárás indokolja a további megőrzést.</P>
        </Sub>
      </Section>

      <Section id="vm-at-7" title="VM 7. Hozzájárulási és adatátadási napló">
        <Sub n="VM 7.1.">
          <P>A VédettSarok a jelentkezéstovábbításra vonatkozó nyilatkozat, az állásértesítő-feliratkozás és más hozzájárulások bizonyíthatósága érdekében hozzájárulási naplót vezet (vm_consent_log). A napló az Álláskereső technikai azonosítóját, az állás és Munkáltató technikai azonosítóját, a nyilatkozat típusát, verzióazonosítóját, a Munkáltató adatkezelési tájékoztatójának URL-jét, a nyilatkozat időpontját és a minimálisan szükséges technikai bizonyító adatot tartalmazza.</P>
        </Sub>
        <Sub n="VM 7.2.">
          <P>A hozzájárulási napló célja a GDPR 7. cikke szerinti elszámoltathatóság és a nyilatkozatok bizonyítása. Jogalapja a GDPR 6. cikk (1) bekezdés c) pontja (jogi kötelezettség teljesítése), illetve ahol alkalmazható, a GDPR 6. cikk (1) bekezdés f) pontja (jogos érdek). Megőrzési ideje 5 év, kivéve, ha jogvita vagy hatósági eljárás ennél hosszabb megőrzést indokol.</P>
        </Sub>
      </Section>

      <Section id="vm-at-8" title="VM 8. Állásértesítő">
        <Sub n="VM 8.1.">
          <P>Az Álláskereső külön, önkéntes hozzájárulással feliratkozhat heti állásértesítőre. A VédettSarok az állásértesítő céljára az Álláskereső felhasználói azonosítóját, e-mail-címét, helyszín-, kategória- és kulcsszó-szűrőjét, az értesítő aktív vagy inaktív állapotát, létrehozásának és módosításának időpontját, valamint a kézbesítéshez szükséges technikai adatokat kezeli.</P>
        </Sub>
        <Sub n="VM 8.2.">
          <P>Az állásértesítő adatkezelésének jogalapja a GDPR 6. cikk (1) bekezdés a) pontja szerinti hozzájárulás. A hozzájárulás nem lehet előre bejelölt, és megtagadása nem érintheti hátrányosan a VédettMunka más funkcióinak használatát.</P>
        </Sub>
        <Sub n="VM 8.3.">
          <P>Az Álláskereső bármikor, indokolás nélkül és ingyenesen leiratkozhat az értesítő e-mailben elhelyezett egykattintásos leiratkozási hivatkozással vagy a fiókbeállításaiban. A leiratkozás azonnal hatályos.</P>
        </Sub>
        <Sub n="VM 8.4.">
          <P>A VédettSarok az állásértesítő tartalmát nem állítja össze egészségügyi adat, diagnózis, fogyatékosság, megváltozott munkaképesség, feltételezett neurodivergencia vagy böngészési viselkedés alapján.</P>
        </Sub>
      </Section>

      <Section id="vm-at-9" title="VM 9. Marketingkommunikáció">
        <Sub n="VM 9.1.">
          <P>A VédettSarok az állásértesítőtől elkülönülő marketing-, promóciós, esemény- vagy szolgáltatási hírlevelet kizárólag külön, előzetes, önkéntes, konkrét és egyértelmű hozzájárulás alapján küld. A marketingcélú hozzájárulás megtagadása vagy visszavonása nem befolyásolja a fiók, az önéletrajz-készítő, az álláskeresés vagy a konkrét állásra jelentkezés használatát.</P>
        </Sub>
      </Section>

      <Section id="vm-at-10" title="VM 10. Munkáltatói regisztráció és hirdetésfeladás">
        <Sub n="VM 10.1." title="Kezelt adatok">
          <P>A Munkáltatói regisztráció, jóváhagyás és hirdetésfeladás során a VédettSarok különösen az alábbi adatokat kezelheti:</P>
          <LetterList items={[
            "cég neve;",
            "kapcsolattartó neve;",
            "kapcsolattartó e-mail-címe;",
            "a Munkáltató adatkezelési tájékoztatójának URL-je;",
            "a regisztrációs és jóváhagyási státusz, jóváhagyás vagy elutasítás időpontja;",
            "álláshirdetési adatok (munkakör, munkaköri leírás, munkavégzés helye, munkaidő típusa, fizetési sáv, hirdetési érvényesség, jelentkezési fogadó e-mail-cím, hirdetési státusz);",
            "az adminisztratív ellenőrzéshez szükséges minimális megjegyzések és naplóadatok.",
          ]} />
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Megjegyzés:</strong> A VédettSarok a jelenleg ismert működés szerint nem biztosít online fizetési funkciót. Ha a jövőben fizetős hirdetésfeladás indul, az adatkezelési tájékoztatót külön kell kiegészíteni.
          </div>
        </Sub>
        <Sub n="VM 10.2." title="Cél, jogalap és megőrzés">
          <P>A Munkáltatóval szerződő természetes személy vagy egyéni vállalkozó adatai esetén a jogalap a GDPR 6. cikk (1) bekezdés b) pontja. Jogi személy Munkáltató kapcsolattartójának adatai esetén a jogalap a GDPR 6. cikk (1) bekezdés f) pontja (jogos érdek). A Munkáltatói fiókhoz kapcsolódó adatok a kapcsolat fennállásáig, majd az utolsó érdemi kapcsolattartástól vagy fiókmegszűnéstől számított 3 évig őrizhetők meg.</P>
        </Sub>
      </Section>

      <Section id="vm-at-11" title="VM 11. Hirdetésjelentés és moderáció">
        <Sub n="VM 11.1.">
          <P>A VédettSarok lehetőséget biztosít a feltételezetten jogellenes, megtévesztő, diszkriminatív vagy az ÁSZF-be ütköző álláshirdetés bejelentésére. A bejelentéshez a VédettSarok a bejelentő felhasználói azonosítóját, a bejelentett hirdetés azonosítóját, a bejelentés okát, opcionális indokolását, valamint az adminisztratív vizsgálat és intézkedés adatait kezelheti.</P>
        </Sub>
        <Sub n="VM 11.2.">
          <P>Az adatkezelés célja a szolgáltatás biztonságának, jogszerűségének és integritásának védelme. Jogalapja a GDPR 6. cikk (1) bekezdés f) pontja (jogos érdek). A hirdetésjelentés adatait a VédettSarok a vizsgálat lezárásától számított 1 évig, az adminisztratív intézkedési naplókat (vm_admin_audit_log) 5 évig őrizheti meg. A bejelentő személye a bejelentett Munkáltatóval nem osztható meg, kivéve, ha ezt jogszabály, bíróság vagy hatóság kötelezően előírja.</P>
        </Sub>
      </Section>

      <Section id="vm-at-12" title="VM 12. Naplózás és adatbiztonság">
        <Sub n="VM 12.1.">
          <P>A VédettSarok a szolgáltatás biztonsága, hibakeresés, visszaélés-megelőzés és jogi igények kezelése érdekében korlátozott technikai naplóadatokat kezelhet (belépési, műveleti és biztonsági események időpontjai, technikai azonosítók, hibakódok). Jogalapja a GDPR 6. cikk (1) bekezdés f) pontja (jogos érdek). Megőrzési idő főszabályként 180 nap; biztonsági incidens, jogvita, panasz vagy hatósági eljárás esetén az ügy lezárásáig.</P>
        </Sub>
        <Sub n="VM 12.2.">
          <P>A VédettSarok az adatkezelés kockázatához igazodó technikai és szervezési intézkedéseket alkalmaz, különösen titkosított adatátvitelt, szerepkör alapú jogosultságkezelést, rendszeres hozzáférési felülvizsgálatot, hozzáférési naplózást, Munkáltatói és admin jogosultságok elkülönítését, valamint adatvédelmi incidenskezelési eljárást.</P>
        </Sub>
      </Section>

      <Section id="vm-at-13" title="VM 13. Adatfeldolgozók és nemzetközi adattovábbítás">
        <Sub n="VM 13.1.">
          <P>A VédettSarok a VédettMunka üzemeltetésében a jelenlegi technikai modellben az alábbi adatfeldolgozókat veszi igénybe:</P>
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
            <div className="grid grid-cols-3 bg-sni-brand-navy">
              <div className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wide">Szolgáltató</div>
              <div className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wide">Szerep</div>
              <div className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wide">Kezelt adatok fő köre</div>
            </div>
            <div className="grid grid-cols-3 border-b border-gray-100">
              <div className="px-3 py-3 text-sm text-gray-700 font-medium">Resend, Inc.</div>
              <div className="px-3 py-3 text-sm text-gray-700">Tranzakciós e-mail-szolgáltatás</div>
              <div className="px-3 py-3 text-sm text-gray-700">Jelentkezési e-mail és szükség esetén csatolmány továbbítása a Munkáltató részére; állásértesítő e-mailek kiküldése</div>
            </div>
            <div className="grid grid-cols-3 border-b border-gray-100">
              <div className="px-3 py-3 text-sm text-gray-700 font-medium">Supabase, Inc.</div>
              <div className="px-3 py-3 text-sm text-gray-700">Adatbázis és autentikáció</div>
              <div className="px-3 py-3 text-sm text-gray-700">Munkáltatói adatok, álláshirdetési adatok, állásértesítő-beállítások, hozzájárulási naplók, jelentkezési metaadatok, admin-auditnaplók</div>
            </div>
            <div className="grid grid-cols-3">
              <div className="px-3 py-3 text-sm text-gray-700 font-medium">Vercel, Inc.</div>
              <div className="px-3 py-3 text-sm text-gray-700">Hosting, alkalmazásfuttatás és cron feladatok</div>
              <div className="px-3 py-3 text-sm text-gray-700">A szolgáltatás működéséhez szükséges korlátozott technikai és alkalmazásadatok</div>
            </div>
          </div>
        </Sub>
        <Sub n="VM 13.2.">
          <P>A VédettSarok minden adatfeldolgozóval a GDPR 28. cikkének megfelelő szerződéses feltételeket alkalmaz. Ha a személyes adatok Európai Gazdasági Térségen kívüli továbbítására kerül sor, a VédettSarok kizárólag a GDPR V. fejezete szerinti megfelelő garanciák fennállása esetén jár el. A tényleges régióbeállítások, adatfeldolgozói szerződések és harmadik országbeli adattovábbítási alapok élesítés előtt ellenőrizendők.</P>
        </Sub>
      </Section>

      <Section id="vm-at-14" title="VM 14. Automatizált döntéshozatal és profilozás">
        <Sub n="VM 14.1.">
          <P>A VédettSarok a VédettMunka jelenlegi működésében nem hoz kizárólag automatizált adatkezelésen alapuló, az Álláskeresőre nézve joghatással járó vagy őt hasonlóképpen jelentősen érintő döntést. A VédettSarok különösen nem alkalmaz diagnózison, fogyatékosságon, megváltozott munkaképességen vagy feltételezett neurodivergencián alapuló automatikus rangsorolást, alkalmassági pontozást vagy előszűrést.</P>
        </Sub>
        <Sub n="VM 14.2.">
          <P>Ha a VédettSarok a jövőben ilyen funkciót vagy más, magas kockázatú automatizált adatkezelést kíván bevezetni, azt csak előzetes jogi, adatvédelmi és – ahol szükséges – adatvédelmi hatásvizsgálati felülvizsgálat, megfelelő emberi felülvizsgálat és részletes érintetti tájékoztatás után vezetheti be.</P>
        </Sub>
      </Section>

      <Section id="vm-at-15" title="VM 15. Érintetti jogok">
        <Sub n="VM 15.1.">
          <P>Az érintett jogosult arra, hogy a VédettSaroknál hozzáférést kérjen személyes adataihoz, kérje azok helyesbítését, törlését, kezelésük korlátozását, kérje adatai hordozhatóságát, valamint jogos érdeken alapuló adatkezelés esetén tiltakozzon az adatkezelés ellen. Hozzájáruláson alapuló adatkezelés esetén az érintett a hozzájárulását bármikor visszavonhatja.</P>
        </Sub>
        <Sub n="VM 15.2.">
          <P>Az önéletrajz-készítő kizárólag a Felhasználó saját böngészőjének localStorage-ában tárolt piszkozatát a Felhasználó maga törölheti a Felület erre szolgáló funkciójával vagy a böngészőadatok törlésével. Mivel ezekhez az adatokhoz a VédettSarok nem fér hozzá, a VédettSarok azok törlését technikailag nem tudja elvégezni.</P>
        </Sub>
        <Sub n="VM 15.3.">
          <P>A Munkáltatóhoz már továbbított jelentkezési anyag törlése vagy a Munkáltató általi további kezelése kapcsán az érintettnek elsődlegesen közvetlenül a Munkáltatóhoz kell fordulnia. A kérelmet az Adatkezelő ügyfélszolgálati e-mail-címén is be lehet nyújtani. A VédettSarok a kérelemre főszabályként egy hónapon belül válaszol.</P>
        </Sub>
        <Sub n="VM 15.4.">
          <P>Az érintett panasszal fordulhat a Nemzeti Adatvédelmi és Információszabadság Hatósághoz (1055 Budapest, Falk Miksa utca 9–11.; ugyfelszolgalat@naih.hu; naih.hu), valamint bírósághoz is fordulhat.</P>
        </Sub>
      </Section>

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-xs text-gray-500 italic">
        <strong className="not-italic font-semibold text-gray-700">Jogi megjegyzés:</strong> A jelen dokumentum mintaszövegként készült, és az ÁSZF 7. és 12. pontjában rögzített Nyilvános Válasz funkcióhoz, valamint az esetleges anonimizált üzenetküldő funkcióhoz igazodóan tartalmazza a szükséges adatvédelmi rendelkezéseket. A dokumentum véglegesítése előtt – az adatfeldolgozói kör tényleges összeállítása, valamint a mindenkori jogszabályi változások figyelembevétele érdekében – elengedhetetlen ügyvéd/adatvédelmi szakjogász általi felülvizsgálat.
      </div>

      {/* ─── Közösségi segítség AT kiegészítés ─── */}
      <div className="mt-12 mb-6 border-t-2 border-sni-brand-teal pt-8">
        <h2 className="text-2xl font-bold text-sni-text">Közösségi segítség és felhasználói jelentések – Adatkezelési Tájékoztató kiegészítése</h2>
        <p className="text-sm text-gray-500 mt-1">Hatályos: 2026. augusztus 30. napjától</p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A jelen kiegészítés a VédettSarok meglévő Adatkezelési Tájékoztatójának a Közösségi segítség funkcióra és a felhasználói bejelentési rendszerre vonatkozó kiegészítése. A meglévő Tájékoztató általános rendelkezései e funkcióra is alkalmazandók, kivéve, ha a jelen kiegészítés eltérően rendelkezik.
        </div>
      </div>

      <Section id="ks-at-1" title="KS AT 1. A Közösségi segítség funkció adatkezelése">
        <Sub n="KS AT 1.1." title="Közösségi segítség beállítások">
          <DataTable rows={[
            ["Kezelt adatok", "a funkció engedélyezésének ténye és időpontja, segítségkérési és -felajánlási kategóriák, opcionális szöveges leírások (legfeljebb 500 karakter), láthatósági szint, felelősségi nyilatkozat elfogadásának időpontja"],
            ["Cél", "a KS funkció működtetése, a felhasználó elérhetővé tétele más tagok számára a beállított láthatósági körben"],
            ["Jogalap", "az érintett hozzájárulása (GDPR 6. cikk (1) a) pont) – a funkció aktiválása önkéntes"],
            ["Megőrzési idő", "a funkció kikapcsolásáig, illetve a fiók törléséig"],
          ]} />
        </Sub>
        <Sub n="KS AT 1.2.">
          <P>A KS funkció keretében megadott szöveges leírásokban az Adatkezelő kifejezetten felhívja a figyelmet arra, hogy ne kerüljön feltüntetésre gyermeknév, pontos lakcím, diagnózis, egészségügyi adat vagy más érzékeny személyes adat.</P>
        </Sub>
      </Section>

      <Section id="ks-at-2" title="KS AT 2. Felhasználói bejelentések adatkezelése">
        <Sub n="KS AT 2.1." title="Bejelentési adatok">
          <DataTable rows={[
            ["Kezelt adatok", "bejelentő felhasználói azonosítója, bejelentett felhasználói azonosítója, bejelentési kategória, leírás szövege, automatikusan számított súlyossági szint (kritikus / magas / normál), bejelentés időpontja, moderációs döntés és indoklás, audit napló bejegyzések"],
            ["Cél", "a közösségi biztonság védelme, visszaélések, jogsértések és bűncselekményre utaló magatartások kivizsgálása, az ÁSZF Közösségi segítség kiegészítésének érvényesítése"],
            ["Jogalap", "az Adatkezelő jogos érdeke a közösségi platform biztonságának fenntartásában (GDPR 6. cikk (1) f) pont); büntetőjogi vonatkozású vagy hatósági eljárást igénylő esetekben jogi kötelezettség teljesítése (GDPR 6. cikk (1) c) pont)"],
            ["Megőrzési idő", "legalább 6 hónap (kritikus esetekben legalább 12 hónap) a bejelentéstől számítva; hatósági eljárás, jogi igény vagy legalHold jelölés esetén az eljárás lezárultáig; anonimizálás ezt követően, törlés 24 hónappal az anonimizálás után"],
          ]} />
        </Sub>
        <Sub n="KS AT 2.2.">
          <P>A bejelentő személye a bejelentett felhasználóval nem kerül megosztásra, kivéve, ha ezt jogszabály, bíróság vagy hatóság kötelezően előírja. A bejelentés leírása a legszükségesebb mértékre korlátozandó; az Adatkezelő a bejelentési felületen kifejezetten felhívja a figyelmet arra, hogy szükségtelenül ne kerüljön megadásra gyermeknév, lakcím, diagnózis vagy más érzékeny adat.</P>
        </Sub>
        <Sub n="KS AT 2.3." title="Automatikus súlyossági besorolás">
          <P>A bejelentési kategória alapján az Adatkezelő szerver oldalon automatikusan meghatározza a bejelentés súlyossági szintjét. Ez az automatizált feldolgozás nem minősül a GDPR 22. cikke szerinti, kizárólag automatizált döntéshozatalnak, mivel minden bejelentést emberi adminisztrátori felülvizsgálat követ. Az érintett az automatikus súlyossági besorolást az Adatkezelő ügyfélszolgálatán keresztül vitathatja.</P>
        </Sub>
      </Section>

      <Section id="ks-at-3" title="KS AT 3. Moderációs audit napló">
        <Sub n="KS AT 3.1.">
          <DataTable rows={[
            ["Kezelt adatok", "az intézkedést meghozó adminisztrátor azonosítója, az intézkedés típusa, az előző és új állapot, az indoklás szövege, az intézkedés időpontja"],
            ["Cél", "az adminisztrátori döntések átláthatósága és elszámoltathatósága, belső jogorvoslat biztosítása"],
            ["Jogalap", "az Adatkezelő jogos érdeke (GDPR 6. cikk (1) f) pont)"],
            ["Megőrzési idő", "az érintett bejelentés megőrzési idejével megegyező ideig"],
          ]} />
        </Sub>
      </Section>

      <Section id="ks-at-4" title="KS AT 4. Fellebbezési eljárás">
        <Sub n="KS AT 4.1.">
          <DataTable rows={[
            ["Kezelt adatok", "fellebbező felhasználói azonosítója, fellebbezés szövege, fellebbezési státusz, adminisztrátori válasz, felülvizsgálat időpontja"],
            ["Cél", "belső fellebbezési eljárás lefolytatása, az érintett jogorvoslathoz való jogának biztosítása"],
            ["Jogalap", "jogi kötelezettség teljesítése, illetve az Adatkezelő jogos érdeke (GDPR 6. cikk (1) c) és f) pont)"],
            ["Megőrzési idő", "a fellebbezés lezárásától számított 3 évig"],
          ]} />
        </Sub>
        <Sub n="KS AT 4.2.">
          <P>A bejelentett felhasználó a moderációs döntésről szóló értesítéstől számított 6 hónapon belül fellebbezést nyújthat be az Adatkezelő ügyfélszolgálatán. A fellebbezési határidő lejárta után a bejelentés adatai – legalHold és nyitott eljárás hiányában – anonimizálásra kerülnek.</P>
        </Sub>
      </Section>

      <Section id="ks-at-5" title="KS AT 5. Automatizált adatmegőrzés és anonimizálás">
        <Sub n="KS AT 5.1.">
          <P>Az Adatkezelő automatizált folyamat (cron task) útján naponta ellenőrzi a bejelentések megőrzési idejét. A megőrzési idő lejárta és a fellebbezési határidő letelte esetén, ha sem jogi igény, sem hatósági megőrzési kötelezettség (legalHold) nem áll fenn, az Adatkezelő a bejelentés személyazonosításra alkalmas adatait anonimizálja. Az anonimizálástól számított 24 hónap elteltével az anonimizált rekord is törlésre kerül.</P>
        </Sub>
        <Sub n="KS AT 5.2.">
          <P>A legalHold jelölés manuálisan, adminisztrátori döntés alapján kerül alkalmazásra, kizárólag olyan esetekben, amikor folyamatban lévő vagy várható hatósági eljárás, bírósági ügy vagy jogvita indokolja az adatok fokozott megőrzését. A legalHold jelölés feloldása szintén adminisztrátori döntés alapján történik.</P>
        </Sub>
      </Section>
    </div>
  );
}
