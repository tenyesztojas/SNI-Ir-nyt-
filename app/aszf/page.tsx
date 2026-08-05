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
      <p className="font-semibold text-gray-900 mb-1">
        {n}{title ? ` ${title}` : ""}
      </p>
      <div className="pl-4 space-y-2 text-gray-700 leading-relaxed">{children}</div>
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

export default function AszfPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold text-sni-text">Általános Szerződési Feltételek</h1>
      <p className="mb-1 text-sm text-gray-500">Hatályos: 2026. augusztus 5. napjától</p>
      <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <strong>Üzemeltető:</strong> [Üzemeltető teljes neve / cégneve, székhelye, cégjegyzékszáma vagy
        nyilvántartási száma, adószáma, elérhetősége – kitöltendő]
        <span className="ml-1 text-gray-400">(a továbbiakban: „Üzemeltető")</span>
      </div>

      <Section id="preambulum" title="1. Preambulum, a Szolgáltatás célja és jogi minősítése">
        <Sub n="1.1.">
          <P>A weboldal (a továbbiakban: „Weboldal" vagy „Szolgáltatás") egy közösségi célú helyadatbázis és értékelő platform, amelynek célja, hogy az autizmussal és/vagy ADHD-val érintett személyek, családtagjaik és a velük foglalkozó szakemberek számára összegyűjtse és megismerhetővé tegye az autizmus- és ADHD-barát helyszíneket, létesítményeket és szolgáltatásokat (a továbbiakban: „Hely" vagy „Helyek"). A Weboldal e közösségi cél megvalósítása érdekében két, egymástól jogilag elkülönülő tartalomtípust kezel:</P>
          <P>a) <strong>Hely-alapadatok:</strong> az egyes Helyek azonosítására és leírására szolgáló alapadatok (elnevezés, cím, kategória, elérhetőség, akadálymentességi és szenzoros jellemzők stb.), amelyeket az Üzemeltető maga is feltölthet, szerkeszthet vagy kiegészíthet, illetve amelyeket Felhasználók javaslatai alapján vesz fel az adatbázisba;</P>
          <P>b) <strong>Felhasználói Értékelések:</strong> a regisztrált Felhasználók (a továbbiakban: „Felhasználó") által egy adott Helyről közzétett, saját, szubjektív, egyéni tapasztalatukon alapuló vélemények, minősítések, csillagozások és hozzászólások (a továbbiakban: „Értékelés" vagy „Felhasználói Tartalom").</P>
        </Sub>
        <Sub n="1.2.">
          <P>A jelen ÁSZF alkalmazásában a két tartalomtípus jogi sorsa élesen elkülönül egymástól. A Hely-alapadatok tekintetében az Üzemeltető tartalomszolgáltatóként jár el, és az általa közölt objektív, ellenőrizhető alapadatok valóságtartalmáért a jogszabályok általános szabályai szerint felel; ez a felelősség azonban nem érinti az adott Helyről közzétett Értékelések tartalmát. Az Értékelések tekintetében az Üzemeltető kizárólag az elektronikus kereskedelmi szolgáltatásokról szóló 2001. évi CVIII. törvény („Ekertv.") 2. § l) pontja szerinti tárhelyszolgáltatói, illetve az (EU) 2022/2065 digitális szolgáltatásokról szóló rendelet („DSA") 3. cikk g) pont iii. alpontja szerinti közvetítő szolgáltatói szerepet tölti be.</P>
        </Sub>
        <Sub n="1.3.">
          <P>Ugyanazon Felhasználó jogosult egy Helyet az adatbázisba javasolni, és azt utóbb – akár maga, akár más Felhasználók – Értékeléssel ellátni. E kettős szerepvállalás önmagában nem hoz létre összeférhetetlenséget, azonban a 3. pontban rögzített automatizált visszaélés-szűrés kiterjed az ilyen esetek figyelésére is.</P>
        </Sub>
        <Sub n="1.4.">
          <P>A Weboldal az Értékelések és a Hely-javaslatok közzétételi folyamatát a lehető legnagyobb mértékben automatizált, technikai jellegű eljárásra építi, annak érdekében, hogy az Üzemeltető szerepe a Felhasználói Tartalom tekintetében kizárólag technikai, automatikus és passzív jellegű maradjon, ahogyan azt az Ekertv. 2. § l) pontja és a DSA 4–6. cikke a felelősség alóli mentesség feltételeként meghatároznak. Ebből következően az Üzemeltető a Felhasználói Értékelések tartalmáért, valóságtartalmáért, illetve az abból eredő következményekért nem felel, tekintve, hogy azokat nem az Üzemeltető állítja elő, azok megfogalmazását, hangvételét és végkövetkeztetését nem az Üzemeltető határozza meg, és az Üzemeltető azok tartalmát a közzététel előtt emberi szerkesztői beavatkozással nem vizsgálja, nem véleményezi és nem hagyja jóvá.</P>
        </Sub>
        <Sub n="1.5.">
          <P>Az Üzemeltető felhívja a figyelmet arra, hogy a jelen pontban rögzített automatizált folyamat kizárólag az Üzemeltető belső kockázatkezelését és jogi pozícióját szolgálja, és nem eredményezi, és jogilag nem is eredményezheti a felelősség teljes és feltétel nélküli kizárását. A tárhelyszolgáltatói felelősség alóli mentesség az Ekertv. és a DSA kógens szabályain alapul, és attól függ, hogy az Üzemeltető a jogszabályi feltételeknek (különösen a 8. pont szerinti bejelentés-alapú eljárásnak) a gyakorlatban is megfelel.</P>
        </Sub>
      </Section>

      <Section id="fogalmak" title="2. Fogalommeghatározások">
        <div className="space-y-2">
          {[
            ["Hely", "a Weboldal adatbázisában szereplő, autizmus- és/vagy ADHD-barát jellemzőkkel rendelkező (vagy ilyenként javasolt) helyszín, létesítmény vagy szolgáltatás."],
            ["Hely-alapadat", "a Hely azonosítására és objektív leírására szolgáló, ellenőrizhető ténymegállapítás jellegű adat."],
            ["Érintett Hely", "az az értékelt helyszín, létesítmény, szolgáltató vagy harmadik személy, amelyre/akire az Értékelés vonatkozik, ideértve annak képviselőjét, tulajdonosát vagy üzemeltetőjét is."],
            ["Értékelés / Vélemény", "a Felhasználó által egy adott Helyről közzétett, a Felhasználó saját, szubjektív, egyedi tapasztalatán, észlelésén és megítélésén alapuló, nem tényállítás jellegű közlés."],
            ["Nyilvános Válasz", "az Érintett Hely által a Weboldal e célra biztosított funkcióján keresztül, egy adott Értékelésre reagálva, nyilvánosan közzétett szöveges közlés."],
            ["Automatikus technikai ellenőrzés", "a Weboldal informatikai rendszere által, emberi szerkesztői mérlegelés nélkül, előre meghatározott, tartalomfüggetlen technikai szempontok alapján lefolytatott automatizált vizsgálat."],
            ["Ténymegállapítás", "olyan objektíve igazolható vagy cáfolható közlés, amely nem szubjektív értékítéletet, hanem konkrét, ellenőrizhető tényt fejez ki."],
            ["Fogyasztói értékelési rendszer", "a fogyasztókkal szembeni tisztességtelen kereskedelmi gyakorlat tilalmáról szóló 2008. évi XLVII. törvény (a továbbiakban: „Fttv.”) szerinti, a Weboldal által biztosított olyan funkció, amely lehetővé teszi a Felhasználók számára a Helyekről szóló Értékelések közzétételét és megismerését."],
          ].map((pair) => (
            <div key={pair[0]} className="flex gap-2">
              <span className="font-semibold text-gray-900 shrink-0">{pair[0]}:</span>
              <span className="text-gray-700">{pair[1]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="automatizalt" title="3. Helyek felvétele és Értékelések közzététele – automatizált eljárás">
        <Sub n="3.1."><P>A Weboldalra történő regisztráció bárki számára szabadon, korlátozás, előzetes szelekció vagy meghívás nélkül elérhető.</P></Sub>
        <Sub n="3.2."><P>A Weboldal adatbázisában szereplő Helyek köre kettős forrásból épül: (i) az Üzemeltető által közvetlenül feltöltött Helyekből, valamint (ii) a Felhasználók által, a Weboldal 1.1. pontban rögzített közös célja érdekében önkéntesen javasolt Helyekből. Az Üzemeltető nem kér fel, nem instruál és nem irányít egyetlen Felhasználót sem meghatározott Hely javaslására, illetve meghatározott tartalmú, irányú vagy hangvételű Értékelés megírására.</P></Sub>
        <Sub n="3.3."><P>A Felhasználók által javasolt Helyek és a közzétett Értékelések a Weboldalon kizárólag Automatikus technikai ellenőrzésen keresztül kerülnek ki nyilvánosan a Weboldalra, emberi szerkesztői jóváhagyás, egyedi tartalmi mérlegelés vagy véleményezés nélkül. Az Automatikus technikai ellenőrzés kizárólag tartalomfüggetlen technikai szempontokra (formai validáció, duplikáció-szűrés, tiltott szavak listája, spam- és visszaélésszűrés) irányul, és nem terjed ki az Értékelés vagy a Hely-javaslat érdemi, tartalmi helyességének vizsgálatára.</P></Sub>
        <Sub n="3.4."><P>Az Automatikus technikai ellenőrzés eredménye semmilyen körülmények között nem tekinthető az Üzemeltető részéről tett tartalmi jóváhagyásnak, minősítésnek vagy állításnak az adott Hely vagy Értékelés helyességéről, valóságtartalmáról vagy megbízhatóságáról.</P></Sub>
        <Sub n="3.5."><P>Az Üzemeltető jogosult, de nem köteles kiegészítő, szúrópróbaszerű vagy utólagos emberi felülvizsgálatot alkalmazni, különösen a 8. pont szerinti bejelentés nyomán. Az ilyen, kivételes és kizárólag utólagos jellegű emberi beavatkozás önmagában nem eredményezi az Üzemeltető közvetítő szolgáltatói jogállásának elvesztését, feltéve, hogy az nem irányul az Értékelések rendszeres, előzetes, tartalmi szerkesztésére.</P></Sub>
        <Sub n="3.6."><P>Az Automatikus technikai ellenőrzés algoritmusa és szempontrendszere kizárólag formai, technikai és a jogszabályi tilalmak kiszűrésére irányuló kritériumokat alkalmaz, és nem alkalmaz olyan szempontot, amely az Értékelés pozitív vagy negatív tartalmán, hangvételén vagy végkövetkeztetésén alapulna.</P></Sub>
        <Sub n="3.7."><P>Az Automatikus technikai ellenőrzés kiterjed az 1.3. pont szerinti kettős szerepvállalás, valamint az ismétlődő, mintázatszerű, gyanús jelekre utaló Tartalom automatikus megjelölésére.</P></Sub>
        <Sub n="3.8."><P>A Weboldal adatbázisában szereplő Hely-alapadat az Üzemeltető vagy bármely Felhasználó által jelezhető elavultnak, megszűntnek vagy egyébként pontatlannak. Az ilyen jelzés nem minősül a 8. pont szerinti jogsértés-bejelentésnek; az Üzemeltető a jelzés alapján a Helyet – a törlés helyett elsődlegesen – „megszűnt" vagy „nem elérhető" jelöléssel látja el, a hozzá kapcsolódó Értékelések megtartása mellett.</P></Sub>
      </Section>

      <Section id="fttv" title="4. Fogyasztói értékelési rendszer – átláthatósági kötelezettségek">
        <Sub n="4.1."><P>Az Fttv. módosításai alapján az Üzemeltető, mint Fogyasztói értékelési rendszert biztosító szolgáltató, tájékoztatja a Felhasználókat és a nyilvánosságot arról, hogy milyen módon és milyen eljárás keretében biztosítja, hogy a közzétett Értékelések regisztrált Felhasználóktól származzanak, és hogyan végzi az Automatikus technikai ellenőrzést.</P></Sub>
        <Sub n="4.2."><P>Az Üzemeltető kifejezetten kizárja és tagadja, hogy bármely Értékelés hitelességét, valós felhasználói tapasztalaton alapuló jellegét tartalmi szempontból ellenőrizné vagy garantálná. Az Üzemeltető kizárólag azt biztosítja, hogy az Értékelés regisztrált Felhasználótól származik, és az Automatikus technikai ellenőrzésen átesett.</P></Sub>
        <Sub n="4.3."><P>Az Üzemeltető nem tesz közzé, nem támogat és nem tolerál hamis, megvásárolt, bérelt, harmadik fél megbízásából készült vagy egyébként manipulált Értékelést; az ilyen gyakorlat a Felhasználó és az Üzemeltető közötti jogviszony azonnali megszüntetésére és a Tartalom eltávolítására ad okot.</P></Sub>
        <Sub n="4.4."><P>Amennyiben a Weboldalon a Helyek megjelenési sorrendjét, kiemelését vagy rangsorolását bármilyen módon az Értékelések befolyásolják, ezt az Üzemeltető a Weboldalon elérhető, könnyen hozzáférhető tájékoztatásban egyértelműen feltünteti.</P></Sub>
        <Sub n="4.5."><P>Az Üzemeltető felhívja a Felhasználók figyelmét: az Automatikus technikai ellenőrzés jellegéből adódóan nem alkalmas és nem célja annak megállapítása, hogy egy Értékelés tartalma valós-e; ez a felelősség kizárólag a közzétevő Felhasználót terheli.</P></Sub>
      </Section>

      <Section id="dsa" title="5. Átláthatósági kötelezettségek az automatizált eljárással kapcsolatban (DSA)">
        <Sub n="5.1."><P>A DSA 14. cikke alapján az Üzemeltető tájékoztatja a Felhasználókat arról, hogy a Tartalom közzétételi folyamatában automatizált eszközöket alkalmaz; a DSA 17. cikke alapján pedig vállalja, hogy amennyiben egy Felhasználó Tartalmát automatizált döntés alapján korlátozza, eltávolítja vagy a hozzáférést megszünteti, erről a Felhasználót – az intézkedés indokával és a jogorvoslati lehetőség megjelölésével együtt – tájékoztatja.</P></Sub>
        <Sub n="5.2."><P>A Felhasználó jogosult az Automatikus technikai ellenőrzés által hozott, számára kedvezőtlen döntés ellen az Üzemeltetőnél panasszal élni, amelyet az Üzemeltető emberi közreműködéssel köteles kivizsgálni.</P></Sub>
        <Sub n="5.3."><P>A jelen pont szerinti kötelezettségek teljesítése nem jelenti azt, hogy az Üzemeltető a Tartalom érdemi, tartalmi vizsgálatát végezné; e kötelezettségek kizárólag a jogszabály által előírt formai garanciák biztosítására irányulnak.</P></Sub>
      </Section>

      <Section id="jogijellege" title="6. Az Értékelések jogi jellege – kiemelt nyilatkozat">
        <div className="rounded-xl border-l-4 border-sni-brand-teal bg-teal-50/50 px-5 py-4 mb-4">
          <p className="text-gray-800 leading-relaxed font-medium">Az Üzemeltető ezúton kifejezetten és félreérthetetlenül kijelenti, hogy a Weboldalon közzétett valamennyi Értékelés, vélemény, minősítés, csillagozás és hozzászólás kizárólag az azt közzétevő Felhasználó saját, szubjektív, egyéni tapasztalatát, benyomását és véleményét fejezi ki, és semmilyen körülmények között nem tekinthető, nem tulajdonítható és nem értelmezhető az Üzemeltető saját álláspontjának, véleményének, állításának, minősítésének vagy ajánlásának.</p>
        </div>
        <Sub n="6.2."><P>Az a körülmény, hogy egy Hely alapadatait az Üzemeltető maga tölti fel, vagy hogy a Hely, illetve az Értékelés közzététele Automatikus technikai ellenőrzéshez kötött, nem változtatja meg az Értékelések jogi jellegét.</P></Sub>
        <Sub n="6.3."><P>Az Üzemeltető a Felhasználói Értékelések valóságtartalmáért, pontosságáért, teljességéért vagy az azokban foglalt megállapítások helytállóságáért kifejezetten és teljes körűen kizárja felelősségét.</P></Sub>
        <Sub n="6.4."><P>A Felhasználók figyelmét felhívjuk arra, hogy a Polgári Törvénykönyvről szóló 2013. évi V. törvény („Ptk.") 2:45. § (2) bekezdése szerint a jóhírnév megsértését az valósítja meg, ha valaki más személyre vonatkozó, valótlan tényt állít vagy híresztel, vagy valós tényt hamis színben tüntet fel. A következetes bírói gyakorlat szerint ezzel szemben az értékítélet, bírálat, szubjektív vélemény kifejtése önmagában – amennyiben az nem burkolt tényállítást takar, és kifejezésmódjában nem indokolatlanul bántó, becsmérlő vagy megalázó – nem alapoz meg személyiségijog-sértést.</P></Sub>
        <Sub n="6.5."><P>Az Üzemeltető felhívja a Felhasználók figyelmét, hogy Értékelésükben kerüljék az objektív, ellenőrizhetetlen ténymegállapítások közlését, és tartalmukat saját, személyes észlelésükre, tapasztalatukra korlátozzák.</P></Sub>
      </Section>

      <Section id="valasz" title="7. A Hely nyilvános válaszadási joga">
        <Sub n="7.1."><P>A Weboldal az Érintett Hely (annak igazoltan a Hellyel kapcsolatban álló képviselője, tulajdonosa vagy üzemeltetője) számára biztosítja a lehetőséget, hogy a Helyről közzétett bármely Értékelésre a Weboldal felületén, nyilvánosan, szövegesen reagáljon (Nyilvános Válasz).</P></Sub>
        <Sub n="7.2."><P>A Nyilvános Válasz funkció kizárólagos célja, hogy az Érintett Hely a saját nézőpontját, cáfolatát vagy kiegészítését a nyilvánosság számára ugyanazon a felületen megjeleníthesse, anélkül, hogy ehhez az Értékelést közzétevő Felhasználó személyes adatait (különösen valós nevét, e-mail címét, telefonszámát vagy egyéb elérhetőségét) megismerné.</P></Sub>
        <Sub n="7.3."><P>Az Érintett Hely a Nyilvános Válasz igénybevétele érdekében a Weboldalon elérhető igazolási eljárás keretében köteles alátámasztani a Hellyel fennálló kapcsolatát (pl. céges e-mail cím, egyéb, az Üzemeltető által meghatározott igazolási mód útján).</P></Sub>
        <Sub n="7.4."><P>A Nyilvános Válasz tartalmára a jelen ÁSZF Értékelésekre vonatkozó rendelkezései (különösen a 6., 8. és 9. pont) megfelelően irányadók: a Nyilvános Válasz sem tekinthető az Üzemeltető álláspontjának, azért kizárólag az Érintett Hely felel, és arra ugyanúgy alkalmazandó a 8. pont szerinti bejelentési eljárás, ha az jogsértő tartalmat (pl. az Értékelést közzétevő Felhasználó azonosítására alkalmas adatot, fenyegetést, zaklatást) tartalmaz.</P></Sub>
        <Sub n="7.5."><P>Az Üzemeltető kifejezetten tilalmazza, hogy az Érintett Hely a Nyilvános Válaszban a Felhasználó személyazonosságára vonatkozó feltételezést, találgatást vagy azonosításra alkalmas információt közöljön, vagy a Felhasználóval szemben a Weboldalon kívüli kapcsolatfelvételre, zaklatásra vagy nyomásgyakorlásra irányuló felhívást tegyen. Az ilyen Nyilvános Válasz a 8. pont szerinti eljárásban eltávolítható.</P></Sub>
        <Sub n="7.6."><P>Amennyiben az Érintett Hely a Felhasználóval közvetlen, privát kapcsolatot kíván felvenni, ezt kizárólag a Weboldal által – amennyiben az Üzemeltető ilyet biztosít – e célra kialakított, a felek valós elérhetőségét fel nem táró, anonimizált üzenetküldő funkción keresztül teheti meg.</P></Sub>
      </Section>

      <Section id="bejelentes" title="8. Jogsértő tartalom bejelentése és eltávolítása (Notice-and-Action)">
        <Sub n="8.1."><P>Az Üzemeltető felhívja a Felhasználók és harmadik személyek figyelmét, hogy az Automatikus technikai ellenőrzés jellegéből adódóan nem képes az Értékelések és Nyilvános Válaszok tartalmi jogszerűségének teljes körű, előzetes kiszűrésére; ezért a jogszabályi felelősség-mentesség fennmaradásának feltétele, hogy az Üzemeltető a jogellenes Tartalomról való tényleges tudomásszerzés esetén haladéktalanul intézkedjen.</P></Sub>
        <Sub n="8.2."><P>Az Ekertv. 10–11. §-ai, valamint a DSA 16. cikke alapján az Üzemeltető biztosít egy könnyen elérhető, elektronikus bejelentési mechanizmust, amelynek útján bármely természetes vagy jogi személy bejelentheti, ha megítélése szerint valamely Értékelés vagy Nyilvános Válasz jogszabályba ütköző, valótlan tényállítást tartalmaz, vagy egyéb módon jogsértő.</P></Sub>
        <Sub n="8.3.">
          <P>A bejelentésnek tartalmaznia kell:</P>
          <LetterList items={[
            "(i) a bejelentő elérhetőségét,",
            "(ii) az érintett Tartalom pontos, egyértelmű megjelölését,",
            "(iii) a jogsértés kellően részletes indokolását,",
            "(iv) a bejelentő nyilatkozatát a bejelentés jóhiszeműségéről.",
          ]} />
        </Sub>
        <Sub n="8.4."><P>Az Üzemeltető a bejelentés kézhezvételét követően ésszerű időn belül megvizsgálja azt, és amennyiben a Tartalom nyilvánvalóan jogsértő jellege megállapítható, haladéktalanul intézkedik annak eltávolításáról. Az Üzemeltető ezen intézkedéssel nem vállal felelősséget a korábban közzétett Tartalomért, és az intézkedés megtétele nem minősül a Tartalom jogsértő jellegének elismerésének.</P></Sub>
        <Sub n="8.5."><P>Az Üzemeltető fenntartja a jogot, hogy nyilvánvalóan jogsértő, gyűlöletkeltő, hamis, megtévesztő, manipulált Tartalmat, illetve az azt közzétevő Felhasználó vagy Érintett Hely fiókját előzetes értesítés nélkül eltávolítsa, korlátozza vagy törölje.</P></Sub>
      </Section>

      <Section id="felelosseg" title="9. A Felhasználó és az Érintett Hely szavatosságvállalása és felelőssége">
        <Sub n="9.1.">
          <P>A Felhasználó a regisztrációval, Hely javaslásával és/vagy Értékelés közzétételével kifejezetten szavatolja, hogy</P>
          <LetterList items={[
            "a) az általa közzétett Értékelés saját, valós, személyes tapasztalatán alapul;",
            "b) az általa javasolt Hely és a hozzá kapcsolódó alapadat a legjobb tudása szerint valós és pontos;",
            "c) az Értékelés, illetve a Hely-javaslat közzétételére jogosult, és az nem sérti harmadik személy jogait;",
            "d) az Értékelés nem tartalmaz valótlan ténymegállapítást, rágalmazó, becsületsértő, gyűlöletkeltő, megtévesztő vagy egyébként jogszabályba ütköző tartalmat;",
            "e) az Értékelés, illetve a Hely-javaslat közzététele nem irányított, nem harmadik személy megbízásából történik;",
            "f) tudomással bír arról, hogy Tartalma Automatikus technikai ellenőrzésen keresztül, emberi előzetes jóváhagyás nélkül kerül közzétételre.",
          ]} />
        </Sub>
        <Sub n="9.2."><P>Az Érintett Hely a Nyilvános Válasz közzétételével szavatolja, hogy a válasz nem tartalmaz a Felhasználó azonosítására alkalmas adatot, fenyegetést, zaklatást vagy jogszabályba ütköző tartalmat, és elfogadja a 7.5. pont szerinti korlátozásokat.</P></Sub>
        <Sub n="9.3."><P>Az Értékelés, illetve a Nyilvános Válasz tartalmáért és az abból eredő valamennyi következményért kizárólagosan és teljes körűen az azt közzétevő Felhasználó, illetve Érintett Hely tartozik felelősséggel. Amennyiben harmadik személy az Üzemeltetővel szemben egy Felhasználó vagy Érintett Hely által közzétett Tartalom miatt igényt érvényesít, az érintett fél köteles az Üzemeltetőt teljes mértékben kártalanítani.</P></Sub>
        <Sub n="9.4."><P>A Hely-alapadatok tekintetében az Üzemeltető a jelen ÁSZF 1.2. pontja szerinti korlátozott, kizárólag az objektív alapadatokra vonatkozó felelősséget viseli; ez azonban nem terjed ki és nem érinti az adott Helyről közzétett Értékelések vagy Nyilvános Válaszok tartalmát.</P></Sub>
      </Section>

      <Section id="felelossegkorlatozas" title="10. Felelősség korlátozása">
        <Sub n="10.1."><P>A Weboldal használata, a Hely-adatbázis, az Értékelések és a Nyilvános Válaszok megismerése és az azokra alapított bármely döntés kizárólag a Weboldalt használó személy saját kockázatára és felelősségére történik.</P></Sub>
        <Sub n="10.2."><P>Az Üzemeltető semmilyen kifejezett vagy hallgatólagos szavatosságot nem vállal az Értékelések és Nyilvános Válaszok pontosságára, teljességére, aktualitására, megbízhatóságára vonatkozóan, és kifejezetten kizárja felelősségét minden ebből eredő kárért, jóhírnévben bekövetkezett sérelemért.</P></Sub>
        <Sub n="10.3."><P>A jelen pontban foglalt felelősségkorlátozás nem érinti és nem helyettesíti az Üzemeltető azon jogszabályi kötelezettségét, hogy a 8. pont szerinti eljárásban a nyilvánvalóan jogsértő Tartalmat eltávolítsa, sem a 9.4. pont szerinti korlátozott felelősségét, sem a 4. pont szerinti fogyasztóvédelmi átláthatósági kötelezettségeket.</P></Sub>
      </Section>

      <Section id="szellemi" title="11. Szellemi tulajdon">
        <Sub n="11.1."><P>A Weboldal szerkezete, dizájnja, grafikai elemei, adatbázis-szerkezete az Üzemeltető, illetve az arra jogosult harmadik személyek szellemi tulajdonát képezik.</P></Sub>
        <Sub n="11.2."><P>A Felhasználó és az Érintett Hely a Tartalom (Hely-javaslat, Értékelés, Nyilvános Válasz) közzétételével az Üzemeltető részére nem kizárólagos, korlátlan időre és térbeli korlátozás nélkül szóló, díjmentes felhasználási jogot enged a Tartalom Weboldalon történő megjelenítésére, tárolására és technikai továbbítására.</P></Sub>
      </Section>

      <Section id="adatkezeles" title="12. Adatkezelés">
        <Sub n="12.1."><P>A regisztráció, a Hely-javaslat, az Értékelés, a Nyilvános Válasz közzététele, valamint a 7.6. pont szerinti anonimizált üzenetküldő funkció használata során megadott személyes adatok kezelésére a Weboldal külön <Link href="/adatkezelesi-tajekoztato" className="text-sni-brand-blue hover:underline">Adatkezelési Tájékoztatója</Link> az irányadó, amely a GDPR és az információs önrendelkezési jogról szóló 2011. évi CXII. törvény rendelkezéseinek megfelelően készült.</P></Sub>
        <Sub n="12.2."><P>Az Üzemeltető rögzíti, hogy a Felhasználó személyes adatait – a Nyilvános Válasz funkció útján megvalósuló, adatot nem felfedő interakción kívül – nem továbbítja az Érintett Hely részére, kivéve, ha a Felhasználó erre kifejezett, önkéntes és elkülönített hozzájárulást ad.</P></Sub>
        <Sub n="12.3."><P>Az Automatikus technikai ellenőrzés – amennyiben az a GDPR 22. cikke szerinti, kizárólag automatizált döntéshozatalnak minősül – tekintetében a Felhasználót megilleti az emberi beavatkozás kérésének, álláspontja kifejtésének és a döntés megtámadásának joga, amelyet az 5.2. pont szerinti panaszeljárás biztosít.</P></Sub>
      </Section>

      <Section id="modositas" title="13. Módosítás joga">
        <Sub n="13.1."><P>Az Üzemeltető fenntartja a jogot a jelen ÁSZF egyoldalú módosítására. A módosított ÁSZF a Weboldalon történő közzétételt követően lép hatályba.</P></Sub>
      </Section>

      <Section id="jogvita" title="14. Irányadó jog és jogviták rendezése">
        <Sub n="14.1."><P>A jelen ÁSZF-re és a Weboldal használatával kapcsolatos valamennyi jogviszonyra a magyar jog, így különösen a Ptk., az Ekertv., az Fttv. és a DSA rendelkezései az irányadók.</P></Sub>
        <Sub n="14.2."><P>A felek a jelen ÁSZF-fel kapcsolatos jogvitáikat elsődlegesen békés úton kísérlik meg rendezni. Ennek eredménytelensége esetén a jogvita elbírálására a magyar bíróságok kizárólagos illetékessége irányadó.</P></Sub>
      </Section>

      <Section id="zaro" title="15. Záró rendelkezések">
        <Sub n="15.1."><P>Amennyiben a jelen ÁSZF valamely rendelkezése érvénytelennek vagy végrehajthatatlannak bizonyulna, ez nem érinti a többi rendelkezés érvényességét.</P></Sub>
        <Sub n="15.2."><P>A jelen ÁSZF a Weboldal Felhasználója és az Üzemeltető közötti teljes megállapodást tartalmazza a Weboldal használatával kapcsolatban.</P></Sub>
      </Section>

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-xs text-gray-500 italic">
        <strong className="not-italic font-semibold text-gray-700">Jogi megjegyzés:</strong> A jelen dokumentum mintaszövegként készült. A dokumentum véglegesítése előtt – különösen az Adatkezelési Tájékoztatóval való összhang, az igazolási eljárás (7.3. pont) és az esetleges anonimizált üzenetküldő funkció (7.6. pont) tényleges megvalósítása tekintetében – elengedhetetlen ügyvéd/jogász általi felülvizsgálat.
      </div>
    </div>
  );
}
