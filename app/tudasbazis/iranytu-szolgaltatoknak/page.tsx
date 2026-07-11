import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/tudasbazis"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sni-brand-blue hover:text-sni-brand-teal"
      >
        <ArrowLeft size={14} /> Vissza a Tudásbázishoz
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">
        Iránytű szolgáltatóknak, avagy így válhatsz SNI-baráttá
      </h1>

      <div className="mt-6 overflow-hidden rounded-2xl">
        <img
          src="/iranytu-illusztracio.png"
          alt="Autizmusbarát hely illusztráció"
          className="w-full object-cover"
        />
      </div>

      <div className="mt-6 space-y-4 text-gray-700 leading-relaxed">
        <p>
          Nagy örömünkre egyre több vendéglátóhely, kávézó, cukrászda, játszóház ismeri fel az igényt, és válik autizmus- és SNI-barát hellyé. Ők már tudják, hogy a valódi befogadás nem feltétlenül jár óriási anyagi befektetéssel, inkább a környezetben, a kommunikációban, a munkatársak hozzáállásában és a működés rugalmasságában jelenik meg. Ebben szeretnénk pár tippel segítséget nyújtani az inkluzív szemléletű helyeknek.
        </p>
        <p>
          Egy családi program, egy bevásárlás vagy akár egy rövid kávézás sokak számára egyszerű hétköznapi esemény. Egy autista, ADHD-val élő vagy más sajátos szükségletű gyermeknek, fiatalnak, felnőttnek és családjának azonban gyakran járhat szorongással. A célunk, hogy megkönnyítsük ezeket a helyzeteket, mert a kikapcsolódás és a kellemes bánásmód mindenkinek jár!
        </p>
        <p>
          A VédettSarok célja éppen az, hogy az érintettek és családjaik előzetesen tájékozódhassanak egy hely nyugalmáról, kiszámíthatóságáról, szenzoros jellemzőiről és elfogadó szemléletéről. Fontos azonban, hogy nincs olyan környezet, amely minden autista vagy ADHD-val élő ember számára egyformán megfelelő lenne, de ha ismerjük egy hely adottságait, könnyebben kiválaszthatjuk a számunkra megfelelőt.
        </p>
      </div>

      <h2 className="mt-8 text-xl font-extrabold text-gray-900">Mit jelent az, hogy SNI-barát?</h2>
      <p className="mt-3 text-gray-700 leading-relaxed">
        Olyan helyekre gondolunk, amelyek figyelembe veszik a hozzájuk érkező vendégek egyéni szenzoros, érzékszervi, mozgásszervi, idegrendszeri és kommunikációs szükségleteit.
      </p>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">1. Kiszámítható</h3>
        <p className="mt-2 text-gray-700 leading-relaxed">
          Autizmussal élő személyeknél fontos a kiszámíthatóság és a bejósolhatóság, így szívesebben mennek olyan helyszínekre, amelyekről előre pontosan tudnak tájékozódni.
        </p>
        <p className="mt-2 text-gray-700 leading-relaxed">Nagy segítséget jelenthet, ha a hely honlapján vagy közösségi oldalán előre elérhető:</p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>néhány valós fénykép a helyről;</li>
          <li>információ a parkolásról;</li>
          <li>az aktuális étlap, árlista és házirend;</li>
          <li>a mosdó és a kijárat helye;</li>
          <li>a kevésbé forgalmas időszakok feltüntetése;</li>
          <li>annak jelzése, hogy van-e csendesebb asztal vagy elvonulási lehetőség.</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Egy rövid bemutatkozó videó jelentősen csökkentheti az ismeretlen helyzetből fakadó bizonytalanságot.
        </p>
        <p className="mt-2 text-gray-700 leading-relaxed">
          A lényeg az őszinteség. Például egy ilyen mondat segíthet a bizonytalanság leküzdésében: <em>„Hétköznap 10 és 12 óra között általában kevesebb vendégünk van. Hétvégén a tér zsúfoltabb és hangosabb lehet.&rdquo;</em>
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">2. Figyelembe veszi a szenzoros szükségleteket</h3>
        <p className="mt-2 text-gray-700 leading-relaxed">
          Az idegrendszerünk folyamatosan dolgozza fel a környezetből érkező ingereket. Az autizmussal és/vagy ADHD-val élő emberek bizonyos hangokat, fényeket, szagokat az átlagosnál intenzívebben érzékelhetnek. Egy vendéglátóhelyen rengeteg ilyen inger ér minket. Képzeljük csak el: ha becsukjuk a szemünket, milyen intenzíven halljuk a turmixgép hangját, az összecsörrenő tányérokat, a székek huzogatását.
        </p>
        <p className="mt-2 text-gray-700 leading-relaxed">
          Egy üzletben a hangosbemondó, a csipogó pénztárak és a vibráló reklámfelületek jelenthetnek nehézséget. Játszóházban a gyermekzsivaj és a kiszámíthatatlan mozgás lehet megterhelő.
        </p>
        <p className="mt-2 text-gray-700 leading-relaxed">Néhány egyszerű változtatás is sokat jelenthet:</p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>a háttérzene halkítása;</li>
          <li>kevésbé erős világítás;</li>
          <li>zajvédő fülvédő használatának elfogadása;</li>
          <li>kevésbé zsúfolt, úgynevezett csendes időszakok meghirdetése;</li>
          <li>előzetes figyelmeztetés egy várható hangos eseményre.</li>
        </ul>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">3. Van lehetőség elvonulni</h3>
        <p className="mt-2 text-gray-700 leading-relaxed">
          A védett sarok nagyon sokat segíthet. Egy paravánnal részben leválasztott terület vagy egy külön helyiség óriási könnyebbség lehet mind az autizmussal élőknek, mind a családjaiknak. Fontos, hogy ez a terület:
        </p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>kérésre könnyen hozzáférhető legyen;</li>
          <li>a személyzet tudjon róla, és megfelelően ajánlja fel.</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Ez ugyanis arra ad lehetőséget, hogy az érintett személy szabályozza az idegrendszeri terhelését, majd saját döntése szerint visszatérhessen a közös térbe, megelőzve a túlterhelődésből fakadó kellemetlenségeket, konfliktusokat.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">4. Érthetően és türelmesen kommunikál</h3>
        <p className="mt-2 text-gray-700 leading-relaxed">
          Az autizmus- és SNI-barát kommunikáció világos, tiszteletteljes és egyértelmű. A személyzet sokat segíthet azzal, ha:
        </p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>egyszerre egy kérdést tesz fel;</li>
          <li>rövid, egyértelmű mondatokat használ;</li>
          <li>konkrét választási lehetőségeket kínál;</li>
          <li>elfogadja a mutatást, írást, képhasználatot vagy kommunikációs eszközt;</li>
          <li>nem vár el szemkontaktust.</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Egy autista embernek több időre lehet szüksége a hallott információ értelmezéséhez és a válasz megfogalmazásához. Elfogadjuk, hogy bizonyos kommunikációs módok (pl. szóbeli rendelés helyett az étlapon való megmutatás) nem udvariasságból fakadnak, hanem a vendég kommunikációs igényeiből.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">5. Néhány helyzetet rugalmasan kezel</h3>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>előzetes asztalfoglalás egy csendesebb helyre;</li>
          <li>sorban állás helyett sorszám vagy későbbi visszahívás;</li>
          <li>kisebb adag vagy külön tálalt összetevők;</li>
          <li>annak elfogadása, ha egy gyermeknek járkálnia vagy ringatóznia kell;</li>
          <li>előre jelzi a foglalkozás vagy a játékidő végét.</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Elfogadja, hogy a mozgás, a kézrázás, a ringatózás, bizonyos hangok ismétlése vagy más viselkedés nem neveletlenség, hanem önszabályozási mód. Amennyiben nem veszélyeztet másokat, nem szükséges leállítani.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">6. A munkatársak informáltak</h3>
        <p className="mt-2 text-gray-700 leading-relaxed">Tudják, hogy</p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>az autizmus nem mindig látható;</li>
          <li>ugyanaz a támogatás nem megfelelő mindenkinek;</li>
          <li>az érintettet nem szabad váratlanul megérinteni;</li>
          <li>érdemes csökkenteni a körülötte álló emberek számát;</li>
          <li>a szülő, a kísérő vagy maga az érintett rendszerint tudja, mi segít.</li>
        </ul>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-sni-brand-navy">7. Információsan is akadálymentes</h3>
        <p className="mt-2 text-gray-700 leading-relaxed">Az autizmus- és SNI-barát hely hangsúlyt fektet:</p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>a jól olvasható feliratokra;</li>
          <li>az egyszerű piktogramokra;</li>
          <li>az átlátható, nem túlzsúfolt étlapokra;</li>
          <li>a mosdó, kijárat és információs pont egyértelmű jelzésére.</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Az egyszerű nyelvezet, a képek, a következetesen használt jelzések és a könnyen áttekinthető tér nemcsak autista embereknek segíthet.
        </p>
      </div>

      <div className="mt-10 rounded-2xl bg-sni-brand-teal/10 border border-sni-brand-teal/20 p-6">
        <h2 className="text-lg font-extrabold text-gray-900">
          Nem tökéletes helyekre, hanem biztonságosabb helyekre van szükség
        </h2>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Egy autizmus- vagy SNI-barát helynek nem kell teljesen másnak lennie. Nincs szükség hatalmas beruházásra. Megismerésre, elfogadásra és biztonságra van szükség.
        </p>
        <p className="mt-3 text-gray-700 leading-relaxed">A legfontosabb, hogy:</p>
        <ul className="mt-2 space-y-1 pl-5 list-disc text-gray-700">
          <li>valós információt adjon;</li>
          <li>ne ígérjen olyasmit, amit nem tud biztosítani;</li>
          <li>meghallgassa az egyéni szükségleteket;</li>
          <li>ne ítélkezzen a szokatlannak tűnő viselkedés felett;</li>
          <li>emberként forduljon a vendéghez.</li>
        </ul>
        <p className="mt-3 font-semibold text-sni-brand-navy">
          Ezektől válik egy hely valóban védett sarokká.
        </p>
      </div>

      <p className="mt-8 text-sm text-gray-500 italic border-t border-gray-100 pt-6">
        Szerző: Valu Rebeka – autizmus spektrum pedagógiája szakirányos gyógypedagógus és pszichopedagógus
      </p>
    </div>
  );
}
