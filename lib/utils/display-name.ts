const ADJECTIVES = [
  "Csendes", "Nyugodt", "Bátor", "Kedves", "Okos",
  "Vidám", "Szelíd", "Leleményes", "Gondos", "Barátságos",
  "Figyelmes", "Türelmes", "Alkotó", "Derűs", "Fürge",
  "Ügyes", "Örömteli", "Boldog", "Serény", "Játékos",
];

const ANIMALS = [
  "Róka", "Bagoly", "Szarvas", "Medve", "Nyúl",
  "Farkas", "Sas", "Teknős", "Pingvin", "Mókus",
  "Hattyú", "Galamb", "Tigris", "Delfin", "Borz",
  "Hód", "Páva", "Gólya", "Pillangó", "Bölény",
];

/**
 * Hoz létre egy véletlenszerű, álneves megjelenítési nevet.
 * Példák: "Csendes Róka 4821", "Nyugodt Bagoly 1203"
 */
export function generateDisplayName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj} ${animal} ${num}`;
}
