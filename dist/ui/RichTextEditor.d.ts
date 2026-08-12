export interface RichTextEditorHandle {
    insertImage: (src: string, alt: string) => void;
}
export interface RichTextEditorProps {
    markdown: string;
    onChange: (markdown: string) => void;
    /** ツールバーの画像ボタンから、親が持つファイル選択を開く */
    onRequestImage: () => void;
}
export declare const RichTextEditor: import("react").ForwardRefExoticComponent<RichTextEditorProps & import("react").RefAttributes<RichTextEditorHandle>>;
