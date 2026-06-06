// Resolve-only loader: map relative ".js" specifiers to ".ts" when the .js file
// doesn't exist. This lets Node's native TypeScript type-stripping run our source
// (which uses ".js" import specifiers per TS/ESM convention) WITHOUT a transform
// loader like tsx — so native deps such as PGlite (whose WASM bundle is located via
// import.meta.url) load cleanly. There is intentionally no `load` hook here.
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
    try {
      return await next(specifier, context);
    } catch (err) {
      if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
        return next(`${specifier.slice(0, -3)}.ts`, context);
      }
      throw err;
    }
  }
  return next(specifier, context);
}
