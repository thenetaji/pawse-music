import { sha1Hex } from "../util/sha1";
import { parseCookies } from "../util/http";

/** Authorization value the web app sends: SAPISIDHASH plus the 1P/3P variants when those cookies exist. */
export function sapisidAuthorization(
  cookie: string,
  origin: string,
  nowSec = Math.floor(Date.now() / 1000),
): string | undefined {
  const c = parseCookies(cookie);
  const sapisid = c.SAPISID ?? c["__Secure-3PAPISID"] ?? c["__Secure-1PAPISID"];
  if (!sapisid) return undefined;
  const hash = (v: string) =>
    `${nowSec}_${sha1Hex(`${nowSec} ${v} ${origin}`)}`;
  const parts = [`SAPISIDHASH ${hash(sapisid)}`];
  if (c["__Secure-1PAPISID"])
    parts.push(`SAPISID1PHASH ${hash(c["__Secure-1PAPISID"])}`);
  if (c["__Secure-3PAPISID"])
    parts.push(`SAPISID3PHASH ${hash(c["__Secure-3PAPISID"])}`);
  return parts.join(" ");
}
