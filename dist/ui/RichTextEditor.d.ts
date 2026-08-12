export interface RichTextEditorHandle {
    insertImage: (src: string, alt: string) => void;
}
export interface RichTextEditorProps {
    markdown: string;
    onChange: (markdown: string) => void;
    /** ツールバーの画像ボタンから、親が持つファイル選択を開く */
    onRequestImage: () => void;
    /**
     * false にすると本文を編集できなくし、ツールバーも出さない（閲覧専用ユーザー向け）。
     * 既定は true。
     */
    editable?: boolean;
}
export declare const RichTextEditor: import("react").ForwardRefExoticComponent<RichTextEditorProps & import("react").RefAttributes<RichTextEditorHandle>>;
