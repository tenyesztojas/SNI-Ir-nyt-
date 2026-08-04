export const metadata = {
  title: "Értékelési rendszer átláthatósága – VédettSarok",
};

export default function ErtekelesiRendszerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-sni-text">Az értékelési rendszer működése</h1>
      <p className="mt-2 text-sm text-gray-500">
        Az ÁSZF 4. és 6. pontja, valamint az (EU) 2022/2065 digitális szolgáltatásokról szóló rendelet (DSA) 14. cikke alapján.
      </p>

      <div className="mt-8 space-y-8 text-gray-700">

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-sni-text">1. Hogyan kerülnek közzétételre az értékelések?</h2>
          <p>
            A VédettSarok weboldalon közzétett valamennyi értékelés és hely-javaslat
            <strong> kizárólag automatikus, technikai jellegű ellenőrzésen</strong> esik át,
            emberi szerkesztői jóváhagyás nélkül.
          </p>
          <p>
            Az automatikus ellenőrzés kizárólag az alábbi formai és technikai szempontokat vizsgálja:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Kötelező mezők megléte és megfelelő hossza</li>
            <li>Jogszabályba ütköző kifejezések szűrése (gyűlöletbeszéd, spam)</li>
            <li>Duplikáció-szűrés</li>
            <li>Gyanús mintázatok automatikus jelzése (pl. tömeges beküldés)</li>
          </ul>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <strong>Fontos:</strong> Az automatikus ellenőrzés <strong>soha nem vizsgálja</strong> az értékelés
            pozitív vagy negatív hangvételét. Minden közzétett értékelés azonos technikai elbánásban részesül,
            függetlenül attól, hogy a helynek kedvező vagy kedvezőtlen-e.
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-sni-text">2. Mit garantál az üzemeltető – és mit nem?</h2>
          <p>Az üzemeltető biztosítja, hogy:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Minden értékelés regisztrált felhasználótól származik</li>
            <li>Az értékelés az automatikus technikai ellenőrzésen átesett</li>
            <li>Az értékelők személyes adatai (e-mail, telefonszám stb.) nem kerülnek nyilvánosságra</li>
          </ul>
          <p>Az üzemeltető <strong>nem garantálja</strong>, hogy:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Az értékelő valóban felkereste az adott helyet</li>
            <li>Az értékelés tartalma pontosan tükrözi a valóságot</li>
          </ul>
          <p className="text-sm">
            Minden közzétett értékelés kizárólag az azt beküldő felhasználó saját, szubjektív tapasztalatát
            fejezi ki, és nem az oldal üzemeltetőjének véleménye.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-sni-text">3. Tilos hamis értékelést beküldeni</h2>
          <p>
            Szigorúan tilos és az ÁSZF azonnali megszegését jelenti:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Hamis, kitalált vagy valótlan tapasztalaton alapuló értékelés beküldése</li>
            <li>Megvásárolt, bérelt vagy harmadik fél megbízásából készített értékelés</li>
            <li>Saját maga által javasolt hely mesterséges felértékelése</li>
            <li>Egyszerre több fiókból beküldött értékelés</li>
          </ul>
          <p className="text-sm">
            Az ilyen tartalmak eltávolításra kerülnek, és az érintett fiók hozzáférése megszüntethető.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-sni-text">4. Hogyan kérhetem jogsértő tartalom eltávolítását?</h2>
          <p>
            Ha úgy véled, hogy egy értékelés valótlan tényt állít, rágalmazó, becsületsértő vagy egyéb
            jogszabályba ütköző tartalmat jelez, <strong>Bejelentés</strong> gombon keresztül jelezd az üzemeltetőnek.
            A bejelentések az ÁSZF 7. pontja szerinti eljárásban kerülnek kivizsgálásra.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-sni-text">5. Hogyan befolyásolják az értékelések a helyek sorrendjét?</h2>
          <p>
            A VédettSarok jelenlegi verziójában a helyek listáján az értékelések átlagos csillagszáma
            és darabszáma informatív jelleggel jelenik meg, de <strong>a helyek sorrendje elsősorban
            nem az értékelések alapján, hanem névsorban, illetve a felhasználó keresési feltételei alapján</strong> alakul.
            Amennyiben ez a jövőben változik, azt ezen az oldalon közzétesszük.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-sni-text">6. Mi az az automatizált döntés elleni panasz?</h2>
          <p>
            Ha az automatikus technikai ellenőrzés elutasítja az értékelésedet vagy hely-javaslatadat,
            jogod van panaszt beküldeni — a DSA 17. cikke alapján. A panasz elbírálása emberi
            közreműködéssel történik, és kizárólag azt vizsgálja, hogy az automatikus szűrés
            technikailag helyesen döntött-e (pl. téves kulcsszó-egyezés). A tartalom érdemi,
            véleménybeli helyességét a panasz-eljárás <em>nem</em> vizsgálja.
          </p>
        </section>

      </div>
    </div>
  );
}
