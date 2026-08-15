export interface AdminPasswordPanelProps {
    /** 変更するまで閉じられないようにするか（初期パスワード・再発行直後）。 */
    required?: boolean;
    /** 変更が終わったとき。 */
    onDone: () => void;
    /** 閉じたとき。`required` のときは呼ばれない。 */
    onClose?: () => void;
}
export declare function AdminPasswordPanel({ required, onDone, onClose }: AdminPasswordPanelProps): import("react").JSX.Element;
