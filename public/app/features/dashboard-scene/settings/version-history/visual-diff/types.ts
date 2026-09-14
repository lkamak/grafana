export type DashboardSchemaKind = 'v1' | 'v2' | 'unknown';

export type GridPos = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PanelLayoutMode = 'grid' | 'flow';

export type ExtractedPanel = {
  matchKey: string;
  id: number;
  elementName?: string;
  title: string;
  vizType: string;
  querySummary: string;
  thresholdsSummary: string;
  gridPos?: GridPos;
  tabId: string;
  tabTitle: string;
  layoutMode: PanelLayoutMode;
  flowOrder?: number;
};

export type TabDescriptor = {
  id: string;
  title: string;
};

export type ExtractPanelsResult = {
  schema: DashboardSchemaKind;
  tabs: TabDescriptor[];
  panels: ExtractedPanel[];
};

export type PanelChangeKind = 'title' | 'query' | 'vizType' | 'thresholds' | 'position' | 'tab';

export type PanelChange = {
  kind: PanelChangeKind;
  before?: string;
  after?: string;
};

export type PanelDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export type PanelDiffEntry = {
  status: PanelDiffStatus;
  moved: boolean;
  tabId: string;
  tabTitle: string;
  panel: ExtractedPanel;
  basePanel?: ExtractedPanel;
  changes: PanelChange[];
  layoutMode: PanelLayoutMode;
  flowOrder?: number;
};

export type VisualDiffResult = {
  canRenderVisual: boolean;
  mixedSchema: boolean;
  tabs: TabDescriptor[];
  entriesByTab: Record<string, PanelDiffEntry[]>;
};
