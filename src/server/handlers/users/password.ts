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

/**
 * 本人が設定するパスワードの最低文字数。
 * 発行する初期パスワードが14文字なので、それを下回る強度に「変更」できてしまわない線として12にする。
 */
export const MIN_PASSWORD_LENGTH = 12;

/** PBKDF2 に渡す前の上限。長さを理由に処理時間が伸びるのを避けるための歯止め。 */
const MAX_PASSWORD_LENGTH = 256;

/** 問題があればその説明を、無ければ null を返す。 */
export function validateNewPassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `新しいパスワードは${MAX_PASSWORD_LENGTH}文字以内にしてください。`;
  }
  if (/\s/.test(value)) {
    return "新しいパスワードに空白は使えません。";
  }
  return null;
}

/**
 * `users.must_change_password` の読み書き。
 *
 * 0006 の migration が未適用のサイトでも管理画面を止めないよう、本体の SELECT / UPDATE とは
 * 分けて実行し、失敗は握り潰す。未適用なら「変更を促さない」という以前の挙動に落ちるだけで、
 * ログインもユーザー作成も通る。
 */
export async function setMustChangePassword(
  db: D1Database,
  userId: string,
  value: boolean
): Promise<void> {
  try {
    await db
      .prepare("UPDATE users SET must_change_password = ? WHERE id = ?")
      .bind(value ? 1 : 0, userId)
      .run();
  } catch (error) {
    console.warn(
      "must_change_password was not updated (migration 0006 may be missing).",
      error instanceof Error ? error.message : error
    );
  }
}

export async function readMustChangePassword(
  db: D1Database,
  userId: string
): Promise<boolean> {
  try {
    const row = await db
      .prepare("SELECT must_change_password FROM users WHERE id = ? LIMIT 1")
      .bind(userId)
      .first<{ must_change_password: number | null }>();
    return Number(row?.must_change_password ?? 0) === 1;
  } catch {
    return false;
  }
}
