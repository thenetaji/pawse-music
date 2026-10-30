// SHA-512 on pairs of 32-bit halves: Hermes has no WebCrypto and BigInt is slow, and Return YouTube
// Dislike's proof of work hashes a single block tens of thousands of times.
const K = Int32Array.of(
  0x428a2f98,
  0xd728ae22,
  0x71374491,
  0x23ef65cd,
  0xb5c0fbcf,
  0xec4d3b2f,
  0xe9b5dba5,
  0x8189dbbc,
  0x3956c25b,
  0xf348b538,
  0x59f111f1,
  0xb605d019,
  0x923f82a4,
  0xaf194f9b,
  0xab1c5ed5,
  0xda6d8118,
  0xd807aa98,
  0xa3030242,
  0x12835b01,
  0x45706fbe,
  0x243185be,
  0x4ee4b28c,
  0x550c7dc3,
  0xd5ffb4e2,
  0x72be5d74,
  0xf27b896f,
  0x80deb1fe,
  0x3b1696b1,
  0x9bdc06a7,
  0x25c71235,
  0xc19bf174,
  0xcf692694,
  0xe49b69c1,
  0x9ef14ad2,
  0xefbe4786,
  0x384f25e3,
  0x0fc19dc6,
  0x8b8cd5b5,
  0x240ca1cc,
  0x77ac9c65,
  0x2de92c6f,
  0x592b0275,
  0x4a7484aa,
  0x6ea6e483,
  0x5cb0a9dc,
  0xbd41fbd4,
  0x76f988da,
  0x831153b5,
  0x983e5152,
  0xee66dfab,
  0xa831c66d,
  0x2db43210,
  0xb00327c8,
  0x98fb213f,
  0xbf597fc7,
  0xbeef0ee4,
  0xc6e00bf3,
  0x3da88fc2,
  0xd5a79147,
  0x930aa725,
  0x06ca6351,
  0xe003826f,
  0x14292967,
  0x0a0e6e70,
  0x27b70a85,
  0x46d22ffc,
  0x2e1b2138,
  0x5c26c926,
  0x4d2c6dfc,
  0x5ac42aed,
  0x53380d13,
  0x9d95b3df,
  0x650a7354,
  0x8baf63de,
  0x766a0abb,
  0x3c77b2a8,
  0x81c2c92e,
  0x47edaee6,
  0x92722c85,
  0x1482353b,
  0xa2bfe8a1,
  0x4cf10364,
  0xa81a664b,
  0xbc423001,
  0xc24b8b70,
  0xd0f89791,
  0xc76c51a3,
  0x0654be30,
  0xd192e819,
  0xd6ef5218,
  0xd6990624,
  0x5565a910,
  0xf40e3585,
  0x5771202a,
  0x106aa070,
  0x32bbd1b8,
  0x19a4c116,
  0xb8d2d0c8,
  0x1e376c08,
  0x5141ab53,
  0x2748774c,
  0xdf8eeb99,
  0x34b0bcb5,
  0xe19b48a8,
  0x391c0cb3,
  0xc5c95a63,
  0x4ed8aa4a,
  0xe3418acb,
  0x5b9cca4f,
  0x7763e373,
  0x682e6ff3,
  0xd6b2b8a3,
  0x748f82ee,
  0x5defb2fc,
  0x78a5636f,
  0x43172f60,
  0x84c87814,
  0xa1f0ab72,
  0x8cc70208,
  0x1a6439ec,
  0x90befffa,
  0x23631e28,
  0xa4506ceb,
  0xde82bde9,
  0xbef9a3f7,
  0xb2c67915,
  0xc67178f2,
  0xe372532b,
  0xca273ece,
  0xea26619c,
  0xd186b8c7,
  0x21c0c207,
  0xeada7dd6,
  0xcde0eb1e,
  0xf57d4f7f,
  0xee6ed178,
  0x06f067aa,
  0x72176fba,
  0x0a637dc5,
  0xa2c898a6,
  0x113f9804,
  0xbef90dae,
  0x1b710b35,
  0x131c471b,
  0x28db77f5,
  0x23047d84,
  0x32caab7b,
  0x40c72493,
  0x3c9ebe0a,
  0x15c9bebc,
  0x431d67c4,
  0x9c100d4c,
  0x4cc5d4be,
  0xcb3e42b6,
  0x597f299c,
  0xfc657e2a,
  0x5fcb6fab,
  0x3ad6faec,
  0x6c44198c,
  0x4a475817,
);
const IV = Int32Array.of(
  0x6a09e667,
  0xf3bcc908,
  0xbb67ae85,
  0x84caa73b,
  0x3c6ef372,
  0xfe94f82b,
  0xa54ff53a,
  0x5f1d36f1,
  0x510e527f,
  0xade682d1,
  0x9b05688c,
  0x2b3e6c1f,
  0x1f83d9ab,
  0xfb41bd6b,
  0x5be0cd19,
  0x137e2179,
);

const W = new Int32Array(160);

export function compress(h: Int32Array, m: Int32Array): void {
  for (let i = 0; i < 32; i++) W[i] = m[i];
  for (let i = 16; i < 80; i++) {
    const x15h = W[(i - 15) * 2];
    const x15l = W[(i - 15) * 2 + 1];
    const x2h = W[(i - 2) * 2];
    const x2l = W[(i - 2) * 2 + 1];
    const s0h =
      ((x15h >>> 1) | (x15l << 31)) ^
      ((x15h >>> 8) | (x15l << 24)) ^
      (x15h >>> 7);
    const s0l =
      ((x15l >>> 1) | (x15h << 31)) ^
      ((x15l >>> 8) | (x15h << 24)) ^
      ((x15l >>> 7) | (x15h << 25));
    const s1h =
      ((x2h >>> 19) | (x2l << 13)) ^ ((x2l >>> 29) | (x2h << 3)) ^ (x2h >>> 6);
    const s1l =
      ((x2l >>> 19) | (x2h << 13)) ^
      ((x2h >>> 29) | (x2l << 3)) ^
      ((x2l >>> 6) | (x2h << 26));
    const lo =
      (W[(i - 16) * 2 + 1] >>> 0) +
      (s0l >>> 0) +
      (W[(i - 7) * 2 + 1] >>> 0) +
      (s1l >>> 0);
    W[i * 2] =
      (W[(i - 16) * 2] + s0h + W[(i - 7) * 2] + s1h + ((lo / 4294967296) | 0)) |
      0;
    W[i * 2 + 1] = lo | 0;
  }
  let ah = h[0];
  let al = h[1];
  let bh = h[2];
  let bl = h[3];
  let ch = h[4];
  let cl = h[5];
  let dh = h[6];
  let dl = h[7];
  let eh = h[8];
  let el = h[9];
  let fh = h[10];
  let fl = h[11];
  let gh = h[12];
  let gl = h[13];
  let hh = h[14];
  let hl = h[15];
  for (let i = 0; i < 80; i++) {
    const S1h =
      ((eh >>> 14) | (el << 18)) ^
      ((eh >>> 18) | (el << 14)) ^
      ((el >>> 9) | (eh << 23));
    const S1l =
      ((el >>> 14) | (eh << 18)) ^
      ((el >>> 18) | (eh << 14)) ^
      ((eh >>> 9) | (el << 23));
    const chh = (eh & fh) ^ (~eh & gh);
    const chl = (el & fl) ^ (~el & gl);
    const t1lo =
      (hl >>> 0) +
      (S1l >>> 0) +
      (chl >>> 0) +
      (K[i * 2 + 1] >>> 0) +
      (W[i * 2 + 1] >>> 0);
    const t1h =
      (hh + S1h + chh + K[i * 2] + W[i * 2] + ((t1lo / 4294967296) | 0)) | 0;
    const t1l = t1lo | 0;
    const S0h =
      ((ah >>> 28) | (al << 4)) ^
      ((al >>> 2) | (ah << 30)) ^
      ((al >>> 7) | (ah << 25));
    const S0l =
      ((al >>> 28) | (ah << 4)) ^
      ((ah >>> 2) | (al << 30)) ^
      ((ah >>> 7) | (al << 25));
    const mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
    const mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
    const t2lo = (S0l >>> 0) + (mjl >>> 0);
    const t2h = (S0h + mjh + ((t2lo / 4294967296) | 0)) | 0;
    const t2l = t2lo | 0;
    hh = gh;
    hl = gl;
    gh = fh;
    gl = fl;
    fh = eh;
    fl = el;
    const elo = (dl >>> 0) + (t1l >>> 0);
    eh = (dh + t1h + ((elo / 4294967296) | 0)) | 0;
    el = elo | 0;
    dh = ch;
    dl = cl;
    ch = bh;
    cl = bl;
    bh = ah;
    bl = al;
    const alo = (t1l >>> 0) + (t2l >>> 0);
    ah = (t1h + t2h + ((alo / 4294967296) | 0)) | 0;
    al = alo | 0;
  }
  const v = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
  for (let i = 0; i < 16; i += 2) {
    const lo = (h[i + 1] >>> 0) + (v[i + 1] >>> 0);
    h[i] = (h[i] + v[i] + ((lo / 4294967296) | 0)) | 0;
    h[i + 1] = lo | 0;
  }
}

export const sha512Init = (into = new Int32Array(16)): Int32Array => {
  into.set(IV);
  return into;
};

export function sha512(data: Uint8Array): Uint8Array {
  const total = (((data.length + 16) >> 7) + 1) << 7;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((data.length * 8) / 4294967296));
  view.setUint32(total - 4, (data.length * 8) >>> 0);
  const h = sha512Init();
  const m = new Int32Array(32);
  for (let off = 0; off < total; off += 128) {
    for (let i = 0; i < 32; i++) m[i] = view.getInt32(off + i * 4);
    compress(h, m);
  }
  const out = new Uint8Array(64);
  const o = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) o.setInt32(i * 4, h[i]);
  return out;
}

export function leadingZeroBits(h: Int32Array): number {
  let n = 0;
  for (let i = 0; i < 16; i++) {
    const z = Math.clz32(h[i]);
    n += z;
    if (z < 32) break;
  }
  return n;
}
