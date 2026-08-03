const facade = new URL('./pg-test-facade.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'pg') return { url: facade, shortCircuit: true };
  return nextResolve(specifier, context);
}
