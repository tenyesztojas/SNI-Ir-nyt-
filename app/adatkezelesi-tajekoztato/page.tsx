export const metadata = {
  title: "Adatkezelési tájékoztató – VédettSarok",
};

export default function AdatkezelesiPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-sni-text">Adatkezelési tájékoztató</h1>
      <p className="mt-2 text-sm text-gray-500">Hatályos: [kitöltendő dátum] &mdash; Verzió: 1.0 – TESZTVERZIÓ</p>

      <div className="mt-8 prose prose-sm max-w-none text-gray-700 space-y-6">

        <Section title="1. Az adatkezelési tájékoztató célja">
          <p>Jelen adatkezelési tájékoztató a VédettSarok weboldal és webalkalmazás (a továbbiakban: Szolgáltatás) használatával összefüggő személyesadat-kezelésekre vonatkozó tájékoztatást tartalmazza. A tájékoztató célja, hogy az érintettek átlátható, közérthető és részletes információt kapjanak arról, hogy a Szolgáltatás üzemeltetője milyen adatokat, milyen célból, milyen jogalapon, mennyi ideig kezel, kik számára teszi hozzáférhetővé, valamint az érintetteket milyen jogok illetik meg.</p>
          <p>A VédettSarok egy magyar nyelvű közösségi helykereső és ajánló szolgáltatás, amely autizmussal és ADHD-val érintett családoknak, érintett felnőtteknek és segítő szakembereknek nyújt segítséget. A Szolgáltatás nem minősül egészségügyi, diagnosztikai, terápiás vagy orvosi szolgáltatásnak.</p>
          <p>A Szolgáltatás kialakítása során kiemelt szempont az adattakarékosság, a beépített és alapértelmezett adatvédelem, valamint annak elkerülése, hogy a rendszer szükségtelenül gyermekekre vagy egészségi állapotra vonatkozó személyes adatokat gyűjtsön vagy tegyen közzé.</p>
        </Section>

        <Section title="2. Az adatkezelő adatai">
          <p>
            <strong>Adatkezelő neve:</strong> 4 Nature Kft.<br />
            <strong>Székhely:</strong> 2038 Sóskút, Kőszikla utca 21.<br />
            <strong>Levelezési cím:</strong> 2038 Sóskút, Kőszikla utca 21.<br />
            <strong>E-mail cím:</strong> 4naturekft@gmail.com<br />
            <strong>Cégjegyzékszám:</strong> 13-09-221686<br />
            <strong>Adószám:</strong> 32038107-1-13<br />
            <strong>Weboldal:</strong> vedettsarok.hu
          </p>
        </Section>

        <Section title="3. A Szolgáltatás rövid bemutatása">
          <p>A VédettSarok olyan közösségi platform, amely lehetővé teszi különösen az alábbi funkciók használatát: helyek keresése, helyek adatlapjának megtekintése, helyek ajánlása és beküldése, csillagos értékelés és rövid szöveges vélemény beküldése, hibás adat vagy problémás tartalom jelzése, felhasználói fiók létrehozása és belépés, kedvencek mentése, hírlevél és egyéb bővített funkciók.</p>
          <p>A rendszer nem arra szolgál, hogy a felhasználók saját magukra, gyermekükre vagy más személyre vonatkozó diagnózist, egészségi állapotot, terápiás hátteret vagy más érzékeny információt közzétegyenek.</p>
        </Section>

        <Section title="4. Irányadó jogszabályok és alapelvek">
          <p>Az adatkezelésre különösen az alábbi jogszabályok irányadók: az Európai Parlament és a Tanács (EU) 2016/679 rendelete (GDPR), az információs önrendelkezési jogról és az információszabadságról szóló 2011. évi CXII. törvény (Infotv.), a NAIH vonatkozó tájékoztatói és iránymutatásai, valamint az Európai Adatvédelmi Testület releváns iránymutatásai.</p>
          <p>Az adatkezelő az adatkezelés során különösen az alábbi alapelveket érvényesíti: jogszerűség, tisztességes eljárás és átláthatóság; célhoz kötöttség; adattakarékosság; pontosság; korlátozott tárolhatóság; integritás és bizalmas jelleg; elszámoltathatóság.</p>
        </Section>

        <Section title="5. Fogalmak">
          <p>Jelen tájékoztatóban a személyes adat, adatkezelés, adatkezelő, adatfeldolgozó, címzett, érintett, hozzájárulás, különleges kategóriájú személyes adat, profilalkotás, álnevesítés és adattovábbítás fogalma alatt a GDPR-ban meghatározott fogalmak értendők.</p>
        </Section>

        <Section title="6. Az érintettek köre">
          <p>Az adatkezelések különösen az alábbi érintetti köröket érinthetik: a weboldal látogatói, kapcsolatfelvételt kezdeményező személyek, helybeküldők, értékelést vagy véleményt beküldő felhasználók, regisztrált felhasználók, hírlevélre feliratkozók, szolgáltatói vagy üzleti profil igénylői, hibás adatot vagy problémás tartalmat bejelentő személyek.</p>
          <p>A Szolgáltatás nem gyermekek személyes adatainak gyűjtésére szolgál.</p>
        </Section>

        <Section title="7. Kezelt adatok köre, cél, jogalap, megőrzési idő">
          <SubSection title="7.1. Weboldal működtetése, IT-biztonság">
            <p>Az adatkezelő a weboldal működtetése és védelme érdekében kezelheti az IP-címet, a böngésző típusát, az eszköz típusát, a látogatás időpontját és egyéb technikai naplóadatokat. Jogalap: jogos érdek. Megőrzési idő: jellemzően 30–90 nap.</p>
          </SubSection>
          <SubSection title="7.2. Kapcsolatfelvétel, ügyintézés">
            <p>Kezelt adatok: név, e-mail cím, üzenet tartalma, beküldés időpontja. Cél: a megkeresés megválaszolása, panasz- és ügykezelés. Jogalap: jogos érdek. Megőrzési idő: az ügy lezárásától számított legfeljebb 12 hónap.</p>
          </SubSection>
          <SubSection title="7.3. Helybeküldés">
            <p>Kezelt adatok: megjelenítési név, e-mail cím, a hely adatai, rövid leírás, beküldés időpontja, moderációs státusz. Jogalap: jogos érdek. Megőrzési idő: elutasítás esetén legfeljebb 90 nap, jóváhagyott tartalom esetén a közzététel fennállásáig.</p>
          </SubSection>
          <SubSection title="7.4. Értékelések és vélemények">
            <p>Kezelt adatok: publikus megjelenítési név, csillagos értékelés, rövid szöveges vélemény, beküldés időpontja, moderációs státusz. Jogalap: jogos érdek. Megőrzési idő: a közzététel fennállásáig vagy törlési kérelemig.</p>
          </SubSection>
          <SubSection title="7.5. Hibajelentés">
            <p>Kezelt adatok: opcionális név vagy e-mail, bejelentés tartalma, időpont. Jogalap: jogos érdek. Megőrzési idő: az ügy lezárásától számított legfeljebb 12 hónap.</p>
          </SubSection>
          <SubSection title="7.6. Regisztráció és fiókkezelés">
            <p>Kezelt adatok: belső azonosító, e-mail cím, auth provider, publikus megjelenítési név, fiók létrehozásának időpontja, utolsó belépés ideje. Jogalap: szerződéses jogalap. Megőrzési idő: a fiók fennállásáig.</p>
          </SubSection>
          <SubSection title="7.7. Visszaélés-megelőzés, hitelességvédelem">
            <p>Kezelt adatok: belső azonosítók, belépési és beküldési időpontok, IP-hash formában tárolt technikai adatok. Jogalap: jogos érdek. Megőrzési idő: tipikusan 30–180 nap.</p>
          </SubSection>
          <SubSection title="7.8. Hírlevél">
            <p>Kezelt adatok: e-mail cím, feliratkozás és leiratkozás időpontja, hozzájárulás igazolása. Jogalap: hozzájárulás. Megőrzési idő: a leiratkozásig.</p>
          </SubSection>
          <SubSection title="7.9. Sütik és analitika">
            <p>A weboldal sütiket és analitikai eszközöket (Google Analytics) használhat. A szükséges sütik jogalapja a működtetéshez kapcsolódó érdek, a nem szükséges sütiké hozzájárulás.</p>
          </SubSection>
        </Section>

        <Section title="8–9. Látogatói adatok és kapcsolatfelvétel">
          <p>A weboldal használata során technikai okokból kezelhetők IP-címek, böngésző- és eszközadatok, a látogatás időpontja, hibalogok és biztonsági naplók. Kapcsolatfelvételkor az adatkezelő kezeli a felhasználó nevét, e-mail címét, üzenetét és az üzenet időpontját. A felhasználó köteles tartózkodni attól, hogy diagnosztikai, egészségügyi vagy gyermekre vonatkozó érzékeny adatot küldjön.</p>
        </Section>

        <Section title="10–11. Helybeküldés és értékelések">
          <p>Helybeküldéskor az adatkezelő kezeli a beküldő megjelenítési nevét, e-mail címét, a helyre vonatkozó adatokat és a rövid leírást. A beküldött tartalmak moderáción esnek át. Az értékelések célja a helyek rövid, általános bemutatása. A nyilvános felületen csak a publikus megjelenítési név, a csillagos értékelés, a rövid szöveges vélemény és az időpont jelenik meg.</p>
        </Section>

        <Section title="12–13. Különleges kategóriájú adatok és gyermekek adatai">
          <p>Az egészségi állapotra vonatkozó adatok különleges kategóriájú személyes adatok. A Szolgáltatás működési modellje kifejezetten arra épül, hogy ilyen adatokat ne gyűjtsön. A Szolgáltatás nem gyermekek személyes adatainak gyűjtésére szolgál.</p>
        </Section>

        <Section title="14–16. Fiókkezelés, hitelességvédelem, moderáció">
          <p>A felhasználói fiókok célja a hitelesség és kényelmi funkciók biztosítása. Az adatkezelő a fiókhoz szükséges minimális adatokat kezeli. A hamis vagy tömeges értékelések kiszűrése érdekében az adatkezelő visszaélés-megelőzési logikát alkalmazhat. A felhasználói tartalmak moderációja a Szolgáltatás működésének része.</p>
        </Section>

        <Section title="17–19. Sütik, hírlevél, szolgáltatói profil">
          <p>A weboldal sütiket használhat; a részletes listát külön sütitájékoztató tartalmazza. Hírlevél esetén az adatkezelő az e-mail címet, a feliratkozás és leiratkozás időpontját kezeli; a felhasználó bármikor leiratkozhat. Szolgáltatói profil igénylésekor az adatkezelő a kapcsolattartó nevét, elérhetőségét és a vállalkozás alapadatait kezeli.</p>
        </Section>

        <Section title="20–21. Adatfeldolgozók és adattovábbítás">
          <p>Az adatkezelő a szolgáltatás nyújtásához adatfeldolgozókat vesz igénybe (tárhelyszolgáltató, hosting szolgáltató, auth- és adatbázis-szolgáltató, e-mail szolgáltató, analitikai szolgáltató). Ha valamely szolgáltató az Európai Gazdasági Térségen kívülre továbbít adatot, az adatkezelő gondoskodik a megfelelő garanciákról.</p>
        </Section>

        <Section title="22–23. Adatbiztonság és adatvédelmi hatásvizsgálat">
          <p>Az adatkezelő kockázattal arányos technikai és szervezési intézkedéseket alkalmaz: hozzáférés-szabályozás, titkosított adatkapcsolat, naplózás, biztonsági mentés, rendszeres frissítés, jogosultságkezelés és incidenskezelési eljárás.</p>
        </Section>

        <Section title="24. Az érintettek jogai">
          <p>Az érintettet különösen az alábbi jogok illetik meg: tájékoztatáshoz és hozzáféréshez való jog, helyesbítéshez való jog, törléshez való jog, az adatkezelés korlátozásához való jog, adathordozhatósághoz való jog, tiltakozáshoz való jog, hozzájárulás visszavonásának joga. Az érintett kérelmét az adatkezelő indokolatlan késedelem nélkül, legfeljebb egy hónapon belül válaszolja meg.</p>
        </Section>

        <Section title="25. Jogorvoslat – NAIH és bíróság">
          <p>Ha az érintett úgy véli, hogy személyes adatainak kezelése sérti az adatvédelmi jogszabályokat, panasszal fordulhat a Nemzeti Adatvédelmi és Információszabadság Hatósághoz, vagy bírósághoz fordulhat.</p>
          <p>
            <strong>Nemzeti Adatvédelmi és Információszabadság Hatóság</strong><br />
            1055 Budapest, Falk Miksa utca 9-11.<br />
            Levelezési cím: 1363 Budapest, Pf. 9.<br />
            Telefon: +36 (1) 391-1400<br />
            E-mail: ugyfelszolgalat@naih.hu<br />
            Web: <a href="https://www.naih.hu" target="_blank" rel="noopener" className="text-sni-brand-blue underline">naih.hu</a>
          </p>
        </Section>

        <Section title="26–27. Adatvédelmi incidensek és tájékoztató módosítása">
          <p>Az adatkezelő belső eljárásrendet működtet adatvédelmi incidensek felismerésére, kivizsgálására és szükség szerinti bejelentésére. Az adatkezelő jogosult a jelen tájékoztatót módosítani; a hatályos verziót mindig a weboldalon teszi közzé.</p>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-sni-text mb-2">{title}</h2>
      <div className="space-y-2 text-gray-700 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
      {children}
    </div>
  );
}
