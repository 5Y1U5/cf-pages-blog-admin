import type { BlogAdminEnv } from "../../../config/env.js";
/**
 * R2 のオブジェクトを配信する。設定に依存しない唯一のハンドラなので、
 * 導入側は再 export するだけでよい。
 */
export declare const onRequestGet: PagesFunction<BlogAdminEnv>;
