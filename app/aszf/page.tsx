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

      {/* ─── VédettMunka ÁSZF-kiegészítés ─── */}
      <div className="mt-12 mb-6 border-t-2 border-sni-brand-teal pt-8">
        <h2 className="text-2xl font-bold text-sni-text">VédettMunka – ÁSZF-kiegészítés</h2>
        <p className="text-sm text-gray-500 mt-1">Hatályos: 2026. augusztus 30. napjától</p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A jelen kiegészítés a VédettSarok meglévő Általános Szerződési Feltételeinek a VédettMunka álláshirdetési, álláskeresési, önéletrajz-készítő, állásértesítő és jelentkezéstovábbító szolgáltatásra vonatkozó kiegészítése. A meglévő ÁSZF általános rendelkezései a VédettMunka szolgáltatásra is alkalmazandók, kivéve, ha a jelen kiegészítés eltérően rendelkezik.
        </div>
      </div>

      <Section id="vm-aszf-1" title="VM 1. A VédettMunka szolgáltatás jellege">
        <Sub n="VM 1.1.">
          <P>A VédettMunka a VédettSarok által biztosított specializált álláshirdetési, álláskeresési, önéletrajz-készítő, állásértesítő és jelentkezéstovábbító szolgáltatás.</P>
        </Sub>
        <Sub n="VM 1.2.">
          <P>A VédettMunka a jelenlegi működési modellben nem épít kereshető önéletrajz-adatbázist, nem teszi általánosan hozzáférhetővé az Álláskeresők önéletrajzát a Munkáltatók számára, nem végez automatikus előszűrést vagy jelöltajánlást, és nem garantálja a munkaviszony létrejöttét.</P>
        </Sub>
        <Sub n="VM 1.3.">
          <P>A VédettMunka jelenleg az Álláskeresők számára díjmentesen használható. Online fizetési funkció jelenleg nem érhető el. Fizetős hirdetési vagy online fizetési szolgáltatás bevezetése esetén a VédettSarok külön díjtáblázatot, megrendelési és számlázási feltételeket, valamint adatkezelési tájékoztatást tesz közzé.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-2" title="VM 2. Álláskeresői fiók és használat">
        <Sub n="VM 2.1.">
          <P>A VédettMunka egyes funkciói regisztrációhoz kötöttek. Az Álláskereső köteles a regisztráció során valós, pontos és naprakész adatokat megadni, a fiók belépési adatait bizalmasan kezelni, valamint a jogosulatlan hozzáférés gyanúját haladéktalanul jelezni a VédettSaroknak.</P>
        </Sub>
        <Sub n="VM 2.2.">
          <P>Az Álláskereső köteles a VédettMunka szolgáltatást rendeltetésszerűen használni, és nem jogosult más személy nevében, annak felhatalmazása nélkül jelentkezést küldeni, önéletrajzot készíteni, adatot megadni vagy dokumentumot feltölteni.</P>
        </Sub>
        <Sub n="VM 2.3.">
          <P>Az Álláskereső felel azért, hogy az általa megadott vagy feltöltött információk a legjobb tudomása szerint valósak, pontosak, naprakészek, nem jogsértők, és nem sértik harmadik személy személyiségi jogát, szerzői jogát, üzleti titkát vagy más jogos érdekét.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-3" title="VM 3. Önéletrajz-készítő">
        <Sub n="VM 3.1.">
          <P>A VédettMunka önéletrajz-készítője a Felhasználó által megadott adatokból a Felhasználó saját böngészőjében PDF-önéletrajzot állít össze. A VédettSarok nem garantálja, hogy a létrejött dokumentum minden Munkáltató informatikai rendszerében, eszközén vagy nyomtatási környezetében változatlan formában jelenik meg.</P>
        </Sub>
        <Sub n="VM 3.2.">
          <P>Az önéletrajz tartalmi, szakmai, nyelvi és jogi megfelelőségéért az Álláskereső felel. A VédettSarok nem ellenőrzi, nem hitelesíti és nem garantálja az önéletrajzban szereplő adatok valóságtartalmát.</P>
        </Sub>
        <Sub n="VM 3.3.">
          <P>A fénykép feltöltése önkéntes. Az Álláskereső tudomásul veszi, hogy az önéletrajz-piszkozat, a feltöltött fénykép és a letöltött PDF saját eszközén, illetve böngészőjében történő védelméről neki kell gondoskodnia.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-4" title="VM 4. Jelentkezés és adattovábbítás">
        <Sub n="VM 4.1.">
          <P>A VédettMunka az Álláskereső által kiválasztott álláshirdetéshez kapcsolódó jelentkezést az Álláskereső kérése alapján továbbítja a megnevezett Munkáltatónak.</P>
        </Sub>
        <Sub n="VM 4.2.">
          <P>A technikai visszaigazolás kizárólag azt tanúsítja, hogy a VédettSarok rendszere a jelentkezés fogadását vagy továbbítását megkísérelte, illetve a kézbesítés technikai állapotáról információt kapott. Nem jelenti azt, hogy a Munkáltató a jelentkezést megnyitotta, elolvasta, megvizsgálta, elfogadta vagy az Álláskeresőt kiválasztotta.</P>
        </Sub>
        <Sub n="VM 4.3.">
          <P>A VédettSarok a jelentkezéshez csatolt dokumentumot a továbbítás technikai teljesítésén túl nem tárolja. A jelentkezés továbbítását követően a Munkáltató önálló adatkezelőként jár el. A Munkáltató kiválasztási folyamatáért, kommunikációjáért, döntéséért, adatkezeléséért és a munkaviszony feltételeiért a VédettSarok nem felel.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-5" title="VM 5. Különleges adatokkal kapcsolatos szabály">
        <Sub n="VM 5.1.">
          <P>A VédettMunka nem kér diagnózist, egészségügyi dokumentumot, fogyatékossági igazolást vagy megváltozott munkaképességet igazoló iratot az Álláskeresőtől.</P>
        </Sub>
        <Sub n="VM 5.2.">
          <P>Az Álláskereső kizárólag saját tudatos döntése alapján csatolhat olyan dokumentumot, amely különleges adatot tartalmazhat. Az Álláskereső tudomásul veszi, hogy az ilyen dokumentum az általa kiválasztott Munkáltató részére is továbbításra kerülhet.</P>
        </Sub>
        <Sub n="VM 5.3.">
          <P>A Munkáltató a jelentkezési folyamat első szakaszában nem kérhet indokolatlanul diagnózist, egészségügyi dokumentumot, fogyatékossági igazolást vagy megváltozott munkaképességet igazoló dokumentumot.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-6" title="VM 6. Munkáltatói regisztráció és jóváhagyás">
        <Sub n="VM 6.1.">
          <P>A VédettMunka felületén hirdetést kizárólag a VédettSarok által előzetesen jóváhagyott Munkáltató tehet közzé.</P>
        </Sub>
        <Sub n="VM 6.2.">
          <P>A Munkáltató köteles valós és naprakész cégadatokat, kapcsolattartási adatokat, valamint saját adatkezelési tájékoztatójának működő URL-jét megadni. A Munkáltató adatkezelési tájékoztatójának hiánya, elérhetetlensége vagy nyilvánvaló hiányossága esetén a VédettSarok a Munkáltatói regisztrációt vagy a hirdetés közzétételét megtagadhatja, illetve a hirdetést felfüggesztheti.</P>
        </Sub>
        <Sub n="VM 6.3.">
          <P>A jóváhagyás nem minősül a Munkáltató teljes körű jogi, pénzügyi, adatvédelmi, munkaügyi vagy szakmai átvilágításának, nem jelent tanúsítást, ajánlást, minősítést vagy garanciát a Munkáltató működésére, munkakörülményeire vagy kiválasztási gyakorlatára nézve.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-7" title="VM 7. Munkáltatói kötelezettségek">
        <Sub n="VM 7.1.">
          <P>A Munkáltató a regisztrációval és hirdetésfeladással kijelenti és vállalja, hogy:</P>
          <LetterList items={[
            "jogszerűen működő Munkáltató, vagy annak nevében jogszerűen eljáró személy;",
            "a megadott cég- és kapcsolattartási adatok valósak, pontosak és naprakészek;",
            "az álláshirdetés valós, ténylegesen betölthető munkakörre vonatkozik;",
            "a hirdetésben szereplő adatok a legjobb tudomása szerint valósak, pontosak, időszerűek és nem megtévesztők;",
            "tudomásul veszi, hogy a felületen neurodivergens, megváltozott munkaképességű, fogyatékossággal élő, illetve érintett gyermeket nevelő Álláskeresők is jelentkezhetnek;",
            "a jelentkezőket a vonatkozó jogszabályok szerint kezeli;",
            "a beérkezett jelentkezések tekintetében önálló adatkezelőként jár el, saját adatkezelési tájékoztatót biztosít;",
            "a jelentkezési adatokat kizárólag az adott állás betöltésével összefüggő kiválasztási célból használja fel;",
            "nem értékesíti, nem teszi jogosulatlan személy számára hozzáférhetővé és nem használja jogellenes célra a jelentkezők személyes adatait;",
            "a jelentkezési folyamat első szakaszában nem kér indokolatlan egészségügyi dokumentumot, diagnózist vagy fogyatékossági igazolást.",
          ]} />
        </Sub>
      </Section>

      <Section id="vm-aszf-8" title="VM 8. Álláshirdetések tartalmi követelményei">
        <Sub n="VM 8.1.">
          <P>A Munkáltató köteles a hirdetést világosan, közérthetően és a tényleges munkakörülményeknek megfelelően megfogalmazni. A VédettSarok előírhatja vagy javasolhatja, hogy a hirdetés különösen az alábbi információkat tartalmazza: a pozíció megnevezése, a munkavégzés helye, a munkaviszony és munkaidő jellege, a távmunka vagy rugalmas munkarend lehetősége, ha ténylegesen biztosított; a bér vagy bérsáv, munkakezdés, interjúfolyamat és a Munkáltató adatkezelési tájékoztatójának elérhetősége.</P>
        </Sub>
        <Sub n="VM 8.2.">
          <P>A Munkáltató nem állíthatja vagy sugallhatja, hogy a munkakörnyezet akadálymentes, autizmusbarát, befogadó vagy rugalmas, ha ezt nem tudja ténylegesen, következetesen és a munkakör szintjén biztosítani.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-9" title="VM 9. Tiltott tartalmak és magatartások">
        <Sub n="VM 9.1.">
          <P>A VédettMunka felületén tilos olyan hirdetést, tartalmat vagy jelentkezést közzétenni, továbbítani vagy használni, amely:</P>
          <LetterList items={[
            "jogszabályba, jóerkölcsbe vagy harmadik személy jogába ütközik;",
            "hamis, megtévesztő vagy lényeges körülményt elhallgató;",
            "jogellenes hátrányos megkülönböztetést tartalmaz;",
            "piramisjátékhoz, csaláshoz, adathalászathoz vagy más jogellenes tevékenységhez kapcsolódik;",
            "előzetes díjat, befektetést vagy termékvásárlást követel az Álláskeresőtől;",
            "a munkakör szempontjából szükségtelen különleges adatot – diagnózist, egészségügyi leletet, fogyatékossági igazolást – megkövetel;",
            "kártevőt, megtévesztő hivatkozást vagy automatizált tömeges hozzáférést tartalmaz;",
            "más személy személyes adatát, dokumentumát, szellemi tulajdonát jogosulatlanul használja.",
          ]} />
        </Sub>
      </Section>

      <Section id="vm-aszf-10" title="VM 10. Moderáció, hirdetésjelentés és jogkövetkezmények">
        <Sub n="VM 10.1.">
          <P>A VédettSarok jogosult a hirdetéseket közzététel előtt vagy után ellenőrizni, és különösen jogosult a hirdetés közzétételét megtagadni, felfüggeszteni, eltávolítani, a Munkáltatói fiók hozzáférését korlátozni, illetve indokolt esetben hatósági megkeresésre adatot szolgáltatni.</P>
        </Sub>
        <Sub n="VM 10.2.">
          <P>Bármely személy bejelentheti a feltételezetten jogellenes vagy jelen ÁSZF-be ütköző hirdetést a Felületen biztosított jelentési funkción keresztül. A VédettSarok a döntés felülvizsgálatát a panaszkezelési e-mail-címen biztosítja.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-11" title="VM 11. Szellemi tulajdon">
        <Sub n="VM 11.1.">
          <P>A VédettSarok Felületének, szoftverének, arculatának, szövegeinek, grafikai elemeinek, adatbázisának és más tartalmainak szerzői vagy más szellemi tulajdonjogai a VédettSarokot vagy a megfelelő jogosultat illetik meg. A Munkáltató a hirdetés feltöltésével nem kizárólagos, a szolgáltatás teljesítéséhez szükséges felhasználási engedélyt ad tartalmainak a VédettMunka felületén történő közzétételéhez.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-12" title="VM 12. Felelősség">
        <Sub n="VM 12.1.">
          <P>A VédettSarok nem felel a Munkáltató kiválasztási döntéséért, válaszadási gyakorlatáért, adatkezeléséért, a munkaszerződés feltételeiért, a munkaviszony létrejöttéért vagy elmaradásáért.</P>
        </Sub>
        <Sub n="VM 12.2.">
          <P>A VédettSarok nem felel a Felhasználó saját eszközén vagy böngészőjében tárolt önéletrajz-piszkozat elvesztéséért, törléséért vagy illetéktelen megismeréséért, ha az a Felhasználó eszközének, böngészőjének, internetkapcsolatának vagy más, a VédettSarok ellenőrzésén kívüli körülménynek tulajdonítható.</P>
        </Sub>
        <Sub n="VM 12.3.">
          <P>A VédettSarok felelősségkorlátozása nem alkalmazható a szándékosan vagy súlyos gondatlansággal okozott károkra, az életet, testi épséget vagy egészséget sértő károkozásra, valamint minden olyan felelősségre, amelyet jogszabály kizárni vagy korlátozni nem enged.</P>
        </Sub>
      </Section>

      <Section id="vm-aszf-13" title="VM 13. Fiók megszüntetése és a feltételek módosítása">
        <Sub n="VM 13.1.">
          <P>Az Álláskereső fiókja törlését a Felületen vagy az ügyfélszolgálati e-mail-címen bármikor kérheti. A Munkáltató fiókjának megszüntetését a munkáltatói ügyfélszolgálati e-mail-címen kérheti.</P>
        </Sub>
        <Sub n="VM 13.2.">
          <P>A VédettSarok jogosult a jelen kiegészítést módosítani. Lényeges módosítás esetén a VédettSarok a hatálybalépést megelőzően megfelelő időben közzéteszi a módosított szöveget, és szükség esetén közvetlen elektronikus értesítést küld.</P>
        </Sub>
      </Section>

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-xs text-gray-500 italic">
        <strong className="not-italic font-semibold text-gray-700">Jogi megjegyzés:</strong> A jelen dokumentum mintaszövegként készült. A dokumentum véglegesítése előtt – különösen az Adatkezelési Tájékoztatóval való összhang, az igazolási eljárás (7.3. pont) és az esetleges anonimizált üzenetküldő funkció (7.6. pont) tényleges megvalósítása tekintetében – elengedhetetlen ügyvéd/jogász általi felülvizsgálat.
      </div>

      {/* ─── Közösségi segítség ÁSZF kiegészítés ─── */}
      <div className="mt-12 mb-6 border-t-2 border-sni-brand-teal pt-8">
        <h2 className="text-2xl font-bold text-sni-text">Közösségi segítség funkció és felhasználói jelentések – ÁSZF kiegészítés</h2>
        <p className="text-sm text-gray-500 mt-1">Hatályos: 2026. augusztus 30. napjától</p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A jelen kiegészítés a VédettSarok meglévő Általános Szerződési Feltételeinek a Közösségi segítség funkcióra és a felhasználói jelentések kezelésére vonatkozó kiegészítése. A meglévő ÁSZF általános rendelkezései e funkcióra is alkalmazandók, kivéve, ha a jelen kiegészítés eltérően rendelkezik.
        </div>
      </div>

      <Section id="ks-1" title="KS 1. A Közösségi segítség funkció">
        <Sub n="KS 1.1.">
          <P>A Közösségi segítség funkció (a továbbiakban: „KS funkció") a VédettSarok webapplikációjában elérhető, önkéntes alapú, egymás közötti segítségkérési és -felajánlási felület. A KS funkció célja, hogy a közösség tagjai számára lehetőséget biztosítson egymás megtalálásához és kölcsönös támogatásához.</P>
        </Sub>
        <Sub n="KS 1.2.">
          <P>A KS funkció nem minősül egészségügyi, személyszállítási, gyermekfelügyeleti, szociális vagy bármely más, hatósági engedélyhez vagy szakképzettséghez kötött szolgáltatásnak. A VédettSarok kizárólag a kapcsolatfelvételi felületet biztosítja; a konkrét segítség tartalmáért, minőségéért, biztonságáért és jogszerűségéért a segítséget nyújtó felhasználó felel.</P>
        </Sub>
        <Sub n="KS 1.3.">
          <P>A KS funkció aktiválása önkéntes, és a felelősségi nyilatkozat elfogadásához kötött. A funkció bármikor kikapcsolható.</P>
        </Sub>
      </Section>

      <Section id="ks-2" title="KS 2. Felhasználói felelősség és tiltott magatartások">
        <Sub n="KS 2.1.">
          <P>A KS funkció keretében tilos:</P>
          <LetterList items={[
            "a) gyermek személyes adatait (nevet, lakcímet, iskola vagy óvoda nevét, egészségügyi adatot) nyilvánosan megosztani;",
            "b) felügyeleti jellegű, fizikai kontaktust igénylő, közvetítői jogkörbe tartozó vagy veszélyes tevékenységet közvetítői felügyelet nélkül felajánlani;",
            "c) pénzért, ellenszolgáltatásért vagy üzletszerűen segítséget hirdetni vagy kérni;",
            "d) másokat megtévesztő, zaklató vagy fenyegető magatartást tanúsítani;",
            "e) a KS funkciót toborzási, hirdetési vagy más, a funkcióval össze nem egyeztethető célra felhasználni.",
          ]} />
        </Sub>
        <Sub n="KS 2.2.">
          <P>Gyermek melletti jelenlét vagy szállítás felajánlása kizárólag a szülő vagy törvényes képviselő előzetes, egyedi és írásos (üzenetbeli) hozzájárulásával, és kizárólag az érintett szülő részvételével lehetséges. A VédettSarok e tevékenységek lebonyolításáért semmilyen felelősséget nem vállal.</P>
        </Sub>
      </Section>

      <Section id="ks-3" title="KS 3. Felhasználói jelentések">
        <Sub n="KS 3.1.">
          <P>A bejelentési rendszer lehetőséget biztosít a KS funkcióval összefüggő visszaélések, biztonsági aggályok, jogsértések vagy bűncselekményre utaló magatartások jelzésére. A bejelentési kategóriák és azok automatikus súlyossági besorolása:</P>
          <LetterList items={[
            "Kritikus (azonnali adminisztrátori kezelés): fenyegetés vagy erőszak, gyermekbiztonságot érintő eset, gyermek személyes adatának megosztása, adatvédelem megsértése / doxxing;",
            "Magas prioritású: veszélyes segítségfelajánlás, átverés vagy csalás, pénzkérés vagy kereskedelmi tevékenység;",
            "Normál prioritású: zaklatás vagy bántó viselkedés, visszaélés a KS funkcióval, egyéb.",
          ]} />
        </Sub>
        <Sub n="KS 3.2.">
          <P>A bejelentési felületen minden esetben megjelenik az alábbi tájékoztatás: amennyiben az érintett közvetlen és azonnali veszélyben van, a bejelentési felület nem alkalmas vészhívásra – ilyenkor haladéktalanul a <strong>112</strong> egységes segélyhívó számot kell tárcsázni, illetve a hatáskörrel rendelkező hatóságot kell értesíteni.</P>
        </Sub>
        <Sub n="KS 3.3.">
          <P>A bejelentők személye az érintett felhasználóval nem kerül megosztásra, kivéve, ha ezt jogszabály, bíróság vagy hatóság kötelezően előírja.</P>
        </Sub>
        <Sub n="KS 3.4.">
          <P>A bejelentés benyújtása nem jelent automatikus hatósági bejelentést, és nem helyettesíti azt. A VédettSarok fenntartja a jogot, hogy az ügyet szükség esetén az illetékes hatóságnak jelezze.</P>
        </Sub>
      </Section>

      <Section id="ks-4" title="KS 4. Moderációs eljárás és jogorvoslat">
        <Sub n="KS 4.1.">
          <P>A bejelentéseket az adminisztrátorok a súlyossági besorolás sorrendjében, kötelező írásos indoklással vizsgálják meg, és döntéseikről audit naplót vezetnek. A döntés ellen a bejelentett felhasználó a döntésről szóló értesítéstől számított 6 hónapon belül fellebbezést nyújthat be a VédettSarok ügyfélszolgálatán keresztül.</P>
        </Sub>
        <Sub n="KS 4.2.">
          <P>A KS funkció felfüggesztése vagy letiltása a VédettSarok belső moderációs döntése alapján történhet. Felfüggesztés esetén az érintett felhasználó a bejelentésben foglalt tájékoztató alapján élhet jogorvoslattal.</P>
        </Sub>
      </Section>

      <Section id="ks-5" title="KS 5. Adatmegőrzés és törlés">
        <Sub n="KS 5.1.">
          <P>A bejelentésekhez kapcsolódó adatokat a VédettSarok a bejelentés beérkezésétől számítva legalább 6 hónapig – kritikus esetekben legalább 12 hónapig –, hatósági eljárás, jogi igény vagy legalHold jelölés esetén az eljárás lezárultáig megőrzi. Az adatmegőrzés részletes szabályait a VédettSarok Adatkezelési Tájékoztatójának Közösségi segítség kiegészítése tartalmazza.</P>
        </Sub>
        <Sub n="KS 5.2.">
          <P>A megőrzési idő lejárta és a fellebbezési határidő letelte után, amennyiben sem jogi igény, sem legalHold nem áll fenn, a bejelentés személyes adatai anonimizálásra kerülnek.</P>
        </Sub>
      </Section>
    </div>
  );
}
