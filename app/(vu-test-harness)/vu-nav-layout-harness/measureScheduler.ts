// iOS-SZIMULÁTOROS TESZTOLDAL — mérésütemező (2026-10-16).
//
// Versenyhelyzet, amit ez megszüntet (ios-navigation-layout-4 artifact,
// mind a négy álló készüléken): a WKWebView induláskori átméretezése
// ("resize") a kezdeti mérés ELŐTT indított egy `after-resize-portrait`
// mérést, amely a még be nem töltött térkép miatt `mapControls: []`
// riportot küldött (iPhone 17 Pro: 12:50:57 resize-mérés, 12:51:01
// initial). Szabályok:
//   1. resize CSAK a kezdeti mérés befejezése UTÁN indíthat mérést;
//   2. a mérések SOROSAN futnak (egyszerre legfeljebb egy);
//   3. egy sorra kerülő resize-mérés csak akkor fut, ha a tájolás még
//      mindig eltér az utoljára mértől (nincs felesleges duplikátum);
//   4. ha a kezdeti mérés KÖZBEN változott a tájolás, utána pótoljuk.
// Tiszta modul (nincs DOM-függés), hogy node --test-tel ellenőrizhető legyen.

export type Orientation = "portrait" | "landscape";

export interface MeasureSchedulerDeps {
  currentOrientation: () => Orientation;
  /** Egy teljes mérés (+ riport küldése); a mért tájolással tér vissza. */
  measure: (phase: string, withRestFlow: boolean) => Promise<Orientation>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  resizeDebounceMs: number;
}

export interface MeasureScheduler {
  /** A kezdeti mérés; a resize-mérések csak ennek sikeres lefutása után engedélyezettek. */
  runInitial: () => Promise<void>;
  onResize: () => void;
  /** Teszteléshez: az összes sorban álló mérés befejeződése. */
  idle: () => Promise<void>;
}

export function createMeasureScheduler(deps: MeasureSchedulerDeps): MeasureScheduler {
  let initialDone = false;
  let lastOrientation: Orientation | null = null;
  let queue: Promise<void> = Promise.resolve();
  let timer: unknown;

  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch(() => {
      // egy sikertelen mérés nem akaszthatja meg a sort; a riport hiánya a CI-ben hiba
    });
    return queue;
  };

  const enqueueResizeCheck = () =>
    enqueue(async () => {
      const orientation = deps.currentOrientation();
      if (orientation === lastOrientation) return;
      lastOrientation = await deps.measure(`after-resize-${orientation}`, false);
    });

  return {
    runInitial: () => {
      let completed = false;
      return enqueue(async () => {
        lastOrientation = await deps.measure("initial", true);
        completed = true;
      }).then(() => {
        if (!completed) return;
        initialDone = true;
        if (deps.currentOrientation() !== lastOrientation) void enqueueResizeCheck();
      });
    },
    onResize: () => {
      if (!initialDone) return;
      deps.clearTimer(timer);
      timer = deps.setTimer(() => void enqueueResizeCheck(), deps.resizeDebounceMs);
    },
    idle: () => queue,
  };
}
