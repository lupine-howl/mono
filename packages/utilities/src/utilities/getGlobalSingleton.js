export function getGlobalSingleton(key, factory) {
  const g = globalThis;
  // If you want it non-writable/non-configurable:
  if (!Object.getOwnPropertySymbols(g).includes(key)) {
    Object.defineProperty(g, key, {
      value: factory(),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return g[key];
}
