import { isEqual } from 'lodash';

export type PanelDiffStatus = 'added' | 'removed' | 'changed' | 'moved' | 'unchanged';

export type GridPos = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PanelFieldName = 'title' | 'query' | 'vizType' | 'thresholds' | 'position';

export type PanelFieldChange = {
  field: PanelFieldName;
  before?: string;
  after?: string;
};

export type NormalizedPanel = {
  id: number | string;
  title: string;
  vizType: string;
  queries: string;
  thresholds: string;
  gridPos?: GridPos;
  autoGridIndex?: number;
  tabId: string;
  tabTitle: string;
};

export type PanelDiffEntry = {
  status: PanelDiffStatus;
  id: number | string;
  title: string;
  base?: NormalizedPanel;
  current?: NormalizedPanel;
  fieldChanges: PanelFieldChange[];
};

export type TabPanelDiff = {
  tabId: string;
  tabTitle: string;
  panels: PanelDiffEntry[];
};

export type VisualPanelVersionDiff = {
  hasTabs: boolean;
  tabs: TabPanelDiff[];
};

const DEFAULT_TAB_ID = '__default__';
const DEFAULT_TAB_TITLE = '';

type JsonObject = Record<string, unknown>;

function isV2Dashboard(data: object): boolean {
  const d = data as JsonObject;
  return Boolean(d.layout && typeof d.layout === 'object' && d.elements && typeof d.elements === 'object');
}

function tabKeyFromTitle(title: string, index: number): string {
  const trimmed = title.trim();
  if (trimmed) {
    return trimmed;
  }
  return `tab-${index}`;
}

function serializeThresholds(thresholds: unknown): string {
  if (thresholds === undefined || thresholds === null) {
    return '';
  }
  return JSON.stringify(thresholds);
}

function serializeV1Queries(targets: unknown): string {
  if (!Array.isArray(targets)) {
    return '';
  }
  return JSON.stringify(
    targets.map((target) => {
      if (target && typeof target === 'object') {
        const t = target as JsonObject;
        return { refId: t.refId, expr: t.expr, query: t.query, rawSql: t.rawSql };
      }
      return target;
    })
  );
}

function normalizeV1Panel(panel: JsonObject, tabId: string, tabTitle: string): NormalizedPanel | undefined {
  if (panel.type === 'row') {
    return undefined;
  }

  const id = panel.id ?? panel.key;
  if (id === undefined || id === null) {
    return undefined;
  }

  const gridPos = panel.gridPos as GridPos | undefined;
  const fieldConfig = panel.fieldConfig as JsonObject | undefined;
  const defaults = fieldConfig?.defaults as JsonObject | undefined;

  return {
    id,
    title: String(panel.title ?? ''),
    vizType: String(panel.type ?? ''),
    queries: serializeV1Queries(panel.targets),
    thresholds: serializeThresholds(defaults?.thresholds),
    gridPos: gridPos
      ? { x: gridPos.x ?? 0, y: gridPos.y ?? 0, w: gridPos.w ?? 12, h: gridPos.h ?? 8 }
      : undefined,
    tabId,
    tabTitle,
  };
}

function walkV1Panels(panels: unknown[], tabId: string, tabTitle: string, out: NormalizedPanel[]) {
  if (!Array.isArray(panels)) {
    return;
  }

  for (const raw of panels) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const panel = raw as JsonObject;
    if (panel.type === 'row') {
      const nested = panel.panels;
      const collapsed = panel.collapsed === true;
      if (Array.isArray(nested) && !collapsed) {
        walkV1Panels(nested, tabId, tabTitle, out);
      }
      continue;
    }

    const normalized = normalizeV1Panel(panel, tabId, tabTitle);
    if (normalized) {
      out.push(normalized);
    }
  }
}

type ExtractedTabPanels = {
  tabId: string;
  tabTitle: string;
  panels: NormalizedPanel[];
};

function panelsToTabMap(normalized: NormalizedPanel[]): Map<string, ExtractedTabPanels> {
  const map = new Map<string, ExtractedTabPanels>();
  for (const panel of normalized) {
    const tabId = panel.tabId || DEFAULT_TAB_ID;
    if (!map.has(tabId)) {
      map.set(tabId, { tabId, tabTitle: panel.tabTitle, panels: [] });
    }
    map.get(tabId)!.panels.push(panel);
  }
  if (map.size === 0) {
    map.set(DEFAULT_TAB_ID, { tabId: DEFAULT_TAB_ID, tabTitle: DEFAULT_TAB_TITLE, panels: [] });
  }
  return map;
}

function extractV1Panels(data: object): Map<string, ExtractedTabPanels> {
  const panels = (data as JsonObject).panels;
  const normalized: NormalizedPanel[] = [];
  walkV1Panels(Array.isArray(panels) ? panels : [], DEFAULT_TAB_ID, DEFAULT_TAB_TITLE, normalized);
  return panelsToTabMap(normalized);
}

function normalizeV2Panel(
  panelKind: JsonObject,
  elementName: string,
  gridPos: GridPos | undefined,
  autoGridIndex: number | undefined,
  tabId: string,
  tabTitle: string
): NormalizedPanel | undefined {
  const spec = panelKind.spec as JsonObject | undefined;
  if (!spec) {
    return undefined;
  }

  const id = spec.id ?? elementName;
  const vizConfig = spec.vizConfig as JsonObject | undefined;
  const vizSpec = vizConfig?.spec as JsonObject | undefined;
  const fieldConfig = vizSpec?.fieldConfig as JsonObject | undefined;
  const defaults = fieldConfig?.defaults as JsonObject | undefined;
  const data = spec.data as JsonObject | undefined;
  const dataSpec = data?.spec as JsonObject | undefined;
  const queries = dataSpec?.queries;

  let queriesSerialized = '';
  if (Array.isArray(queries)) {
    queriesSerialized = JSON.stringify(
      queries.map((q) => {
        if (q && typeof q === 'object') {
          const queryKind = q as JsonObject;
          const querySpec = queryKind.spec as JsonObject | undefined;
          return { refId: querySpec?.refId, query: querySpec?.query };
        }
        return q;
      })
    );
  }

  return {
    id,
    title: String(spec.title ?? ''),
    vizType: String(vizConfig?.group ?? ''),
    queries: queriesSerialized,
    thresholds: serializeThresholds(defaults?.thresholds),
    gridPos,
    autoGridIndex,
    tabId,
    tabTitle,
  };
}

function gridLayoutExtent(items: JsonObject[]): number {
  let max = 0;
  for (const item of items) {
    const spec = item.spec as JsonObject | undefined;
    if (!spec) {
      continue;
    }
    const y = Number(spec.y ?? 0);
    const h = Number(spec.height ?? 8);
    max = Math.max(max, y + h);
  }
  return max || 1;
}

function walkV2Layout(
  layout: JsonObject,
  elements: JsonObject,
  ctx: { yOffset: number; tabId: string; tabTitle: string },
  out: NormalizedPanel[]
): number {
  const kind = layout.kind as string | undefined;
  const spec = layout.spec as JsonObject | undefined;
  if (!kind || !spec) {
    return 0;
  }

  if (kind === 'GridLayout') {
    const items = (spec.items as JsonObject[]) ?? [];
    for (const item of items) {
      const itemSpec = item.spec as JsonObject | undefined;
      const elementRef = itemSpec?.element as JsonObject | undefined;
      const elementName = elementRef?.name;
      if (typeof elementName !== 'string') {
        continue;
      }
      const element = elements[elementName] as JsonObject | undefined;
      if (!element || element.kind !== 'Panel') {
        continue;
      }
      const gridPos: GridPos = {
        x: Number(itemSpec?.x ?? 0),
        y: Number(itemSpec?.y ?? 0) + ctx.yOffset,
        w: Number(itemSpec?.width ?? 12),
        h: Number(itemSpec?.height ?? 8),
      };
      const normalized = normalizeV2Panel(element, elementName, gridPos, undefined, ctx.tabId, ctx.tabTitle);
      if (normalized) {
        out.push(normalized);
      }
    }
    return gridLayoutExtent(items);
  }

  if (kind === 'AutoGridLayout') {
    const items = (spec.items as JsonObject[]) ?? [];
    items.forEach((item, index) => {
      const itemSpec = item.spec as JsonObject | undefined;
      const elementRef = itemSpec?.element as JsonObject | undefined;
      const elementName = elementRef?.name;
      if (typeof elementName !== 'string') {
        return;
      }
      const element = elements[elementName] as JsonObject | undefined;
      if (!element || element.kind !== 'Panel') {
        return;
      }
      const normalized = normalizeV2Panel(element, elementName, undefined, index, ctx.tabId, ctx.tabTitle);
      if (normalized) {
        out.push(normalized);
      }
    });
    return Math.max(1, Math.ceil(items.length / 3));
  }

  if (kind === 'TabsLayout') {
    const tabs = (spec.tabs as JsonObject[]) ?? [];
    for (const [index, tab] of tabs.entries()) {
      const tabSpec = tab.spec as JsonObject | undefined;
      const tabTitle = String(tabSpec?.title ?? '');
      const tabId = tabKeyFromTitle(tabTitle, index);
      const innerLayout = tabSpec?.layout as JsonObject | undefined;
      if (innerLayout) {
        walkV2Layout(innerLayout, elements, { yOffset: 0, tabId, tabTitle }, out);
      }
    }
    return 0;
  }

  if (kind === 'RowsLayout') {
    const rows = (spec.rows as JsonObject[]) ?? [];
    let yOffset = ctx.yOffset;
    let totalHeight = 0;
    for (const row of rows) {
      const rowSpec = row.spec as JsonObject | undefined;
      if (rowSpec?.collapse === true) {
        continue;
      }
      const innerLayout = rowSpec?.layout as JsonObject | undefined;
      if (!innerLayout) {
        continue;
      }
      const rowHeight = walkV2Layout(innerLayout, elements, { ...ctx, yOffset }, out);
      yOffset += rowHeight;
      totalHeight += rowHeight;
    }
    return totalHeight || 1;
  }

  return 0;
}

function extractV2Panels(data: object): Map<string, ExtractedTabPanels> {
  const d = data as JsonObject;
  const layout = d.layout as JsonObject;
  const elements = d.elements as JsonObject;
  const normalized: NormalizedPanel[] = [];

  const rootKind = layout.kind as string | undefined;
  if (rootKind === 'TabsLayout') {
    walkV2Layout(layout, elements, { yOffset: 0, tabId: '', tabTitle: '' }, normalized);
  } else {
    walkV2Layout(layout, elements, { yOffset: 0, tabId: DEFAULT_TAB_ID, tabTitle: DEFAULT_TAB_TITLE }, normalized);
  }

  return panelsToTabMap(normalized);
}

function extractPanelsByTab(data: object): Map<string, ExtractedTabPanels> {
  if (isV2Dashboard(data)) {
    return extractV2Panels(data);
  }
  return extractV1Panels(data);
}

function panelLookupById(tab: ExtractedTabPanels | undefined): Map<string | number, NormalizedPanel> {
  const lookup = new Map<string | number, NormalizedPanel>();
  if (!tab) {
    return lookup;
  }
  for (const panel of tab.panels) {
    lookup.set(panel.id, panel);
  }
  return lookup;
}

function formatGridPos(pos?: GridPos, autoGridIndex?: number): string {
  if (autoGridIndex !== undefined) {
    return `index ${autoGridIndex}`;
  }
  if (!pos) {
    return '';
  }
  return `x:${pos.x} y:${pos.y} w:${pos.w} h:${pos.h}`;
}

function fieldsEqual(a: NormalizedPanel, b: NormalizedPanel): boolean {
  return (
    a.title === b.title &&
    a.queries === b.queries &&
    a.vizType === b.vizType &&
    a.thresholds === b.thresholds
  );
}

function positionEqual(a: NormalizedPanel, b: NormalizedPanel): boolean {
  if (a.autoGridIndex !== undefined || b.autoGridIndex !== undefined) {
    return a.autoGridIndex === b.autoGridIndex;
  }
  if (!a.gridPos && !b.gridPos) {
    return true;
  }
  if (!a.gridPos || !b.gridPos) {
    return false;
  }
  return isEqual(a.gridPos, b.gridPos);
}

function buildFieldChanges(base: NormalizedPanel, current: NormalizedPanel): PanelFieldChange[] {
  const changes: PanelFieldChange[] = [];

  if (base.title !== current.title) {
    changes.push({ field: 'title', before: base.title, after: current.title });
  }
  if (base.queries !== current.queries) {
    changes.push({ field: 'query', before: base.queries || '—', after: current.queries || '—' });
  }
  if (base.vizType !== current.vizType) {
    changes.push({ field: 'vizType', before: base.vizType, after: current.vizType });
  }
  if (base.thresholds !== current.thresholds) {
    changes.push({ field: 'thresholds', before: base.thresholds || '—', after: current.thresholds || '—' });
  }
  if (!positionEqual(base, current)) {
    changes.push({
      field: 'position',
      before: formatGridPos(base.gridPos, base.autoGridIndex),
      after: formatGridPos(current.gridPos, current.autoGridIndex),
    });
  }

  return changes;
}

function classifyPanel(base: NormalizedPanel | undefined, current: NormalizedPanel | undefined): PanelDiffEntry {
  if (!base && current) {
    return {
      status: 'added',
      id: current.id,
      title: current.title,
      current,
      fieldChanges: [],
    };
  }

  if (base && !current) {
    return {
      status: 'removed',
      id: base.id,
      title: base.title,
      base,
      fieldChanges: [],
    };
  }

  if (!base || !current) {
    return { status: 'unchanged', id: '', title: '', fieldChanges: [] };
  }

  const fieldChanges = buildFieldChanges(base, current);
  const contentChanged = !fieldsEqual(base, current);
  const moved = !positionEqual(base, current);

  let status: PanelDiffStatus = 'unchanged';
  if (contentChanged) {
    status = 'changed';
  } else if (moved) {
    status = 'moved';
  }

  return {
    status,
    id: current.id,
    title: current.title || base.title,
    base,
    current,
    fieldChanges,
  };
}

function mergeTabOrder(baseTabs: Map<string, ExtractedTabPanels>, newTabs: Map<string, ExtractedTabPanels>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const tabId of newTabs.keys()) {
    ordered.push(tabId);
    seen.add(tabId);
  }
  for (const tabId of baseTabs.keys()) {
    if (!seen.has(tabId)) {
      ordered.push(tabId);
    }
  }
  return ordered;
}

export function computeVisualPanelVersionDiff(baseData: object, newData: object): VisualPanelVersionDiff {
  const baseTabs = extractPanelsByTab(baseData);
  const newTabs = extractPanelsByTab(newData);

  const tabIds = mergeTabOrder(baseTabs, newTabs);
  const hasTabs = tabIds.some((id) => id !== DEFAULT_TAB_ID);

  const tabs: TabPanelDiff[] = [];

  for (const tabId of tabIds) {
    const baseTab = baseTabs.get(tabId);
    const newTab = newTabs.get(tabId);
    const tabTitle = newTab?.tabTitle || baseTab?.tabTitle || tabId;

    const baseLookup = panelLookupById(baseTab);
    const newLookup = panelLookupById(newTab);

    const allIds = new Set<string | number>([...baseLookup.keys(), ...newLookup.keys()]);
    const panels: PanelDiffEntry[] = [];

    for (const id of allIds) {
      panels.push(classifyPanel(baseLookup.get(id), newLookup.get(id)));
    }

    panels.sort((a, b) => {
      const posA = a.current?.gridPos ?? a.base?.gridPos;
      const posB = b.current?.gridPos ?? b.base?.gridPos;
      if (posA && posB) {
        if (posA.y !== posB.y) {
          return posA.y - posB.y;
        }
        return posA.x - posB.x;
      }
      const indexA = a.current?.autoGridIndex ?? a.base?.autoGridIndex ?? 0;
      const indexB = b.current?.autoGridIndex ?? b.base?.autoGridIndex ?? 0;
      return indexA - indexB;
    });

    tabs.push({ tabId, tabTitle, panels });
  }

  return { hasTabs, tabs };
}

export function getDefaultTabId(diff: VisualPanelVersionDiff): string {
  return diff.tabs[0]?.tabId ?? DEFAULT_TAB_ID;
}
