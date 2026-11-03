/** Code 128 barcodes for the jewellery tags.
 *
 * Same encoding as the shop computer's software (python-barcode), so a tag printed online and one printed in the
 * shop have the same bars.  Only letters, digits and - _ . / are used in product codes and barcodes. */

const PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100",
  "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100",
  "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110",
  "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110",
  "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010",
  "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110",
  "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000",
  "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010",
  "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100",
  "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110",
  "11110101110", "11010000100", "11010010000", "11010011100",
];
const STOP = "1100011101011"; // stop character + final bar
const START = { B: 104, C: 105 } as const;
const TO_B_FROM_C = 100;
const TO_C_FROM_B = 99;
export const QUIET_MODULES = 8;

const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const valueB = (ch: string) => {
  const v = ch.charCodeAt(0) - 32;
  if (v < 0 || v > 95) throw new Error(`"${ch}" cannot be put in a barcode`);
  return v;
};

/** Code values (start, data, no checksum). */
export function encodeValues(code: string): number[] {
  if (!code) throw new Error("Empty barcode");
  let set: "B" | "C" = "C";
  let buffer = "";
  const out: number[] = [START.C];
  let switchFirst = false; // the first value after the start is a switch (not data that happens to be 99/100)
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (set === "C" && !isDigit(ch)) {
      if (out.length === 1) switchFirst = true;
      out.push(TO_B_FROM_C);
      set = "B";
      if (buffer.length === 1) {
        out.push(valueB(buffer));
        buffer = "";
      }
    } else if (set === "B") {
      let digits = 0;
      for (const c of code.slice(i, i + 10)) {
        if (!isDigit(c)) break;
        digits++;
      }
      if (digits > 3) {
        out.push(TO_C_FROM_B);
        set = "C";
      }
    }
    if (set === "B") out.push(valueB(ch));
    else {
      buffer += ch;
      if (buffer.length === 2) {
        out.push(Number(buffer));
        buffer = "";
      }
    }
  }
  if (buffer.length === 1) {
    if (out.length === 1) switchFirst = true;
    out.push(TO_B_FROM_C, valueB(buffer));
  }
  // A switch right after the start becomes a different start.
  if (switchFirst) out.splice(0, 2, START.B);
  return out;
}

/** "1101..." bars and spaces, one character per module, without quiet zones. */
export function barPattern(code: string): string {
  const values = encodeValues(code);
  const checksum = values.reduce((sum, v, i) => sum + (i === 0 ? v : v * i), 0) % 103;
  return [...values, checksum].map((v) => PATTERNS[v]).join("") + STOP;
}

/** A scalable SVG of the barcode; stretch it to any size with CSS. */
export function barcodeSvg(code: string): string {
  const bits = barPattern(code);
  const total = bits.length + 2 * QUIET_MODULES;
  let d = "";
  for (let i = 0; i < bits.length; ) {
    if (bits[i] === "1") {
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      d += `M${i + QUIET_MODULES} 0h${j - i}v1h-${j - i}z`;
      i = j;
    } else i++;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" ` +
    `style="width:100%;height:100%;display:block"><rect width="${total}" height="1" fill="#fff"/><path fill="#000" d="${d}"/></svg>`
  );
}
