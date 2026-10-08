// Native fetch talks to YouTube directly.
export const appFetch: typeof fetch = (input, init) => fetch(input, init);
