/** Trusted, locally vendored Tabler SVG only. Never render XML/user input as HTML. */
export declare const diagramIcons: {
    user: string;
    service: string;
    start: string;
    end: string;
    branch: string;
    plus: string;
    close: string;
    search: string;
    undo: string;
    redo: string;
    upload: string;
    download: string;
    code: string;
    fit: string;
    zoomIn: string;
    zoomOut: string;
    hand: string;
    pointer: string;
    trash: string;
    link: string;
    copy: string;
    check: string;
    grip: string;
    settings: string;
    info: string;
    replace: string;
    library: string;
    properties: string;
    template: string;
    layout: string;
};
export type DiagramIconName = keyof typeof diagramIcons;
export declare const nodePresentation: Record<string, {
    label: string;
    icon: DiagramIconName;
    tone: string;
}>;
export declare function presentNode(type?: string): {
    label: string;
    icon: DiagramIconName;
    tone: string;
};
export declare const libraryGroups: {
    name: string;
    types: string[];
}[];
