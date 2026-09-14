/* eslint-disable @typescript-eslint/consistent-type-assertions -- dashboard JSON specs are untyped at runtime */

import {
  type DashboardSchemaKind,
  type ExtractedPanel,
  type ExtractPanelsResult,
  type GridPos,
  type PanelLayoutMode,
  type TabDescriptor,
} from './types';

type UnknownRecord = Record<string, unknown>;

const DEFAULT_TAB: TabDescriptor = { id: 'default', title: 'Dashboard' };

export function detectDashboardSchema(data: object): DashboardSchemaKind {
  const record = data as UnknownRecord;
  if (record.elements !== undefined && record.layout !== undefined) {
    return 'v2';
  }
  if (Array.isArray(record.panels)) {
    return 'v1';
  }
  return 'unknown';
}

export function extractPanelsFromSpec(data: object): ExtractPanelsResult {
  const schema = detectDashboardSchema(data);
  if (schema === 'v2') {
    return extractV2Panels(data as UnknownRecord);
  }
  if (schema === 'v1') {
    return extractV1Panels(data as UnknownRecord);
  }
  return { schema, tabs: [DEFAULT_TAB], panels: [] };
}

function extractV1Panels(dashboard: UnknownRecord): ExtractPanelsResult {
  const panels: ExtractedPanel[] = [];
  const panelsArray = dashboard.panels;
  if (!Array.isArray(panelsArray)) {
    return { schema: 'v1', tabs: [DEFAULT_TAB], panels: [] };
  }

  walkV1PanelList(panelsArray, DEFAULT_TAB.id, DEFAULT_TAB.title, 0, panels, 0);

  return { schema: 'v1', tabs: [DEFAULT_TAB], panels };
}

function walkV1PanelList(
  panelList: unknown[],
  tabId: string,
  tabTitle: string,
  yOffset: number,
  out: ExtractedPanel[],
  flowStart: number
): number {
  let flowOrder = flowStart;
  for (const item of panelList) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const panel = item as UnknownRecord;
    if (panel.type === 'row') {
      const nested = panel.panels;
      const rowY = gridPosFromUnknown(panel.gridPos)?.y ?? 0;
      if (Array.isArray(nested)) {
        flowOrder = walkV1PanelList(nested, tabId, tabTitle, yOffset + rowY, out, flowOrder);
      }
      continue;
    }

    const extracted = panelFromV1(panel, tabId, tabTitle);
    extracted.flowOrder = flowOrder++;
    out.push(extracted);
  }
  return flowOrder;
}

function panelFromV1(panel: UnknownRecord, tabId: string, tabTitle: string): ExtractedPanel {
  const id = typeof panel.id === 'number' ? panel.id : 0;
  const title = typeof panel.title === 'string' ? panel.title : '';
  const vizType = typeof panel.type === 'string' ? panel.type : '';
  const gridPos = gridPosFromUnknown(panel.gridPos);

  return {
    matchKey: panelMatchKey(id),
    id,
    title,
    vizType,
    querySummary: summarizeV1Queries(panel.targets),
    thresholdsSummary: summarizeThresholds(getFieldConfig(panel)),
    gridPos,
    tabId,
    tabTitle,
    layoutMode: gridPos ? 'grid' : 'flow',
  };
}

function extractV2Panels(dashboard: UnknownRecord): ExtractPanelsResult {
  const elements = dashboard.elements;
  const layout = dashboard.layout;
  if (!elements || typeof elements !== 'object' || !layout || typeof layout !== 'object') {
    return { schema: 'v2', tabs: [DEFAULT_TAB], panels: [] };
  }

  const tabsMap = new Map<string, TabDescriptor>();
  const panels: ExtractedPanel[] = [];
  let flowCounter = 0;

  walkV2Layout(
    layout as UnknownRecord,
    elements as UnknownRecord,
    DEFAULT_TAB.id,
    DEFAULT_TAB.title,
    0,
    panels,
    tabsMap,
    () => flowCounter++
  );

  if (tabsMap.size === 0) {
    tabsMap.set(DEFAULT_TAB.id, DEFAULT_TAB);
  }

  return { schema: 'v2', tabs: Array.from(tabsMap.values()), panels };
}

function walkV2Layout(
  layout: UnknownRecord,
  elements: UnknownRecord,
  tabId: string,
  tabTitle: string,
  yOffset: number,
  out: ExtractedPanel[],
  tabsMap: Map<string, TabDescriptor>,
  nextFlowOrder: () => number
): void {
  const kind = layout.kind;

  switch (kind) {
    case 'GridLayout':
      tabsMap.set(tabId, { id: tabId, title: tabTitle });
      walkGridLayout(layout.spec as UnknownRecord, elements, tabId, tabTitle, yOffset, out, nextFlowOrder);
      break;
    case 'AutoGridLayout':
      tabsMap.set(tabId, { id: tabId, title: tabTitle });
      walkAutoGridLayout(layout.spec as UnknownRecord, elements, tabId, tabTitle, out, nextFlowOrder);
      break;
    case 'TabsLayout':
      walkTabsLayout(layout.spec as UnknownRecord, elements, out, tabsMap, nextFlowOrder);
      break;
    case 'RowsLayout':
      tabsMap.set(tabId, { id: tabId, title: tabTitle });
      walkRowsLayout(layout.spec as UnknownRecord, elements, tabId, tabTitle, yOffset, out, tabsMap, nextFlowOrder);
      break;
    default:
      break;
  }
}

function walkGridLayout(
  spec: UnknownRecord,
  elements: UnknownRecord,
  tabId: string,
  tabTitle: string,
  yOffset: number,
  out: ExtractedPanel[],
  nextFlowOrder: () => number
): void {
  const items = spec.items;
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const itemRecord = item as UnknownRecord;
    if (itemRecord.kind !== 'GridLayoutItem') {
      continue;
    }
    const itemSpec = itemRecord.spec as UnknownRecord;
    const elementRef = itemSpec.element as UnknownRecord | undefined;
    const elementName = typeof elementRef?.name === 'string' ? elementRef.name : '';
    const panel = buildPanelFromV2Element(elementName, elements, tabId, tabTitle, 'grid');
    if (!panel) {
      continue;
    }
    const x = typeof itemSpec.x === 'number' ? itemSpec.x : 0;
    const y = typeof itemSpec.y === 'number' ? itemSpec.y : 0;
    const w = typeof itemSpec.width === 'number' ? itemSpec.width : 1;
    const h = typeof itemSpec.height === 'number' ? itemSpec.height : 1;
    panel.gridPos = { x, y: y + yOffset, w, h };
    panel.flowOrder = nextFlowOrder();
    out.push(panel);
  }
}

function walkAutoGridLayout(
  spec: UnknownRecord,
  elements: UnknownRecord,
  tabId: string,
  tabTitle: string,
  out: ExtractedPanel[],
  nextFlowOrder: () => number
): void {
  const items = spec.items;
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const itemRecord = item as UnknownRecord;
    if (itemRecord.kind !== 'AutoGridLayoutItem') {
      continue;
    }
    const itemSpec = itemRecord.spec as UnknownRecord;
    const elementRef = itemSpec.element as UnknownRecord | undefined;
    const elementName = typeof elementRef?.name === 'string' ? elementRef.name : '';
    const panel = buildPanelFromV2Element(elementName, elements, tabId, tabTitle, 'flow');
    if (!panel) {
      continue;
    }
    panel.flowOrder = nextFlowOrder();
    out.push(panel);
  }
}

function walkTabsLayout(
  spec: UnknownRecord,
  elements: UnknownRecord,
  out: ExtractedPanel[],
  tabsMap: Map<string, TabDescriptor>,
  nextFlowOrder: () => number
): void {
  const tabs = spec.tabs;
  if (!Array.isArray(tabs)) {
    return;
  }
  tabs.forEach((tab, index) => {
    if (!tab || typeof tab !== 'object') {
      return;
    }
    const tabRecord = tab as UnknownRecord;
    if (tabRecord.kind !== 'TabsLayoutTab') {
      return;
    }
    const tabSpec = tabRecord.spec as UnknownRecord;
    const title = typeof tabSpec.title === 'string' && tabSpec.title ? tabSpec.title : `Tab ${index + 1}`;
    const tabId = `tab-${index}-${slugify(title)}`;
    tabsMap.set(tabId, { id: tabId, title });
    const nestedLayout = tabSpec.layout as UnknownRecord;
    if (nestedLayout) {
      walkV2Layout(nestedLayout, elements, tabId, title, 0, out, tabsMap, nextFlowOrder);
    }
  });
}

function walkRowsLayout(
  spec: UnknownRecord,
  elements: UnknownRecord,
  tabId: string,
  tabTitle: string,
  yOffset: number,
  out: ExtractedPanel[],
  tabsMap: Map<string, TabDescriptor>,
  nextFlowOrder: () => number
): void {
  const rows = spec.rows;
  if (!Array.isArray(rows)) {
    return;
  }
  let cumulativeY = yOffset;
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const rowRecord = row as UnknownRecord;
    if (rowRecord.kind !== 'RowsLayoutRow') {
      continue;
    }
    const rowSpec = rowRecord.spec as UnknownRecord;
    const nestedLayout = rowSpec.layout as UnknownRecord;
    const beforeCount = out.length;
    if (nestedLayout) {
      walkV2Layout(nestedLayout, elements, tabId, tabTitle, cumulativeY, out, tabsMap, nextFlowOrder);
    }
    const rowPanels = out.slice(beforeCount);
    const rowHeight = maxGridBottom(rowPanels);
    cumulativeY += rowHeight > 0 ? rowHeight : 1;
  }
}

function buildPanelFromV2Element(
  elementName: string,
  elements: UnknownRecord,
  tabId: string,
  tabTitle: string,
  layoutMode: PanelLayoutMode
): ExtractedPanel | undefined {
  if (!elementName) {
    return undefined;
  }
  const element = elements[elementName];
  if (!element || typeof element !== 'object') {
    return undefined;
  }
  const elementRecord = element as UnknownRecord;
  if (elementRecord.kind === 'LibraryPanel') {
    const spec = elementRecord.spec as UnknownRecord;
    const id = typeof spec.id === 'number' ? spec.id : 0;
    const title = typeof spec.title === 'string' ? spec.title : elementName;
    return {
      matchKey: panelMatchKey(id, elementName),
      id,
      elementName,
      title,
      vizType: 'library-panel',
      querySummary: '',
      thresholdsSummary: '',
      tabId,
      tabTitle,
      layoutMode,
    };
  }
  if (elementRecord.kind !== 'Panel') {
    return undefined;
  }
  const spec = elementRecord.spec as UnknownRecord;
  const id = typeof spec.id === 'number' ? spec.id : 0;
  const title = typeof spec.title === 'string' ? spec.title : elementName;
  const vizConfig = spec.vizConfig as UnknownRecord | undefined;
  const vizType = typeof vizConfig?.group === 'string' ? vizConfig.group : '';

  return {
    matchKey: panelMatchKey(id, elementName),
    id,
    elementName,
    title,
    vizType,
    querySummary: summarizeV2Queries(spec.data),
    thresholdsSummary: summarizeThresholds(getV2FieldConfig(vizConfig)),
    tabId,
    tabTitle,
    layoutMode,
  };
}

function panelMatchKey(id: number, elementName?: string): string {
  if (id > 0) {
    return `id:${id}`;
  }
  if (elementName) {
    return `name:${elementName}`;
  }
  return 'unknown';
}

function gridPosFromUnknown(gridPos: unknown): GridPos | undefined {
  if (!gridPos || typeof gridPos !== 'object') {
    return undefined;
  }
  const gp = gridPos as UnknownRecord;
  if (
    typeof gp.x === 'number' &&
    typeof gp.y === 'number' &&
    typeof gp.w === 'number' &&
    typeof gp.h === 'number'
  ) {
    return { x: gp.x, y: gp.y, w: gp.w, h: gp.h };
  }
  return undefined;
}

function getFieldConfig(panel: UnknownRecord): UnknownRecord | undefined {
  const fieldConfig = panel.fieldConfig;
  if (!fieldConfig || typeof fieldConfig !== 'object') {
    return undefined;
  }
  return fieldConfig as UnknownRecord;
}

function getV2FieldConfig(vizConfig: UnknownRecord | undefined): UnknownRecord | undefined {
  const spec = vizConfig?.spec;
  if (!spec || typeof spec !== 'object') {
    return undefined;
  }
  const fieldConfig = (spec as UnknownRecord).fieldConfig;
  if (!fieldConfig || typeof fieldConfig !== 'object') {
    return undefined;
  }
  return fieldConfig as UnknownRecord;
}

function summarizeV1Queries(targets: unknown): string {
  if (!Array.isArray(targets) || targets.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const target of targets.slice(0, 3)) {
    if (!target || typeof target !== 'object') {
      continue;
    }
    const t = target as UnknownRecord;
    const expr = typeof t.expr === 'string' ? t.expr : undefined;
    const refId = typeof t.refId === 'string' ? t.refId : undefined;
    if (expr) {
      parts.push(expr);
    } else if (refId) {
      parts.push(refId);
    }
  }
  if (targets.length > 3) {
    parts.push(`+${targets.length - 3} more`);
  }
  return parts.join('; ');
}

function summarizeV2Queries(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }
  const dataRecord = data as UnknownRecord;
  const spec = dataRecord.spec as UnknownRecord | undefined;
  const queries = spec?.queries;
  if (!Array.isArray(queries) || queries.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const query of queries.slice(0, 3)) {
    if (!query || typeof query !== 'object') {
      continue;
    }
    const q = query as UnknownRecord;
    const qSpec = q.spec as UnknownRecord | undefined;
    const innerQuery = qSpec?.query as UnknownRecord | undefined;
    const innerSpec = innerQuery?.spec as UnknownRecord | undefined;
    const expr = typeof innerSpec?.expr === 'string' ? innerSpec.expr : undefined;
    const refId = typeof qSpec?.refId === 'string' ? qSpec.refId : undefined;
    if (expr) {
      parts.push(expr);
    } else if (refId) {
      parts.push(refId);
    }
  }
  if (queries.length > 3) {
    parts.push(`+${queries.length - 3} more`);
  }
  return parts.join('; ');
}

function summarizeThresholds(fieldConfig: UnknownRecord | undefined): string {
  if (!fieldConfig) {
    return '';
  }
  const defaults = fieldConfig.defaults as UnknownRecord | undefined;
  const thresholds = defaults?.thresholds as UnknownRecord | undefined;
  const steps = thresholds?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return '';
  }
  return steps
    .map((step) => {
      if (!step || typeof step !== 'object') {
        return '';
      }
      const s = step as UnknownRecord;
      const value = s.value;
      const color = typeof s.color === 'string' ? s.color : '';
      return `${value ?? 'base'}${color ? ` (${color})` : ''}`;
    })
    .filter(Boolean)
    .join(', ');
}

function maxGridBottom(panels: ExtractedPanel[]): number {
  let max = 0;
  for (const panel of panels) {
    if (panel.gridPos) {
      max = Math.max(max, panel.gridPos.y + panel.gridPos.h);
    }
  }
  return max;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function mergeTabDescriptors(...tabLists: TabDescriptor[][]): TabDescriptor[] {
  const map = new Map<string, TabDescriptor>();
  for (const list of tabLists) {
    for (const tab of list) {
      if (!map.has(tab.id)) {
        map.set(tab.id, tab);
      }
    }
  }
  if (map.size === 0) {
    map.set(DEFAULT_TAB.id, DEFAULT_TAB);
  }
  return Array.from(map.values());
}
