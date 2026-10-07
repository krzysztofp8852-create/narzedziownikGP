import type { Page } from "@playwright/test";

/** Wtyczki atrapy: nazwa wtyczki → metoda → wynik, który metoda zwraca (jak obietnica z mostka). */
export type StubPlugins = Record<string, Record<string, unknown>>;

/** Wywołanie metody wtyczki atrapy zapisane do sprawdzenia w teście. */
export interface PluginCall {
  plugin: string;
  method: string;
  options: unknown;
}

/** Stan atrapy w stronie: wywołania metod i słuchacze zdarzeń (`addListener`) według wtyczki i zdarzenia. */
type StubState = { calls: PluginCall[]; listeners: Record<string, ((data: unknown) => void)[]> };

/**
 * Strona myśli, że działa w aplikacji: przed jej wczytaniem wstawia atrapę mostka Capacitora (`window.Capacitor`)
 * w tym kształcie, w jakim wstrzykuje go skorupa na Androidzie. Są w niej tylko podane wtyczki, a każda metoda zwraca
 * ustalony wynik. Wtyczki, której nie podano, „nie ma w zainstalowanej wersji aplikacji”. Wywołania metod sprawdza
 * `pluginCalls`, a zdarzenia wtyczek (np. odczytany kod) wysyła `emitPluginEvent`.
 */
export async function stubAppBridge(page: Page, plugins: StubPlugins = {}) {
  await page.addInitScript((plugins: StubPlugins) => {
    const state: StubState = { calls: [], listeners: {} };
    const Plugins = Object.fromEntries(
      Object.entries(plugins).map(([name, methods]) => [
        name,
        {
          ...Object.fromEntries(
            Object.entries(methods).map(([method, result]) => [
              method,
              async (options?: unknown) => {
                state.calls.push({ plugin: name, method, options: options ?? null });
                return structuredClone(result);
              },
            ]),
          ),
          addListener: async (eventName: string, callback: (data: unknown) => void) => {
            const key = `${name}.${eventName}`;
            (state.listeners[key] ??= []).push(callback);
            return { remove: async () => void (state.listeners[key] = state.listeners[key].filter((other) => other !== callback)) };
          },
        },
      ]),
    );
    Object.assign(window, {
      __appBridgeStub: state,
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

/** Wywołania metod wtyczki atrapy od wczytania strony, po kolei. */
export async function pluginCalls(page: Page, plugin: string): Promise<PluginCall[]> {
  return page.evaluate(
    (plugin) => (window as unknown as { __appBridgeStub: StubState }).__appBridgeStub.calls.filter((call) => call.plugin === plugin),
    plugin,
  );
}

/** Zdarzenie wtyczki atrapy, jak z natywnej strony mostka: trafia do słuchaczy z `addListener`. */
export async function emitPluginEvent(page: Page, plugin: string, eventName: string, data: unknown) {
  await page.evaluate(
    ({ key, data }) => (window as unknown as { __appBridgeStub: StubState }).__appBridgeStub.listeners[key]?.forEach((listener) => listener(data)),
    { key: `${plugin}.${eventName}`, data },
  );
}
