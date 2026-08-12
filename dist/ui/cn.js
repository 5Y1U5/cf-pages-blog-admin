import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
/**
 * クラス名の結合。
 * 導入先アプリのユーティリティに依存しないよう、パッケージ内に持つ。
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
