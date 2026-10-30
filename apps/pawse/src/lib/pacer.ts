export function pacer(gapMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  return <T>(run: () => Promise<T>): Promise<T> => {
    const turn = chain.then(async () => {
      const wait = lastAt + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastAt = Date.now();
      return run();
    });
    chain = turn.catch(() => undefined);
    return turn;
  };
}
