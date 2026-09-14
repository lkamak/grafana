import { isEqual } from 'lodash';

import { type Panel } from '@grafana/schema';

import { GRID_CELL_HEIGHT, GRID_CELL_VMARGIN, GRID_COLUMN_COUNT } from 'app/core/constants';

export type GridPos = { x: number; y: number; w: number; h: number };

export type QuerySummary = {
  refId: string;
  summary: string;
};

export type PanelSnapshot = {
  id: number;
  title: string;
  vizType: string;
  queries: QuerySummary[];
  thresholds: unknown;
  gridPos: GridPos | null;
  tabId: string;
  tabTitle: string;
  contentSignature: string;
};

export type PanelDiffStatus = 'added' | 'removed' | 'changed' | 'moved' | 'unchanged';

export type FieldChange = {
  label: string;
  oldValue?: string;
  newValue?: string;
};

export type PanelDiffItem = {
  id: number;
  status: PanelDiffStatus;
  moved: boolean;
  title: string;
  vizType: string;
  gridPos: GridPos | null;
  previousGridPos?: GridPos | null;
  lhs?: PanelSnapshot;
  rhs?: PanelSnapshot;
  fieldChanges: FieldChange[];
};

export type VisualDiffTab = {
  id: string;
  title: string;
};

export type VisualDiffResult = {
  tabs: VisualDiffTab[];
  isTabbed: boolean;
  layoutKind: 'grid' | 'autoGrid';
  itemsByTab: Record<string, PanelDiffItem[]>;
};

type V2Layout = {
  kind: string;
  spec: Record<string, unknown>;
};

type V2Spec = {
  layout: V2Layout;
  elements: Record<string, unknown>;
};

type TabPanels = {
  tabId: string;
  tabTitle: string;
  panels: PanelSnapshot[];
  layoutKind: 'grid' | 'autoGrid';
};

const DEFAULT_TAB: VisualDiffTab = { id: 'default', title: 'Dashboard' };

function isV2Spec(spec: unknown): spec is V2Spec {
  return typeof spec === 'object' && spec !== null && 'layout' in spec && 'elements' in spec;
}

function isV1Dashboard(spec: unknown): spec is { panels?: Panel[] } {
  return typeof spec === 'object' && spec !== null && 'panels' in spec && Array.isArray((spec as { panels: unknown }).panels);
}

export function buildVisualDiff(lhs: object, rhs: object): VisualDiffResult {
  const lhsTabs = extractTabPanels(lhs);
  const rhsTabs = extractTabPanels(rhs);

  const tabOrder: VisualDiffTab[] = [];
  const tabTitleToId = new Map<string, string>();

  const registerTab = (tabId: string, tabTitle: string) => {
    const key = tabTitle.trim() || tabId;
    if (!tabTitleToId.has(key)) {
      tabTitleToId.set(key, tabId);
      tabOrder.push({ id: tabId, title: tabTitle.trim() || DEFAULT_TAB.title });
    }
  };

  for (const tab of [...lhsTabs, ...rhsTabs]) {
    registerTab(tab.tabId, tab.tabTitle);
  }

  const tabs = tabOrder.length > 0 ? tabOrder : [DEFAULT_TAB];
  const isTabbed = lhsTabs.length > 1 || rhsTabs.length > 1 || tabs.some((t) => t.id !== DEFAULT_TAB.id);

  const layoutKind =
    lhsTabs.some((t) => t.layoutKind === 'autoGrid') || rhsTabs.some((t) => t.layoutKind === 'autoGrid')
      ? 'autoGrid'
      : 'grid';

  const itemsByTab: Record<string, PanelDiffItem[]> = {};

  for (const tab of tabs) {
    const tabKey = tab.title.trim() || tab.id;
    const lhsPanels =
      lhsTabs.find((t) => t.tabId === tab.id || t.tabTitle.trim() === tabKey)?.panels ??
      lhsTabs.find((t) => tabTitleToId.get(t.tabTitle.trim() || t.tabId) === tab.id)?.panels ??
      [];
    const rhsPanels =
      rhsTabs.find((t) => t.tabId === tab.id || t.tabTitle.trim() === tabKey)?.panels ??
      rhsTabs.find((t) => tabTitleToId.get(t.tabTitle.trim() || t.tabId) === tab.id)?.panels ??
      [];
    itemsByTab[tab.id] = classifyPanels(lhsPanels, rhsPanels);
  }

  return { tabs, isTabbed, layoutKind, itemsByTab };
}

function extractTabPanels(spec: object): TabPanels[] {
  if (isV2Spec(spec)) {
    return extractV2TabPanels(spec);
  }
  if (isV1Dashboard(spec)) {
    return [
      {
        tabId: DEFAULT_TAB.id,
        tabTitle: DEFAULT_TAB.title,
        panels: collectV1Panels(spec.panels ?? [], DEFAULT_TAB.id, DEFAULT_TAB.title),
        layoutKind: 'grid',
      },
    ];
  }
  return [
    {
      tabId: DEFAULT_TAB.id,
      tabTitle: DEFAULT_TAB.title,
      panels: [],
      layoutKind: 'grid',
    },
  ];
}

function extractV2TabPanels(spec: V2Spec): TabPanels[] {
  const { layout, elements } = spec;
  if (layout.kind === 'TabsLayout') {
    const tabs = (layout.spec.tabs as Array<{ spec: { title?: string; layout: V2Layout } }>) ?? [];
    return tabs.map((tab, index) => {
      const tabTitle = tab.spec.title?.trim() || `Tab ${index + 1}`;
      const tabId = tabKeyFromTitle(tabTitle, index);
      const walked = walkV2Layout(tab.spec.layout, elements, tabId, tabTitle, 0);
      return {
        tabId,
        tabTitle,
        panels: walked.panels,
        layoutKind: walked.layoutKind,
      };
    });
  }

  const walked = walkV2Layout(layout, elements, DEFAULT_TAB.id, DEFAULT_TAB.title, 0);
  return [
    {
      tabId: DEFAULT_TAB.id,
      tabTitle: DEFAULT_TAB.title,
      panels: walked.panels,
      layoutKind: walked.layoutKind,
    },
  ];
}

function tabKeyFromTitle(title: string, index: number): string {
  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return slug ? `tab-${slug}-${index}` : `tab-${index}`;
}

function walkV2Layout(
  layout: V2Layout,
  elements: Record<string, unknown>,
  tabId: string,
  tabTitle: string,
  yOffset: number
): { panels: PanelSnapshot[]; layoutKind: 'grid' | 'autoGrid' } {
  switch (layout.kind) {
    case 'GridLayout':
      return {
        panels: collectV2GridItems((layout.spec.items as Array<{ spec: Record<string, unknown> }>) ?? [], elements, tabId, tabTitle, yOffset),
        layoutKind: 'grid',
      };
    case 'RowsLayout': {
      const rows = (layout.spec.rows as Array<{ spec: { layout: V2Layout } }>) ?? [];
      const panels: PanelSnapshot[] = [];
      let offset = yOffset;
      for (const row of rows) {
        const rowResult = walkV2Layout(row.spec.layout, elements, tabId, tabTitle, offset);
        panels.push(...rowResult.panels);
        offset += rowLayoutHeight(row.spec.layout, elements) + 1;
      }
      return { panels, layoutKind: 'grid' };
    }
    case 'AutoGridLayout': {
      const items = (layout.spec.items as Array<{ spec: { element: { name: string } } }>) ?? [];
      return {
        panels: items
          .map((item) => panelSnapshotFromElement(elements, item.spec.element.name, tabId, tabTitle, null))
          .filter((p): p is PanelSnapshot => p !== null),
        layoutKind: 'autoGrid',
      };
    }
    case 'TabsLayout': {
      // Nested tabs: flatten into current tab context (do not merge sibling tabs).
      const tabs = (layout.spec.tabs as Array<{ spec: { title?: string; layout: V2Layout } }>) ?? [];
      const panels: PanelSnapshot[] = [];
      for (let i = 0; i < tabs.length; i++) {
        const nested = walkV2Layout(tabs[i].spec.layout, elements, tabId, tabTitle, yOffset);
        panels.push(...nested.panels);
      }
      return { panels, layoutKind: 'grid' };
    }
    default:
      return { panels: [], layoutKind: 'grid' };
  }
}

function rowLayoutHeight(layout: V2Layout, elements: Record<string, unknown>): number {
  if (layout.kind === 'GridLayout') {
    const items = (layout.spec.items as Array<{ spec: { y: number; height: number } }>) ?? [];
    if (items.length === 0) {
      return 0;
    }
    return Math.max(...items.map((item) => item.spec.y + item.spec.height));
  }
  if (layout.kind === 'AutoGridLayout') {
    const items = (layout.spec.items as unknown[]) ?? [];
    return Math.max(1, Math.ceil(items.length / 3));
  }
  if (layout.kind === 'RowsLayout') {
    const rows = (layout.spec.rows as Array<{ spec: { layout: V2Layout } }>) ?? [];
    return rows.reduce((acc, row) => acc + rowLayoutHeight(row.spec.layout, elements) + 1, 0);
  }
  return 0;
}

function collectV2GridItems(
  items: Array<{ spec: Record<string, unknown> }>,
  elements: Record<string, unknown>,
  tabId: string,
  tabTitle: string,
  yOffset: number
): PanelSnapshot[] {
  return items
    .map((item) => {
      const elementRef = item.spec.element as { name: string };
      const gridPos: GridPos = {
        x: Number(item.spec.x ?? 0),
        y: Number(item.spec.y ?? 0) + yOffset,
        w: Number(item.spec.width ?? 0),
        h: Number(item.spec.height ?? 0),
      };
      return panelSnapshotFromElement(elements, elementRef.name, tabId, tabTitle, gridPos);
    })
    .filter((p): p is PanelSnapshot => p !== null);
}

function panelSnapshotFromElement(
  elements: Record<string, unknown>,
  elementName: string,
  tabId: string,
  tabTitle: string,
  gridPos: GridPos | null
): PanelSnapshot | null {
  const raw = elements[elementName];
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const kind = (raw as { kind?: string }).kind;
  if (kind === 'Panel') {
    return panelSnapshotFromV2Panel(raw as { spec: Record<string, unknown> }, tabId, tabTitle, gridPos);
  }
  if (kind === 'LibraryPanel') {
    const spec = (raw as { spec: { libraryPanel?: { name?: string }; id?: number } }).spec;
    const id = spec.id ?? hashStringToId(elementName);
    return {
      id,
      title: spec.libraryPanel?.name ?? elementName,
      vizType: 'library-panel',
      queries: [],
      thresholds: undefined,
      gridPos,
      tabId,
      tabTitle,
      contentSignature: stableStringify(raw),
    };
  }
  return null;
}

function panelSnapshotFromV2Panel(
  panelKind: { spec: Record<string, unknown> },
  tabId: string,
  tabTitle: string,
  gridPos: GridPos | null
): PanelSnapshot {
  const spec = panelKind.spec;
  const vizConfig = spec.vizConfig as { group?: string; spec?: { fieldConfig?: { defaults?: { thresholds?: unknown } } } } | undefined;
  const data = spec.data as { spec?: { queries?: Array<{ spec: { refId: string; query: { spec?: Record<string, unknown> } } }> } } | undefined;

  const id = Number(spec.id ?? 0);
  const title = String(spec.title ?? '');
  const vizType = vizConfig?.group ?? 'unknown';
  const queries = extractV2Queries(data);
  const thresholds = vizConfig?.spec?.fieldConfig?.defaults?.thresholds;

  return {
    id,
    title,
    vizType,
    queries,
    thresholds,
    gridPos,
    tabId,
    tabTitle,
    contentSignature: buildContentSignature({
      title,
      vizType,
      queries,
      thresholds,
      rest: omitKeys(spec, ['id']),
    }),
  };
}

function collectV1Panels(panels: Panel[], tabId: string, tabTitle: string): PanelSnapshot[] {
  const result: PanelSnapshot[] = [];
  for (const panel of panels) {
    if (panel.type === 'row') {
      for (const child of panel.panels ?? []) {
        if (child.type !== 'row') {
          result.push(panelSnapshotFromV1(child, tabId, tabTitle));
        }
      }
    } else {
      result.push(panelSnapshotFromV1(panel, tabId, tabTitle));
    }
  }
  return result;
}

function panelSnapshotFromV1(panel: Panel, tabId: string, tabTitle: string): PanelSnapshot {
  const gridPos = panel.gridPos
    ? { x: panel.gridPos.x, y: panel.gridPos.y, w: panel.gridPos.w, h: panel.gridPos.h }
    : null;
  const title = panel.title ?? '';
  const vizType = panel.type ?? 'unknown';
  const queries = extractV1Queries(panel.targets);
  const thresholds = panel.fieldConfig?.defaults?.thresholds;

  return {
    id: panel.id ?? hashStringToId(`${title}-${vizType}`),
    title,
    vizType,
    queries,
    thresholds,
    gridPos,
    tabId,
    tabTitle,
    contentSignature: buildContentSignature({
      title,
      vizType,
      queries,
      thresholds,
      rest: omitKeys(panel, ['id', 'gridPos']),
    }),
  };
}

function extractV1Queries(targets: Panel['targets']): QuerySummary[] {
  if (!targets?.length) {
    return [];
  }
  return targets.map((t, idx) => {
    const refId = String(t.refId ?? String.fromCharCode(65 + idx));
    const expr = t.expr ?? t.query ?? t.target ?? '';
    return { refId, summary: String(expr) };
  });
}

function extractV2Queries(
  data: { spec?: { queries?: Array<{ spec: { refId: string; query: { spec?: Record<string, unknown> } } }> } } | undefined
): QuerySummary[] {
  const queries = data?.spec?.queries ?? [];
  return queries.map((q) => {
    const refId = q.spec.refId;
    const querySpec = q.spec.query?.spec ?? {};
    const summary =
      String(querySpec.expr ?? querySpec.query ?? querySpec.rawSql ?? querySpec.target ?? '') ||
      stableStringify(querySpec);
    return { refId, summary };
  });
}

function classifyPanels(lhsPanels: PanelSnapshot[], rhsPanels: PanelSnapshot[]): PanelDiffItem[] {
  const lhsById = new Map(lhsPanels.map((p) => [p.id, p]));
  const rhsById = new Map(rhsPanels.map((p) => [p.id, p]));
  const allIds = new Set([...lhsById.keys(), ...rhsById.keys()]);
  const items: PanelDiffItem[] = [];

  for (const id of allIds) {
    const lhs = lhsById.get(id);
    const rhs = rhsById.get(id);

    if (lhs && !rhs) {
      items.push({
        id,
        status: 'removed',
        moved: false,
        title: lhs.title,
        vizType: lhs.vizType,
        gridPos: lhs.gridPos,
        lhs,
        rhs: undefined,
        fieldChanges: buildFieldChanges(lhs, undefined),
      });
      continue;
    }
    if (!lhs && rhs) {
      items.push({
        id,
        status: 'added',
        moved: false,
        title: rhs.title,
        vizType: rhs.vizType,
        gridPos: rhs.gridPos,
        lhs: undefined,
        rhs,
        fieldChanges: buildFieldChanges(undefined, rhs),
      });
      continue;
    }
    if (lhs && rhs) {
      const moved = !gridPosEqual(lhs.gridPos, rhs.gridPos);
      const contentChanged = lhs.contentSignature !== rhs.contentSignature;
      let status: PanelDiffStatus = 'unchanged';
      if (contentChanged) {
        status = 'changed';
      } else if (moved) {
        status = 'moved';
      }

      items.push({
        id,
        status,
        moved,
        title: rhs.title || lhs.title,
        vizType: rhs.vizType || lhs.vizType,
        gridPos: rhs.gridPos,
        previousGridPos: moved ? lhs.gridPos : undefined,
        lhs,
        rhs,
        fieldChanges: buildFieldChanges(lhs, rhs),
      });
    }
  }

  return sortPanelDiffItems(items);
}

function sortPanelDiffItems(items: PanelDiffItem[]): PanelDiffItem[] {
  return [...items].sort((a, b) => {
    const posA = a.gridPos ?? a.previousGridPos;
    const posB = b.gridPos ?? b.previousGridPos;
    if (posA && posB) {
      if (posA.y !== posB.y) {
        return posA.y - posB.y;
      }
      return posA.x - posB.x;
    }
    return a.id - b.id;
  });
}

export function buildFieldChanges(lhs?: PanelSnapshot, rhs?: PanelSnapshot): FieldChange[] {
  const changes: FieldChange[] = [];

  if (lhs?.title !== rhs?.title) {
    changes.push({
      label: 'Title',
      oldValue: lhs?.title,
      newValue: rhs?.title,
    });
  }

  if (lhs?.vizType !== rhs?.vizType) {
    changes.push({
      label: 'Visualization',
      oldValue: lhs?.vizType,
      newValue: rhs?.vizType,
    });
  }

  const queryChanges = diffQueries(lhs?.queries ?? [], rhs?.queries ?? []);
  changes.push(...queryChanges);

  if (!isEqual(lhs?.thresholds, rhs?.thresholds)) {
    changes.push({
      label: 'Thresholds',
      oldValue: formatThresholds(lhs?.thresholds),
      newValue: formatThresholds(rhs?.thresholds),
    });
  }

  if (lhs && rhs && !gridPosEqual(lhs.gridPos, rhs.gridPos)) {
    changes.push({
      label: 'Position',
      oldValue: formatGridPos(lhs.gridPos),
      newValue: formatGridPos(rhs.gridPos),
    });
  }

  return changes.filter((c) => c.oldValue !== c.newValue);
}

function diffQueries(lhs: QuerySummary[], rhs: QuerySummary[]): FieldChange[] {
  const changes: FieldChange[] = [];
  const lhsMap = new Map(lhs.map((q) => [q.refId, q.summary]));
  const rhsMap = new Map(rhs.map((q) => [q.refId, q.summary]));

  for (const [refId, summary] of rhsMap) {
    if (!lhsMap.has(refId)) {
      changes.push({ label: `Query ${refId}`, newValue: summary });
    } else if (lhsMap.get(refId) !== summary) {
      changes.push({ label: `Query ${refId}`, oldValue: lhsMap.get(refId), newValue: summary });
    }
  }

  for (const [refId, summary] of lhsMap) {
    if (!rhsMap.has(refId)) {
      changes.push({ label: `Query ${refId}`, oldValue: summary });
    }
  }

  return changes;
}

function formatThresholds(thresholds: unknown): string | undefined {
  if (thresholds === undefined || thresholds === null) {
    return undefined;
  }
  try {
    return JSON.stringify(thresholds);
  } catch {
    return String(thresholds);
  }
}

function formatGridPos(pos: GridPos | null | undefined): string | undefined {
  if (!pos) {
    return undefined;
  }
  return `x=${pos.x}, y=${pos.y}, w=${pos.w}, h=${pos.h}`;
}

function gridPosEqual(a: GridPos | null | undefined, b: GridPos | null | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function buildContentSignature(payload: {
  title: string;
  vizType: string;
  queries: QuerySummary[];
  thresholds: unknown;
  rest: unknown;
}): string {
  return stableStringify({
    title: payload.title,
    vizType: payload.vizType,
    queries: payload.queries,
    thresholds: payload.thresholds,
    rest: payload.rest,
  });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

function omitKeys<T extends object>(obj: T, keys: string[]): unknown {
  const clone = { ...obj } as Record<string, unknown>;
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}

function hashStringToId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

export function getCanvasHeight(items: PanelDiffItem[]): number {
  let maxBottom = 0;
  for (const item of items) {
    for (const pos of [item.gridPos, item.previousGridPos]) {
      if (pos) {
        maxBottom = Math.max(maxBottom, pos.y + pos.h);
      }
    }
  }
  if (maxBottom === 0) {
    return 120;
  }
  return maxBottom * GRID_CELL_HEIGHT + (maxBottom - 1) * GRID_CELL_VMARGIN + GRID_CELL_VMARGIN;
}

export function gridItemStyle(pos: GridPos): { left: string; top: number; width: string; height: number } {
  const left = `${(pos.x / GRID_COLUMN_COUNT) * 100}%`;
  const width = `${(pos.w / GRID_COLUMN_COUNT) * 100}%`;
  const top = pos.y * (GRID_CELL_HEIGHT + GRID_CELL_VMARGIN);
  const height = pos.h * GRID_CELL_HEIGHT + (pos.h - 1) * GRID_CELL_VMARGIN;
  return { left, top, width, height };
}
