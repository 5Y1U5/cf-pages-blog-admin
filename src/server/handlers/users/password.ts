/**
 * 初期パスワード・再発行パスワードの生成。
 * 見間違えやすい文字（0/O、1/l/I）を外した英数字から作る。
 */

const PASSWORD_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

// 256 を文字数で割り切れる最大値。これ以上のバイトは捨てることで、
// `byte % 文字数` にありがちな剰余バイアス（先頭の文字が出やすくなる）を無くす。
const REJECT_THRESHOLD = 256 - (256 % PASSWORD_CHARS.length);

export function generateInitialPassword(length = PASSWORD_LENGTH): string {
  const out: string[] = [];
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const byte of bytes) {
      if (byte >= REJECT_THRESHOLD) continue;
      out.push(PASSWORD_CHARS[byte % PASSWORD_CHARS.length]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
