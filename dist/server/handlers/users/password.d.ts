/**
 * 初期パスワード・再発行パスワードの生成。
 * 見間違えやすい文字（0/O、1/l/I）を外した英数字から作る。
 */
export declare function generateInitialPassword(length?: number): string;
export declare function isValidEmail(value: string): boolean;
