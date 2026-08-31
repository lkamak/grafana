import { isEqual } from 'lodash';

import { GRID_COLUMN_COUNT } from 'app/core/constants';

export type PanelChangeKind = 'added' | 'removed' | 'changed' | 'moved' | 'unchanged';

export type PanelGridPos = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PanelFieldName = 'title' | 'query' | 'viz type' | 'thresholds' | 'layout';

export type PanelFieldChange = {
  field: PanelFieldName;
  before: string;
  after: string;
};

export type PanelSnapshot = {
  id: string;
  title: string;
  type: string;
  gridPos: PanelGridPos;
  query: string;
  thresholds: string;
  tabId?: string;
};

export type PanelVersionDiffItem = {
  id: string;
  kind: PanelChangeKind;
  base?: PanelSnapshot;
  next?: PanelSnapshot;
  changes: PanelFieldChange[];
};

export type DashboardTab = {
  id: string;
  title: string;
};

const DEFAULT_GRID_POS: PanelGridPos = { x: 0, y: 0, w: GRID_COLUMN_COUNT, h: 8 };

export function listDashboardTabs(dashboard: unknown): DashboardTab[] | undefined {
  const spec = unwrapDashboard(dashboard);
  if (!spec) {
    return undefined;
  }

  const tabs = readTabsLayoutTabs(spec.layout);
  if (!tabs || tabs.length === 0) {
    return undefined;
  }

  return tabs.map((tab, index) => {
    const tabSpec = isRecord(tab.spec) ? tab.spec : tab;
    const title = typeof tabSpec.title === 'string' && tabSpec.title ? tabSpec.title : `Tab ${index + 1}`;
    const metadata = isRecord(tab.metadata) ? tab.metadata : undefined;
    const id =
      metadata && typeof metadata.name === 'string' && metadata.name
        ? metadata.name
        : typeof tabSpec.title === 'string' && tabSpec.title
          ? tabSpec.title
          : `tab-${index}`;
    return { id, title };
  });
}

export function mergeDashboardTabs(lhs: unknown, rhs: unknown): DashboardTab[] | undefined {
  const lhsTabs = listDashboardTabs(lhs) ?? [];
  const rhsTabs = listDashboardTabs(rhs) ?? [];

  if (lhsTabs.length === 0 && rhsTabs.length === 0) {
    return undefined;
  }

  const merged = new Map<string, DashboardTab>();
  for (const tab of [...lhsTabs, ...rhsTabs]) {
    if (!merged.has(tab.id)) {
      merged.set(tab.id, tab);
    }
  }

  return Array.from(merged.values());
}

export function extractPanels(dashboard: unknown, tabId?: string): PanelSnapshot[] {
  const spec = unwrapDashboard(dashboard);
  if (!spec) {
    return [];
  }

  if (Array.isArray(spec.panels)) {
    return collectV1Panels(spec.panels);
  }

  if (isRecord(spec.elements) || isRecord(spec.layout)) {
    return collectV2Panels(spec, tabId);
  }

  return [];
}

export function diffDashboardPanels(lhs: unknown, rhs: unknown, tabId?: string): PanelVersionDiffItem[] {
  const basePanels = new Map(extractPanels(lhs, tabId).map((panel) => [panel.id, panel]));
  const nextPanels = new Map(extractPanels(rhs, tabId).map((panel) => [panel.id, panel]));
  const ids = new Set([...basePanels.keys(), ...nextPanels.keys()]);
  const items: PanelVersionDiffItem[] = [];

  for (const id of ids) {
    const base = basePanels.get(id);
    const next = nextPanels.get(id);

    if (base && !next) {
      items.push({ id, kind: 'removed', base, changes: [] });
      continue;
    }

    if (!base && next) {
      items.push({ id, kind: 'added', next, changes: [] });
      continue;
    }

    if (!base || !next) {
      continue;
    }

    const changes = diffPanelFields(base, next);
    const hasContentChange = changes.some((change) => change.field !== 'layout');
    const hasLayoutChange = changes.some((change) => change.field === 'layout');

    let kind: PanelChangeKind = 'unchanged';
    if (hasContentChange) {
      kind = 'changed';
    } else if (hasLayoutChange) {
      kind = 'moved';
    }

    items.push({ id, kind, base, next, changes });
  }

  return items.sort(compareDiffItems);
}

function diffPanelFields(base: PanelSnapshot, next: PanelSnapshot): PanelFieldChange[] {
  const changes: PanelFieldChange[] = [];

  if (base.title !== next.title) {
    changes.push({ field: 'title', before: displayOrEmpty(base.title), after: displayOrEmpty(next.title) });
  }
  if (base.query !== next.query) {
    changes.push({ field: 'query', before: displayOrEmpty(base.query), after: displayOrEmpty(next.query) });
  }
  if (base.type !== next.type) {
    changes.push({ field: 'viz type', before: displayOrEmpty(base.type), after: displayOrEmpty(next.type) });
  }
  if (base.thresholds !== next.thresholds) {
    changes.push({
      field: 'thresholds',
      before: displayOrEmpty(base.thresholds),
      after: displayOrEmpty(next.thresholds),
    });
  }
  if (!isEqual(base.gridPos, next.gridPos)) {
    changes.push({
      field: 'layout',
      before: formatGridPos(base.gridPos),
      after: formatGridPos(next.gridPos),
    });
  }

  return changes;
}

function collectV1Panels(panels: unknown[]): PanelSnapshot[] {
  const snapshots: PanelSnapshot[] = [];

  const walk = (items: unknown[]) => {
    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }
      if (item.type === 'row') {
        if (Array.isArray(item.panels)) {
          walk(item.panels);
        }
        continue;
      }
      snapshots.push(snapshotFromV1Panel(item));
    }
  };

  walk(panels);
  return snapshots;
}

function snapshotFromV1Panel(panel: Record<string, unknown>): PanelSnapshot {
  const id = panelIdFromUnknown(panel.id, panel.title, panel.type);
  return {
    id,
    title: typeof panel.title === 'string' ? panel.title : '',
    type: typeof panel.type === 'string' ? panel.type : '',
    gridPos: readGridPos(panel.gridPos),
    query: summarizeQueries(panel.targets),
    thresholds: summarizeThresholds(readV1Thresholds(panel)),
  };
}

function collectV2Panels(spec: Record<string, unknown>, tabId?: string): PanelSnapshot[] {
  const elements = isRecord(spec.elements) ? spec.elements : {};
  const snapshots: PanelSnapshot[] = [];
  walkV2Layout(spec.layout, elements, 0, snapshots, tabId);
  return snapshots;
}

function walkV2Layout(
  layout: unknown,
  elements: Record<string, unknown>,
  yOffset: number,
  snapshots: PanelSnapshot[],
  tabId?: string
): number {
  if (!isRecord(layout)) {
    return yOffset;
  }

  const kind = layout.kind;
  const spec = isRecord(layout.spec) ? layout.spec : layout;

  if (kind === 'AutoGridLayout') {
    const items = Array.isArray(spec.items) ? spec.items : [];
    items.forEach((item, index) => {
      if (!isRecord(item)) {
        return;
      }
      const itemSpec = isRecord(item.spec) ? item.spec : item;
      const elementName = readElementName(itemSpec.element);
      const panel = elementName ? elements[elementName] : undefined;
      const gridPos = {
        x: 0,
        y: yOffset + index * 4,
        w: GRID_COLUMN_COUNT,
        h: 4,
      };
      if (isRecord(panel)) {
        snapshots.push(snapshotFromV2Panel(panel, gridPos, tabId));
      }
    });
    return yOffset + items.length * 4;
  }

  if (kind === 'GridLayout' || Array.isArray(spec.items)) {
    let maxBottom = yOffset;
    const items = Array.isArray(spec.items) ? spec.items : [];
    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }
      const itemSpec = isRecord(item.spec) ? item.spec : item;
      const elementName = readElementName(itemSpec.element);
      const panel = elementName ? elements[elementName] : undefined;
      const gridPos = {
        x: readNumber(itemSpec.x, 0),
        y: readNumber(itemSpec.y, 0) + yOffset,
        w: readNumber(itemSpec.width, 12),
        h: readNumber(itemSpec.height, 8),
      };
      if (isRecord(panel)) {
        snapshots.push(snapshotFromV2Panel(panel, gridPos, tabId));
      }
      maxBottom = Math.max(maxBottom, gridPos.y + gridPos.h);
    }
    return maxBottom;
  }

  if (kind === 'RowsLayout' && Array.isArray(spec.rows)) {
    let nextOffset = yOffset;
    for (const row of spec.rows) {
      if (!isRecord(row)) {
        continue;
      }
      const rowSpec = isRecord(row.spec) ? row.spec : row;
      nextOffset = walkV2Layout(rowSpec.layout, elements, nextOffset, snapshots, tabId);
    }
    return nextOffset;
  }

  if (kind === 'TabsLayout' && Array.isArray(spec.tabs)) {
    const tabs = spec.tabs;

    if (tabId) {
      for (let index = 0; index < tabs.length; index++) {
        const tab = tabs[index];
        if (!isRecord(tab)) {
          continue;
        }
        if (tabToId(tab, index) !== tabId) {
          continue;
        }
        const tabSpec = isRecord(tab.spec) ? tab.spec : tab;
        return walkV2Layout(tabSpec.layout, elements, yOffset, snapshots, tabId);
      }
      return yOffset;
    }

    return yOffset;
  }

  return yOffset;
}

function readTabsLayoutTabs(layout: unknown): unknown[] | undefined {
  if (!isRecord(layout) || layout.kind !== 'TabsLayout') {
    return undefined;
  }
  const spec = isRecord(layout.spec) ? layout.spec : layout;
  return Array.isArray(spec.tabs) ? spec.tabs : undefined;
}

function tabToId(tab: unknown, index: number): string {
  if (!isRecord(tab)) {
    return `tab-${index}`;
  }
  const tabSpec = isRecord(tab.spec) ? tab.spec : tab;
  const metadata = isRecord(tab.metadata) ? tab.metadata : undefined;
  if (metadata && typeof metadata.name === 'string' && metadata.name) {
    return metadata.name;
  }
  if (typeof tabSpec.title === 'string' && tabSpec.title) {
    return tabSpec.title;
  }
  return `tab-${index}`;
}

function snapshotFromV2Panel(panel: Record<string, unknown>, gridPos: PanelGridPos, tabId?: string): PanelSnapshot {
  const spec = isRecord(panel.spec) ? panel.spec : panel;
  const vizConfig = isRecord(spec.vizConfig) ? spec.vizConfig : {};
  const vizSpec = isRecord(vizConfig.spec) ? vizConfig.spec : {};
  const fieldConfig = isRecord(vizSpec.fieldConfig) ? vizSpec.fieldConfig : {};
  const defaults = isRecord(fieldConfig.defaults) ? fieldConfig.defaults : {};
  const data = isRecord(spec.data) ? spec.data : {};
  const dataSpec = isRecord(data.spec) ? data.spec : {};
  const type = typeof vizConfig.group === 'string' ? vizConfig.group : '';
  const title = typeof spec.title === 'string' ? spec.title : '';

  return {
    id: panelIdFromUnknown(spec.id, title, type),
    title,
    type,
    gridPos,
    query: summarizeQueries(dataSpec.queries),
    thresholds: summarizeThresholds(defaults.thresholds),
    tabId,
  };
}

function unwrapDashboard(input: unknown): Record<string, unknown> | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  if (isRecord(input.spec) && looksLikeDashboard(input.spec)) {
    return input.spec;
  }

  if (isRecord(input.dashboard)) {
    return unwrapDashboard(input.dashboard) ?? (looksLikeDashboard(input.dashboard) ? input.dashboard : input);
  }

  return input;
}

function looksLikeDashboard(value: Record<string, unknown>): boolean {
  return Array.isArray(value.panels) || isRecord(value.elements) || isRecord(value.layout);
}

function readV1Thresholds(panel: Record<string, unknown>): unknown {
  const fieldConfig = isRecord(panel.fieldConfig) ? panel.fieldConfig : undefined;
  const defaults = fieldConfig && isRecord(fieldConfig.defaults) ? fieldConfig.defaults : undefined;
  if (defaults && defaults.thresholds !== undefined) {
    return defaults.thresholds;
  }
  return panel.thresholds;
}

function summarizeQueries(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return '';
  }

  return raw
    .map((query) => formatQuery(query))
    .filter(Boolean)
    .join('\n');
}

function formatQuery(query: unknown): string {
  if (typeof query === 'string') {
    return query;
  }
  if (!isRecord(query)) {
    return '';
  }

  const spec = isRecord(query.spec) ? query.spec : query;
  const nestedQuery = isRecord(spec.query) ? spec.query : spec;
  const nestedSpec = isRecord(nestedQuery.spec) ? nestedQuery.spec : nestedQuery;

  if (typeof nestedSpec.expr === 'string' && nestedSpec.expr) {
    return nestedSpec.expr;
  }
  if (typeof nestedSpec.rawSql === 'string' && nestedSpec.rawSql) {
    return nestedSpec.rawSql;
  }
  if (typeof nestedSpec.query === 'string' && nestedSpec.query) {
    return nestedSpec.query;
  }
  if (typeof spec.expr === 'string' && spec.expr) {
    return spec.expr;
  }
  if (typeof spec.rawSql === 'string' && spec.rawSql) {
    return spec.rawSql;
  }

  try {
    return JSON.stringify(nestedSpec);
  } catch {
    return '';
  }
}

function summarizeThresholds(raw: unknown): string {
  if (!isRecord(raw)) {
    return '';
  }

  const mode = typeof raw.mode === 'string' ? raw.mode : 'absolute';
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  if (steps.length === 0) {
    return mode;
  }

  const stepText = steps
    .map((step) => {
      if (!isRecord(step)) {
        return '';
      }
      const value = step.value === null || step.value === undefined ? '-∞' : String(step.value);
      const color = typeof step.color === 'string' ? step.color : '';
      return color ? `${value} → ${color}` : value;
    })
    .filter(Boolean)
    .join(', ');

  return `${mode}: ${stepText}`;
}

function readGridPos(raw: unknown): PanelGridPos {
  if (!isRecord(raw)) {
    return { ...DEFAULT_GRID_POS };
  }

  return {
    x: readNumber(raw.x, DEFAULT_GRID_POS.x),
    y: readNumber(raw.y, DEFAULT_GRID_POS.y),
    w: readNumber(raw.w, DEFAULT_GRID_POS.w),
    h: readNumber(raw.h, DEFAULT_GRID_POS.h),
  };
}

export function formatGridPos(pos: PanelGridPos): string {
  return `(${pos.x}, ${pos.y}) ${pos.w}×${pos.h}`;
}

function panelIdFromUnknown(id: unknown, title: unknown, type: unknown): string {
  if (typeof id === 'number' || typeof id === 'string') {
    return String(id);
  }
  return `untitled:${String(title ?? '')}:${String(type ?? '')}`;
}

function readElementName(element: unknown): string | undefined {
  if (typeof element === 'string') {
    return element;
  }
  if (isRecord(element) && typeof element.name === 'string') {
    return element.name;
  }
  return undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function displayOrEmpty(value: string): string {
  return value || '(empty)';
}

function compareDiffItems(a: PanelVersionDiffItem, b: PanelVersionDiffItem): number {
  const posA = a.next?.gridPos ?? a.base?.gridPos ?? DEFAULT_GRID_POS;
  const posB = b.next?.gridPos ?? b.base?.gridPos ?? DEFAULT_GRID_POS;
  if (posA.y !== posB.y) {
    return posA.y - posB.y;
  }
  if (posA.x !== posB.x) {
    return posA.x - posB.x;
  }
  return a.id.localeCompare(b.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
