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

  // Collapsed v1 rows keep child gridPos at the expanded coordinates while later
  // panels are shifted up into those cells. Re-apply the hidden height so tiles
  // stack as they would after expand, instead of overlapping.
  const yShift = { value: 0 };
  walkV1PanelList(panelsArray, DEFAULT_TAB.id, DEFAULT_TAB.title, 0, panels, 0, yShift);

  return { schema: 'v1', tabs: [DEFAULT_TAB], panels };
}

function walkV1PanelList(
  panelList: unknown[],
  tabId: string,
  tabTitle: string,
  yOffset: number,
  out: ExtractedPanel[],
  flowStart: number,
  yShift: { value: number }
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
        flowOrder = walkV1PanelList(nested, tabId, tabTitle, yOffset + rowY, out, flowOrder, yShift);
        if (panel.collapsed === true) {
          yShift.value += collapsedRowPushDown(panel, nested);
        }
      }
      continue;
    }

    const extracted = panelFromV1(panel, tabId, tabTitle);
    if (extracted.gridPos && yShift.value !== 0) {
      extracted.gridPos = { ...extracted.gridPos, y: extracted.gridPos.y + yShift.value };
    }
    extracted.flowOrder = flowOrder++;
    out.push(extracted);
  }
  return flowOrder;
}

function collapsedRowPushDown(row: UnknownRecord, rowPanels: unknown[]): number {
  if (rowPanels.length === 0) {
    return 0;
  }

  const rowY = gridPosFromUnknown(row.gridPos)?.y ?? 0;
  let yMax = rowY + 1;
  for (const child of rowPanels) {
    if (!child || typeof child !== 'object') {
      continue;
    }
    const pos = gridPosFromUnknown((child as UnknownRecord).gridPos);
    if (pos) {
      yMax = Math.max(yMax, pos.y + pos.h);
    }
  }
  return Math.max(0, yMax - rowY - 1);
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
  const usedIds = new Set<string>();
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
    const tabId = tabIdentity(tabRecord, title, usedIds);
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
    // Nested grid positions already include cumulativeY. Use the absolute
    // bottom as the next row's offset instead of adding that bottom again.
    const rowBottom = maxGridBottom(rowPanels);
    cumulativeY = rowBottom > cumulativeY ? rowBottom : cumulativeY + 1;
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
  if (typeof gp.x === 'number' && typeof gp.y === 'number' && typeof gp.w === 'number' && typeof gp.h === 'number') {
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

function tabIdentity(tabRecord: UnknownRecord, title: string, usedIds: Set<string>): string {
  const metadata = tabRecord.metadata;
  if (metadata && typeof metadata === 'object') {
    const name = (metadata as UnknownRecord).name;
    if (typeof name === 'string' && name) {
      usedIds.add(name);
      return name;
    }
  }

  const base = `tab-${slugify(title) || 'untitled'}`;
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let suffix = 2;
  let candidate = `${base}__${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}__${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function panelKeysByTab(panels: ExtractedPanel[]): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();
  for (const panel of panels) {
    let set = keys.get(panel.tabId);
    if (!set) {
      set = new Set<string>();
      keys.set(panel.tabId, set);
    }
    set.add(panel.matchKey);
  }
  return keys;
}

/**
 * Rewrite new-version tab ids to the matching base tab so reorder/rename do not
 * look like every panel moved. Match by panel overlap first, then by title.
 */
export function alignTabDescriptors(base: ExtractPanelsResult, next: ExtractPanelsResult): void {
  if (base.tabs.length === 0 || next.tabs.length === 0) {
    return;
  }

  const remapNewToBase = new Map<string, string>();
  const usedNew = new Set<string>();
  const usedBase = new Set<string>();
  const baseKeys = panelKeysByTab(base.panels);
  const nextKeys = panelKeysByTab(next.panels);

  for (const baseTab of base.tabs) {
    if (next.tabs.some((tab) => tab.id === baseTab.id)) {
      usedBase.add(baseTab.id);
      usedNew.add(baseTab.id);
    }
  }

  for (const baseTab of base.tabs) {
    if (usedBase.has(baseTab.id)) {
      continue;
    }
    const bKeys = baseKeys.get(baseTab.id) ?? new Set<string>();
    let bestId: string | undefined;
    let bestScore = 0;
    for (const nextTab of next.tabs) {
      if (usedNew.has(nextTab.id)) {
        continue;
      }
      const nKeys = nextKeys.get(nextTab.id) ?? new Set<string>();
      let overlap = 0;
      for (const key of bKeys) {
        if (nKeys.has(key)) {
          overlap += 1;
        }
      }
      if (overlap > bestScore) {
        bestScore = overlap;
        bestId = nextTab.id;
      }
    }
    if (bestId && bestScore > 0) {
      remapNewToBase.set(bestId, baseTab.id);
      usedNew.add(bestId);
      usedBase.add(baseTab.id);
    }
  }

  for (const baseTab of base.tabs) {
    if (usedBase.has(baseTab.id)) {
      continue;
    }
    const match = next.tabs.find((tab) => !usedNew.has(tab.id) && tab.title === baseTab.title);
    if (match) {
      remapNewToBase.set(match.id, baseTab.id);
      usedNew.add(match.id);
      usedBase.add(baseTab.id);
    }
  }

  if (remapNewToBase.size === 0) {
    return;
  }

  const newTitleByCanonical = new Map<string, string>();
  for (const tab of next.tabs) {
    const canonical = remapNewToBase.get(tab.id) ?? tab.id;
    newTitleByCanonical.set(canonical, tab.title);
    tab.id = canonical;
  }
  for (const panel of next.panels) {
    panel.tabId = remapNewToBase.get(panel.tabId) ?? panel.tabId;
  }
  for (const tab of base.tabs) {
    const newTitle = newTitleByCanonical.get(tab.id);
    if (newTitle) {
      tab.title = newTitle;
    }
  }
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
