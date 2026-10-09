/** "1 song", "2 songs". */
export const count = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n === 1 ? word : many}`;
