import type { Page } from "@playwright/test";

/** Wtyczki atrapy: nazwa wtyczki → metoda → wynik, który metoda zwraca (jak obietnica z mostka). */
export type StubPlugins = Record<string, Record<string, unknown>>;

/**
 * Strona myśli, że działa w aplikacji: przed jej wczytaniem wstawia atrapę mostka Capacitora (`window.Capacitor`)
 * w tym kształcie, w jakim wstrzykuje go skorupa na Androidzie. Są w niej tylko podane wtyczki, a każda metoda zwraca
 * ustalony wynik. Wtyczki, której nie podano, „nie ma w zainstalowanej wersji aplikacji”.
 */
export async function stubAppBridge(page: Page, plugins: StubPlugins = {}) {
  await page.addInitScript((plugins: StubPlugins) => {
    const Plugins = Object.fromEntries(
      Object.entries(plugins).map(([name, methods]) => [
        name,
        {
          ...Object.fromEntries(Object.entries(methods).map(([method, result]) => [method, async () => structuredClone(result)])),
          addListener: async () => ({ remove: async () => {} }),
        },
      ]),
    );
    Object.assign(window, {
      Capacitor: {
        getPlatform: () => "android",
        isNativePlatform: () => true,
        isPluginAvailable: (name: string) => Object.prototype.hasOwnProperty.call(Plugins, name),
        Plugins,
        // Spis wtyczek jak ze skorupy: po nim pyta o wtyczki `@capacitor/core` (`registerPlugin`, `isPluginAvailable`).
        PluginHeaders: Object.entries(plugins).map(([name, methods]) => ({
          name,
          methods: Object.keys(methods).map((method) => ({ name: method, rtype: "promise" })),
        })),
      },
    });
  }, plugins);
}
