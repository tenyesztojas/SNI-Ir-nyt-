export const metadata = {
  title: "Általános Szerződési Feltételek – VédettSarok",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-sni-text">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mt-4 mb-1">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function AszfPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-sni-text">Általános Szerződési Feltételek</h1>
      <p className="mt-1 text-base font-semibold text-gray-700">vedettsarok.hu</p>
      <p className="mt-1 text-sm text-gray-500">
        <strong>Hatályos:</strong> 2026. augusztus 4. napjától &nbsp;|&nbsp;
        <strong>Üzemeltető:</strong> 4 Nature Kft. &ndash; 2038 Sóskút, Kőszikla utca 21. &ndash; Cg. 13-09-221686 &ndash; Adószám: 32038107-1-13 &ndash; 4naturekft@gmail.com
      </p>

      <div className="mt-8 prose prose-sm max-w-none text-gray-700 space-y-8">

        <Section title="1. Preambulum, a Szolgáltatás célja és jogi minősítése">
          <p>1.1. A vedettsarok.hu weboldal (a továbbiakban: <strong>„Weboldal”</strong> vagy <strong>„Szolgáltatás”</strong>) egy <strong>közösségi célú helyadatbázis és értékelő platform</strong>, amelynek célja, hogy az autizmussal és/vagy ADHD-val érintett személyek, családtagjaik és a velük foglalkozó szakemberek számára összegyűjtse és megismerhetővé tegye az autizmus- és ADHD-barát helyszíneket, létesítményeket és szolgáltatásokat (a továbbiakban: <strong>„Hely”</strong> vagy <strong>„Helyek”</strong>). A Weboldal e közösségi cél megvalósítása érdekében két, egymástól jogilag elkülönülő tartalomtípust kezel:</p>
          <p><strong>a) Hely-alapadatok:</strong> az egyes Helyek azonosítására és leírására szolgáló alapadatok (elnevezés, cím, kategória, elérhetőség, akadálymentességi és szenzoros jellemzők stb.), amelyeket <strong>az Üzemeltető maga is feltölthet, szerkeszthet vagy kiegészíthet</strong>, illetve amelyeket Felhasználók javaslatai alapján vesz fel az adatbázisba;</p>
          <p><strong>b) Felhasználói Értékelések:</strong> a regisztrált Felhasználók (a továbbiakban: <strong>„Felhasználó”</strong>) által egy adott Helyről közzétett, saját, szubjektív, egyéni tapasztalatukon alapuló vélemények, minősítések, csillagozások és hozzászólások (a továbbiakban: <strong>„Értékelés”</strong> vagy <strong>„Felhasználói Tartalom”</strong>).</p>
          <p>1.2. A jelen ÁSZF alkalmazásában a két tartalomtípus jogi sorsa élesen elkülönül egymástól. A <strong>Hely-alapadatok</strong> tekintetében az Üzemeltető tartalomszolgáltatóként jár el; az <strong>Értékelések</strong> tekintetében az Üzemeltető kizárólag az elektronikus kereskedelmi szolgáltatásokról szóló <strong>2001. évi CVIII. törvény („Ekertv.”)</strong> 2. § l) pontja szerinti <strong>tárhelyszolgáltatói</strong>, illetve az (EU) 2022/2065 digitális szolgáltatásokról szóló rendelet („<strong>DSA</strong>”) 3. cikk g) pont iii. alpontja szerinti közvetítő szolgáltatói szerepet tölti be.</p>
          <p>1.3. Ugyanazon Felhasználó jogosult egy Helyet az adatbázisba javasolni, <strong>és</strong> azt utóbb Értékeléssel ellátni. E kettős szerepvállalás önmagában nem hoz létre összeférhetetlenséget, azonban a 3. és 5. pontban rögzített automatizált visszaélés-szűrés kiterjed az ilyen esetek figyelésére is.</p>
          <p>1.4. A Weboldal az Értékelések és a Hely-javaslatok közzétételi folyamatát a lehető legnagyobb mértékben <strong>automatizált, technikai jellegű eljárásra</strong> építi, annak érdekében, hogy az Üzemeltető szerepe a Felhasználói Tartalom tekintetében kizárólag technikai, automatikus és passzív jellegű maradjon. Ebből következően <strong>az Üzemeltető a Felhasználói Értékelések tartalmáért, valóságtartalmáért, illetve az abból eredő következményekért nem felel.</strong></p>
          <p>1.5. Az Üzemeltető felhívja a figyelmet arra, hogy a jelen pontban rögzített automatizált folyamat <strong>kizárólag az Üzemeltető belső kockázatkezelését és jogi pozícióját szolgálja</strong>, és nem eredményezi a felelősség teljes és feltétel nélküli kizárását. A tárhelyszolgáltatói felelősség alóli mentesség az Ekertv. és a DSA kógens szabályain alapul.</p>
        </Section>

        <Section title="2. Fogalommeghatározások">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Hely:</strong> a Weboldal adatbázisában szereplő, autizmus- és/vagy ADHD-barát jellemzőkkel rendelkező (vagy ilyenként javasolt) helyszín, létesítmény vagy szolgáltatás.</li>
            <li><strong>Hely-alapadat:</strong> a Hely azonosítására és objektív leírására szolgáló, ellenőrizhető ténymegállapítás jellegű adat.</li>
            <li><strong>Értékelés / Vélemény:</strong> a Felhasználó által egy adott Helyről közzétett, a Felhasználó saját, szubjektív, egyedi tapasztalatán, észlelésén és megítélésén alapuló, nem tényállítás jellegű közlés.</li>
            <li><strong>Automatikus technikai ellenőrzés:</strong> a Weboldal informatikai rendszere által, emberi szerkesztői mérlegelés nélkül, előre meghatározott, tartalomfüggetlen technikai szempontok alapján lefolytatott automatizált vizsgálat.</li>
            <li><strong>Ténymegállapítás:</strong> olyan objektíve igazolható vagy cáfolható közlés, amely nem szubjektív értékítéletet, hanem konkrét, ellenőrizhető tényt fejez ki.</li>
            <li><strong>Érintett Hely:</strong> az az értékelt helyszín, létesítmény, szolgáltató vagy harmadik személy, amelyre/akire az Értékelés vonatkozik.</li>
            <li><strong>Fogyasztói értékelési rendszer:</strong> a fogyasztókkal szembeni tisztességtelen kereskedelmi gyakorlat tilalmáról szóló 2008. évi XLVII. törvény (Fttv.) szerinti funkció, amely lehetővé teszi a Felhasználók számára a Helyekről szóló Értékelések közzétételét és megismerését.</li>
          </ul>
        </Section>

        <Section title="3. Helyek felvétele és Értékelések közzététele – automatizált eljárás">
          <p>3.1. A Weboldalra történő <strong>regisztráció bárki számára szabadon</strong>, korlátozás, előzetes szelekció vagy meghívás nélkül elérhető.</p>
          <p>3.2. A Weboldal adatbázisában szereplő Helyek köre kettős forrásból épül: (i) az Üzemeltető által közvetlenül feltöltött Helyekből, valamint (ii) a Felhasználók által önkéntesen javasolt Helyekből. Az Üzemeltető nem kér fel, nem instruál és nem irányít egyetlen Felhasználót sem meghatározott Hely javaslására, és nem irányít egyetlen Felhasználót sem meghatározott tartalmú, irányú vagy hangvételű Értékelés megírására.</p>
          <p>3.3. <strong>A Felhasználók által javasolt Helyek és a közzétett Értékelések a Weboldalon kizárólag Automatikus technikai ellenőrzésen keresztül kerülnek ki nyilvánosan a Weboldalra</strong>, emberi szerkesztői jóváhagyás, egyedi tartalmi mérlegelés vagy véleményezés nélkül.</p>
          <p>3.4. <strong>Az Automatikus technikai ellenőrzés eredménye semmilyen körülmények között nem tekinthető az Üzemeltető részéről tett tartalmi jóváhagyásnak</strong> az adott Hely vagy Értékelés helyességéről, valóságtartalmáról vagy megbízhatóságáról.</p>
          <p>3.5. Az Üzemeltető jogosult, de nem köteles kiegészítő, szúrópróbaszerű vagy utólagos emberi felülvizsgálatot alkalmazni, különösen a 7. pont szerinti bejelentés nyomán.</p>
          <p>3.6. <strong>Az Automatikus technikai ellenőrzés algoritmusa kizárólag formai, technikai és a jogszabályi tilalmak kiszűrésére irányuló kritériumokat alkalmaz.</strong> Minden közzétett Értékelés azonos technikai elbánásban részesül, függetlenül attól, hogy az Érintett Hely számára kedvező vagy kedvezőtlen tartalmú.</p>
          <p>3.7. Az Automatikus technikai ellenőrzés kiterjed az 1.3. pont szerinti kettős szerepvállalás, valamint az ismétlődő, mintázatszerű, egy IP-címről / eszközről érkező, vagy egyéb gyanús jelekre utaló Tartalom automatikus megjelölésére.</p>
        </Section>

        <Section title="4. Fogyasztói értékelési rendszer – átláthatósági kötelezettségek">
          <p>4.1. Az Fttv. módosításai alapján az Üzemeltető tájékoztatja a Felhasználókat arról, hogy <strong>milyen módon biztosítja, hogy a közzétett Értékelések regisztrált Felhasználóktól származzanak, és hogyan végzi az Automatikus technikai ellenőrzést.</strong></p>
          <p>4.2. Az Üzemeltető <strong>kifejezetten kizárja és tagadja</strong>, hogy bármely Értékelés hitelességét tartalmi szempontból ellenőrizné vagy garantálná. Az Üzemeltető kizárólag azt biztosítja, hogy az Értékelés regisztrált Felhasználótól származik, és az Automatikus technikai ellenőrzésen átesett; <strong>azt, hogy az Értékelés szerzője valóban felkereste-e az Érintett Helyet, az Üzemeltető technikailag nem ellenőrzi és nem garantálja.</strong></p>
          <p>4.3. Az Üzemeltető nem tesz közzé, nem támogat és nem tolerál hamis, megvásárolt, bérelt, harmadik fél megbízásából készült vagy egyébként manipulált Értékelést.</p>
          <p>4.4. Amennyiben a Weboldalon a Helyek megjelenési sorrendjét bármilyen módon az Értékelések befolyásolják, ezt az Üzemeltető a Weboldalon egyértelműen feltünteti.</p>
          <p>4.5. Az Automatikus technikai ellenőrzés jellegéből adódóan <strong>nem alkalmas és nem célja</strong> annak megállapítása, hogy egy Értékelés tartalma valós-e; ez a felelősség kizárólag a közzétevő Felhasználót terheli.</p>
        </Section>

        <Section title="5. Átláthatósági kötelezettségek az automatizált eljárással kapcsolatban (DSA)">
          <p>5.1. A DSA 14. cikke alapján az Üzemeltető tájékoztatja a Felhasználókat arról, hogy a Tartalom közzétételi folyamatában automatizált eszközöket alkalmaz; a DSA 17. cikke alapján pedig vállalja, hogy amennyiben egy Felhasználó Tartalmát automatizált döntés alapján korlátozza, eltávolítja vagy a hozzáférést megszünteti, erről a Felhasználót tájékoztatja.</p>
          <p>5.2. A Felhasználó jogosult az Automatikus technikai ellenőrzés által hozott, számára kedvezőtlen döntés ellen az Üzemeltetőnél panasszal élni, amelyet az Üzemeltető emberi közreműködéssel köteles kivizsgálni.</p>
          <p>5.3. A jelen pont szerinti átláthatósági és panaszkezelési kötelezettségek teljesítése <strong>nem jelenti azt, hogy az Üzemeltető a Tartalom érdemi, tartalmi vizsgálatát végezné.</strong></p>
        </Section>

        <Section title="6. Az Értékelések jogi jellege – kiemelt nyilatkozat">
          <blockquote className="border-l-4 border-sni-brand-teal bg-teal-50 px-4 py-3 rounded-r-xl text-gray-800 text-sm">
            <strong>6.1. Az Üzemeltető ezúton kifejezetten és félreérthetetlenül kijelenti, hogy a Weboldalon közzétett valamennyi Értékelés, vélemény, minősítés, csillagozás és hozzászólás kizárólag az azt közzétevő Felhasználó saját, szubjektív, egyéni tapasztalatát, benyomását és véleményét fejezi ki, és semmilyen körülmények között nem tekinthető, nem tulajdonítható és nem értelmezhető az Üzemeltető saját álláspontjának, véleményének, állításának, minősítésének vagy ajánlásának.</strong>
          </blockquote>
          <p>6.2. Az a körülmény, hogy egy Hely alapadatait az Üzemeltető maga tölti fel, vagy hogy a Hely, illetve az Értékelés közzététele Automatikus technikai ellenőrzéshez kötött, <strong>nem változtatja meg az Értékelések jogi jellegét.</strong></p>
          <p>6.3. Az Üzemeltető a Felhasználói Értékelések valóságtartalmáért, pontosságáért, teljességéért vagy az azokban foglalt megállapítások helytállóságáért <strong>kifejezetten és teljes körűen kizárja felelősségét.</strong></p>
          <p>6.4. A Felhasználók figyelmét felhívjuk arra, hogy a Ptk. 2:45. § (2) bekezdése szerint a jóhírnév megsértését az valósítja meg, ha valaki más személyre vonatkozó, valótlan tényt állít vagy híresztel, vagy valós tényt hamis színben tüntet fel. Ezzel szemben az <strong>értékítélet, bírálat, szubjektív vélemény kifejtése önmagában – amennyiben az nem burkolt tényállítást takar, és kifejezésmódjában nem indokolatlanul bántó – nem alapoz meg személyiségijog-sértést.</strong></p>
          <p>6.5. Az Üzemeltető felhívja a Felhasználók figyelmét, hogy Értékelésükben kerüljék az objektív, ellenőrizhetetlen ténymegállapítások közlését, és tartalmukat saját, személyes észlelésükre, tapasztalatukra korlátozzák.</p>
        </Section>

        <Section title="7. Jogsértő tartalom bejelentése és eltávolítása (Notice-and-Action)">
          <p>7.1. Az Üzemeltető felhívja a figyelmet, hogy az Automatikus technikai ellenőrzés jellegéből adódóan nem képes az Értékelések tartalmi jogszerűségének teljes körű, előzetes kiszűrésére; ezért az Üzemeltető a jogellenes Tartalomról való tényleges tudomásszerzés esetén haladéktalanul intézkedik.</p>
          <p>7.2. Az Ekertv. 10–11. §-ai, valamint a DSA 16. cikke alapján az Üzemeltető biztosít egy könnyen elérhető elektronikus bejelentési mechanizmust, amelynek útján bármely személy bejelentheti, ha megítélése szerint valamely Értékelés jogszabályba ütközik.</p>
          <p>7.3. A bejelentésnek tartalmaznia kell: (i) a bejelentő elérhetőségét, (ii) az érintett Tartalom pontos megjelölését (URL), (iii) a jogsértés kellően részletes indokolását, (iv) a bejelentő nyilatkozatát a bejelentés jóhiszeműségéről.</p>
          <p>7.4. Az Üzemeltető a bejelentés kézhezvételét követően ésszerű időn belül megvizsgálja azt, és amennyiben a Tartalom nyilvánvalóan jogsértő jellege megállapítható, haladéktalanul intézkedik annak eltávolításáról.</p>
          <p>7.5. Az Üzemeltető fenntartja a jogot, hogy nyilvánvalóan jogsértő, gyűlöletkeltő, hamis, megtévesztő vagy manipulált Tartalmat, illetve az azt közzétevő Felhasználó fiókját előzetes értesítés nélkül eltávolítsa, korlátozza vagy törölje.</p>
        </Section>

        <Section title="8. A Felhasználó szavatosságvállalása és felelőssége">
          <p>8.1. A Felhasználó a regisztrációval, Hely javaslásával és/vagy Értékelés közzétételével <strong>kifejezetten szavatolja</strong>, hogy</p>
          <ul className="list-[lower-alpha] pl-6 space-y-1">
            <li>az általa közzétett Értékelés saját, valós, személyes tapasztalatán alapul;</li>
            <li>az általa javasolt Hely és a hozzá kapcsolódó alapadat a legjobb tudása szerint valós és pontos;</li>
            <li>az Értékelés, illetve a Hely-javaslat közzétételére jogosult, és az nem sérti harmadik személy személyiségi jogait, jóhírnevét, becsületét, vagy egyéb jogát;</li>
            <li>az Értékelés nem tartalmaz valótlan ténymegállapítást, rágalmazó, becsületsértő, gyűlöletkeltő, megtévesztő vagy egyébként jogszabályba ütköző tartalmat;</li>
            <li>az Értékelés, illetve a Hely-javaslat nem irányított, nem harmadik személy megbízásából, ellenszolgáltatás fejében vagy tisztességtelen piaci magatartás céljából történik;</li>
            <li>amennyiben a Felhasználó maga javasolta az Érintett Helyet, az utóbb közzétett Értékelése a saját, valós tapasztalatán alapul;</li>
            <li>tudomással bír arról, hogy Tartalma Automatikus technikai ellenőrzésen keresztül, emberi előzetes jóváhagyás nélkül kerül közzétételre.</li>
          </ul>
          <p>8.2. <strong>Az Értékelés tartalmáért, jogszerűségéért és az abból eredő valamennyi következményért kizárólagosan és teljes körűen az azt közzétevő Felhasználó tartozik felelősséggel.</strong> Amennyiben harmadik személy az Üzemeltetővel szemben egy Felhasználó Értékelése miatt igényt érvényesít, a Felhasználó <strong>köteles az Üzemeltetőt teljes mértékben kártalanítani</strong>, azaz viseli az ezzel összefüggésben felmerülő valamennyi kárt, költséget és jogkövetkezményt.</p>
          <p>8.3. A Hely-alapadatok tekintetében – amennyiben azokat az Üzemeltető maga töltötte fel vagy szerkesztette – az Üzemeltető a jelen ÁSZF 1.2. pontja szerinti korlátozott felelősséget viseli; ez azonban nem terjed ki az adott Helyről közzétett Értékelések tartalmára.</p>
        </Section>

        <Section title="9. Felelősség korlátozása">
          <p>9.1. A Weboldal használata, a Hely-adatbázis és az Értékelések megismerése és az azokra alapított bármely döntés <strong>kizárólag a Weboldalt használó személy saját kockázatára és felelősségére történik.</strong></p>
          <p>9.2. Az Üzemeltető semmilyen kifejezett vagy hallgatólagos szavatosságot nem vállal az Értékelések pontosságára, teljességére, aktualitására, megbízhatóságára vagy adott célra való alkalmasságára vonatkozóan, és kifejezetten kizárja felelősségét minden olyan közvetlen vagy közvetett kárért, amely az Értékelések megismeréséből, felhasználásából vagy az azokra alapított döntésből ered.</p>
          <p>9.3. A jelen pontban foglalt felelősségkorlátozás <strong>nem érinti</strong> az Üzemeltető azon jogszabályi kötelezettségét, hogy a 7. pont szerinti eljárásban a nyilvánvalóan jogsértő Tartalmat eltávolítsa, sem a 4. pont szerinti fogyasztóvédelmi átláthatósági kötelezettségeket.</p>
        </Section>

        <Section title="10. Szellemi tulajdon">
          <p>10.1. A Weboldal szerkezete, dizájnja, grafikai elemei, adatbázis-szerkezete az Üzemeltető, illetve az arra jogosult harmadik személyek szellemi tulajdonát képezik.</p>
          <p>10.2. A Felhasználó a Hely-javaslat és/vagy Értékelés közzétételével az Üzemeltető részére <strong>nem kizárólagos, korlátlan időre és térbeli korlátozás nélkül szóló, díjmentes felhasználási jogot enged</strong> a Tartalom Weboldalon történő megjelenítésére, tárolására és technikai továbbítására.</p>
        </Section>

        <Section title="11. Adatkezelés">
          <p>11.1. A regisztráció, a Hely-javaslat és az Értékelés közzététele során megadott személyes adatok kezelésére a Weboldal külön <a href="/adatkezelesi-tajekoztato" className="text-sni-brand-blue underline hover:text-sni-brand-teal">Adatkezelési Tájékoztatója</a> az irányadó, amely a GDPR és az információs önrendelkezési jogról szóló 2011. évi CXII. törvény rendelkezéseinek megfelelően készült.</p>
          <p>11.2. Az Automatikus technikai ellenőrzés – amennyiben az a GDPR 22. cikke szerinti, kizárólag automatizált döntéshozatalnak minősül – tekintetében a Felhasználót megilleti az emberi beavatkozás kérésének, álláspontja kifejtésének és a döntés megtámadásának joga, amelyet az 5.2. pont szerinti panaszeljárás biztosít.</p>
        </Section>

        <Section title="12. Módosítás joga">
          <p>12.1. Az Üzemeltető fenntartja a jogot a jelen ÁSZF egyoldalú módosítására. A módosított ÁSZF a Weboldalon történő közzétételt követően lép hatályba. A Weboldal módosítást követő további használata a módosított feltételek elfogadását jelenti.</p>
        </Section>

        <Section title="13. Irányadó jog és jogviták rendezése">
          <p>13.1. A jelen ÁSZF-re és a Weboldal használatával kapcsolatos valamennyi jogviszonyra a magyar jog, így különösen a Ptk., az Ekertv., az Fttv. és a DSA rendelkezései az irányadók.</p>
          <p>13.2. A felek a jelen ÁSZF-fel kapcsolatos jogvitáikat elsődlegesen békés úton kísérlik meg rendezni. Ennek eredménytelensége esetén a jogvita elbírálására – hatásköri szabályok szerint – a magyar bíróságok kizárólagos illetékessége irányadó.</p>
        </Section>

        <Section title="14. Záró rendelkezések">
          <p>14.1. Amennyiben a jelen ÁSZF valamely rendelkezése érvénytelennek vagy végrehajthatatlannak bizonyulna, ez nem érinti a többi rendelkezés érvényességét; az érvénytelen rendelkezés helyébe a felek szándékához legközelebb álló, jogszabálynak megfelelő rendelkezés lép.</p>
          <p>14.2. A jelen ÁSZF a Weboldal Felhasználója és az Üzemeltető közötti teljes megállapodást tartalmazza a Weboldal használatával kapcsolatban.</p>
        </Section>

      </div>
    </div>
  );
}
