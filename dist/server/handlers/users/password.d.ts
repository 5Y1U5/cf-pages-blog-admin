/**
 * 初期パスワード・再発行パスワードの生成。
 * 見間違えやすい文字（0/O、1/l/I）を外した英数字から作る。
 */
export declare function generateInitialPassword(length?: number): string;
export declare function isValidEmail(value: string): boolean;
/**
 * 本人が設定するパスワードの最低文字数。
 * 発行する初期パスワードが14文字なので、それを下回る強度に「変更」できてしまわない線として12にする。
 */
export declare const MIN_PASSWORD_LENGTH = 12;
/** 問題があればその説明を、無ければ null を返す。 */
export declare function validateNewPassword(value: string): string | null;
/**
 * `users.must_change_password` の読み書き。
 *
 * 0006 の migration が未適用のサイトでも管理画面を止めないよう、本体の SELECT / UPDATE とは
 * 分けて実行し、失敗は握り潰す。未適用なら「変更を促さない」という以前の挙動に落ちるだけで、
 * ログインもユーザー作成も通る。
 */
export declare function setMustChangePassword(db: D1Database, userId: string, value: boolean): Promise<void>;
export declare function readMustChangePassword(db: D1Database, userId: string): Promise<boolean>;
