import { isEqual } from 'lodash';

export type PanelDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export type PanelFieldChange = {
  field: 'title' | 'viz' | 'query' | 'thresholds' | 'position';
  before?: string;
  after?: string;
};

export type PanelSnapshot = {
  key: string;
  title: string;
  viz: string;
  queries: string[];
  thresholdsSummary: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tab: string;
  row: string;
  layoutKind: 'grid' | 'autogrid';
};

export type PanelDiffEntry = {
  status: PanelDiffStatus;
  key: string;
  title: string;
  current?: PanelSnapshot;
  previous?: PanelSnapshot;
  changes: PanelFieldChange[];
};

export type RowDiffSection = {
  title: string;
  entries: PanelDiffEntry[];
  gridMaxY: number;
};

export type TabDiffSection = {
  title: string;
  tabStatus: 'added' | 'removed' | 'both';
  rows: RowDiffSection[];
  autoGridEntries: PanelDiffEntry[];
};

export type VisualPanelDiffResult = {
  tabs: TabDiffSection[];
  usesTabs: boolean;
};

const DEFAULT_TAB = '';
const DEFAULT_ROW = '';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isV2Dashboard(data: unknown): boolean {
  return isRecord(data) && 'elements' in data && 'layout' in data;
}

function formatThresholds(thresholds: unknown): string {
  if (!isRecord(thresholds)) {
    return '';
  }
  const steps = thresholds.steps;
  if (!Array.isArray(steps)) {
    return JSON.stringify(thresholds);
  }
  return steps
    .map((step) => {
      if (!isRecord(step)) {
        return '';
      }
      const value = step.value ?? '';
      const color = step.color ?? '';
      return `${value}:${color}`;
    })
    .filter(Boolean)
    .join(', ');
}

function extractQueryStringsFromV2(queries: unknown): string[] {
  if (!Array.isArray(queries)) {
    return [];
  }
  return queries.map((q) => {
    if (!isRecord(q)) {
      return '';
    }
    const spec = isRecord(q.spec) ? q.spec : {};
    const query = isRecord(spec.query) ? spec.query : {};
    const querySpec = isRecord(query.spec) ? query.spec : {};
    const refId = typeof spec.refId === 'string' ? spec.refId : '';
    const expr =
      (typeof querySpec.expr === 'string' && querySpec.expr) ||
      (typeof querySpec.query === 'string' && querySpec.query) ||
      (typeof querySpec.rawSql === 'string' && querySpec.rawSql) ||
      '';
    return refId ? `${refId}: ${expr}`.trim() : expr;
  });
}

function extractQueryStringsFromV1(targets: unknown): string[] {
  if (!Array.isArray(targets)) {
    return [];
  }
  return targets.map((t) => {
    if (!isRecord(t)) {
      return '';
    }
    const refId = typeof t.refId === 'string' ? t.refId : '';
    const expr =
      (typeof t.expr === 'string' && t.expr) ||
      (typeof t.query === 'string' && t.query) ||
      (typeof t.rawSql === 'string' && t.rawSql) ||
      '';
    return refId ? `${refId}: ${expr}`.trim() : expr;
  });
}

function resolveV2Element(elements: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const el = elements[name];
  return isRecord(el) ? el : undefined;
}

function snapshotFromV2Panel(
  elementName: string,
  element: Record<string, unknown>,
  placement: { x: number; y: number; w: number; h: number },
  ctx: { tab: string; row: string },
  layoutKind: 'grid' | 'autogrid'
): PanelSnapshot {
  const kind = element.kind;
  if (kind === 'LibraryPanel' && isRecord(element.spec)) {
    const spec = element.spec;
    const lib = isRecord(spec.libraryPanel) ? spec.libraryPanel : {};
    return {
      key: elementName,
      title: typeof spec.title === 'string' ? spec.title : elementName,
      viz: 'library-panel',
      queries: [],
      thresholdsSummary: '',
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      tab: ctx.tab,
      row: ctx.row,
      layoutKind,
    };
  }

  const spec = isRecord(element.spec) ? element.spec : {};
  const data = isRecord(spec.data) && isRecord(spec.data.spec) ? spec.data.spec : {};
  const vizConfig = isRecord(spec.vizConfig) ? spec.vizConfig : {};
  const vizSpec = isRecord(vizConfig.spec) ? vizConfig.spec : {};
  const fieldConfig = isRecord(vizSpec.fieldConfig) && isRecord(vizSpec.fieldConfig.defaults) ? vizSpec.fieldConfig.defaults : {};

  return {
    key: elementName,
    title: typeof spec.title === 'string' ? spec.title : elementName,
    viz: typeof vizConfig.group === 'string' ? vizConfig.group : 'unknown',
    queries: extractQueryStringsFromV2(data.queries),
    thresholdsSummary: formatThresholds(fieldConfig.thresholds),
    x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
    tab: ctx.tab,
    row: ctx.row,
    layoutKind,
  };
}

function walkV2Layout(
  layout: unknown,
  elements: Record<string, unknown>,
  ctx: { tab: string; row: string },
  gridPanels: PanelSnapshot[],
  autoGridPanels: PanelSnapshot[],
  usesTabs: { value: boolean }
): void {
  if (!isRecord(layout) || typeof layout.kind !== 'string') {
    return;
  }

  const kind = layout.kind;
  const spec = isRecord(layout.spec) ? layout.spec : {};

  if (kind === 'GridLayout' && Array.isArray(spec.items)) {
    for (const item of spec.items) {
      if (!isRecord(item) || !isRecord(item.spec)) {
        continue;
      }
      const itemSpec = item.spec;
      const ref = isRecord(itemSpec.element) ? itemSpec.element : {};
      const name = typeof ref.name === 'string' ? ref.name : '';
      if (!name) {
        continue;
      }
      const element = resolveV2Element(elements, name);
      if (!element) {
        continue;
      }
      gridPanels.push(
        snapshotFromV2Panel(
          name,
          element,
          {
            x: typeof itemSpec.x === 'number' ? itemSpec.x : 0,
            y: typeof itemSpec.y === 'number' ? itemSpec.y : 0,
            w: typeof itemSpec.width === 'number' ? itemSpec.width : 1,
            h: typeof itemSpec.height === 'number' ? itemSpec.height : 1,
          },
          ctx,
          'grid'
        )
      );
    }
    return;
  }

  if (kind === 'AutoGridLayout' && Array.isArray(spec.items)) {
    let index = 0;
    for (const item of spec.items) {
      if (!isRecord(item) || !isRecord(item.spec)) {
        continue;
      }
      const ref = isRecord(item.spec.element) ? item.spec.element : {};
      const name = typeof ref.name === 'string' ? ref.name : '';
      if (!name) {
        continue;
      }
      const element = resolveV2Element(elements, name);
      if (!element) {
        continue;
      }
      autoGridPanels.push(
        snapshotFromV2Panel(name, element, { x: 0, y: index, w: 24, h: 1 }, ctx, 'autogrid')
      );
      index += 1;
    }
    return;
  }

  if (kind === 'RowsLayout' && Array.isArray(spec.rows)) {
    for (const row of spec.rows) {
      if (!isRecord(row) || !isRecord(row.spec)) {
        continue;
      }
      const rowTitle = typeof row.spec.title === 'string' && row.spec.title ? row.spec.title : 'Row';
      walkV2Layout(row.spec.layout, elements, { tab: ctx.tab, row: rowTitle }, gridPanels, autoGridPanels, usesTabs);
    }
    return;
  }

  if (kind === 'TabsLayout' && Array.isArray(spec.tabs)) {
    usesTabs.value = true;
    for (const tab of spec.tabs) {
      if (!isRecord(tab) || !isRecord(tab.spec)) {
        continue;
      }
      const tabTitle = typeof tab.spec.title === 'string' && tab.spec.title ? tab.spec.title : 'Tab';
      walkV2Layout(tab.spec.layout, elements, { tab: tabTitle, row: DEFAULT_ROW }, gridPanels, autoGridPanels, usesTabs);
    }
  }
}

function extractV2Panels(data: Record<string, unknown>): {
  grid: PanelSnapshot[];
  autoGrid: PanelSnapshot[];
  usesTabs: boolean;
} {
  const elements = isRecord(data.elements) ? data.elements : {};
  const grid: PanelSnapshot[] = [];
  const autoGrid: PanelSnapshot[] = [];
  const usesTabs = { value: false };
  walkV2Layout(data.layout, elements, { tab: DEFAULT_TAB, row: DEFAULT_ROW }, grid, autoGrid, usesTabs);
  return { grid, autoGrid, usesTabs: usesTabs.value };
}

function extractV1Panels(data: Record<string, unknown>): { grid: PanelSnapshot[]; autoGrid: PanelSnapshot[] } {
  const panels = Array.isArray(data.panels) ? data.panels : [];
  const grid: PanelSnapshot[] = [];
  let currentRow = DEFAULT_ROW;

  for (const panel of panels) {
    if (!isRecord(panel)) {
      continue;
    }
    if (panel.type === 'row') {
      currentRow = typeof panel.title === 'string' && panel.title ? panel.title : 'Row';
      continue;
    }

    const gridPos = isRecord(panel.gridPos) ? panel.gridPos : {};
    const id = typeof panel.id === 'number' ? panel.id : 0;
    const fieldConfig =
      isRecord(panel.fieldConfig) && isRecord(panel.fieldConfig.defaults) ? panel.fieldConfig.defaults : {};

    grid.push({
      key: `id:${id}`,
      title: typeof panel.title === 'string' ? panel.title : `Panel ${id}`,
      viz: typeof panel.type === 'string' ? panel.type : 'unknown',
      queries: extractQueryStringsFromV1(panel.targets),
      thresholdsSummary: formatThresholds(fieldConfig.thresholds),
      x: typeof gridPos.x === 'number' ? gridPos.x : 0,
      y: typeof gridPos.y === 'number' ? gridPos.y : 0,
      w: typeof gridPos.w === 'number' ? gridPos.w : 1,
      h: typeof gridPos.h === 'number' ? gridPos.h : 1,
      tab: DEFAULT_TAB,
      row: currentRow,
      layoutKind: 'grid',
    });
  }

  return { grid, autoGrid: [] };
}

function extractAllPanels(data: unknown): { grid: PanelSnapshot[]; autoGrid: PanelSnapshot[]; usesTabs: boolean } {
  if (!isRecord(data)) {
    return { grid: [], autoGrid: [], usesTabs: false };
  }
  if (isV2Dashboard(data)) {
    return extractV2Panels(data);
  }
  return { ...extractV1Panels(data), usesTabs: false };
}

function positionKey(p: PanelSnapshot): string {
  return `${p.x},${p.y},${p.w},${p.h}`;
}

function formatPosition(p: PanelSnapshot): string {
  return `(${p.x}, ${p.y}) ${p.w}×${p.h}`;
}

function computeFieldChanges(before: PanelSnapshot, after: PanelSnapshot): PanelFieldChange[] {
  const changes: PanelFieldChange[] = [];

  if (before.title !== after.title) {
    changes.push({ field: 'title', before: before.title, after: after.title });
  }
  if (before.viz !== after.viz) {
    changes.push({ field: 'viz', before: before.viz, after: after.viz });
  }
  if (!isEqual(before.queries, after.queries)) {
    changes.push({
      field: 'query',
      before: before.queries.join('; ') || '—',
      after: after.queries.join('; ') || '—',
    });
  }
  if (before.thresholdsSummary !== after.thresholdsSummary) {
    changes.push({
      field: 'thresholds',
      before: before.thresholdsSummary || '—',
      after: after.thresholdsSummary || '—',
    });
  }
  if (positionKey(before) !== positionKey(after)) {
    changes.push({
      field: 'position',
      before: formatPosition(before),
      after: formatPosition(after),
    });
  }

  return changes;
}

function classifyPair(before: PanelSnapshot, after: PanelSnapshot): PanelDiffEntry {
  const changes = computeFieldChanges(before, after);
  const status: PanelDiffStatus = changes.length === 0 ? 'unchanged' : 'changed';
  return {
    status,
    key: after.key,
    title: after.title || before.title,
    current: after,
    previous: before,
    changes,
  };
}

function groupByTabAndRow(snapshots: PanelSnapshot[]): Map<string, Map<string, PanelSnapshot[]>> {
  const byTab = new Map<string, Map<string, PanelSnapshot[]>>();

  for (const snap of snapshots) {
    const tab = snap.tab || DEFAULT_TAB;
    const row = snap.row || DEFAULT_ROW;
    if (!byTab.has(tab)) {
      byTab.set(tab, new Map());
    }
    const byRow = byTab.get(tab)!;
    if (!byRow.has(row)) {
      byRow.set(row, []);
    }
    byRow.get(row)!.push(snap);
  }

  return byTab;
}

function matchPanelsInScope(basePanels: PanelSnapshot[], newPanels: PanelSnapshot[]): PanelDiffEntry[] {
  const baseByKey = new Map(basePanels.map((p) => [p.key, p]));
  const newByKey = new Map(newPanels.map((p) => [p.key, p]));
  const usedBaseKeys = new Set<string>();
  const entries: PanelDiffEntry[] = [];

  for (const [key, after] of newByKey) {
    const before = baseByKey.get(key);
    if (before) {
      usedBaseKeys.add(key);
      entries.push(classifyPair(before, after));
    }
  }

  for (const [key, after] of newByKey) {
    if (usedBaseKeys.has(key)) {
      continue;
    }
    entries.push({
      status: 'added',
      key,
      title: after.title,
      current: after,
      changes: [],
    });
  }

  for (const before of basePanels) {
    if (usedBaseKeys.has(before.key) || newByKey.has(before.key)) {
      continue;
    }
    entries.push({
      status: 'removed',
      key: before.key,
      title: before.title,
      previous: before,
      changes: [],
    });
  }

  return entries;
}

function gridMaxY(entries: PanelDiffEntry[]): number {
  let max = 0;
  for (const entry of entries) {
    const snap = entry.current ?? entry.previous;
    if (snap && snap.layoutKind === 'grid') {
      max = Math.max(max, snap.y + snap.h);
    }
    if (entry.previous && entry.status === 'changed') {
      max = Math.max(max, entry.previous.y + entry.previous.h);
    }
  }
  return Math.max(max, 1);
}

function groupAutoGridByTab(snapshots: PanelSnapshot[]): Map<string, PanelSnapshot[]> {
  const byTab = new Map<string, PanelSnapshot[]>();
  for (const snap of snapshots) {
    const tab = snap.tab || DEFAULT_TAB;
    if (!byTab.has(tab)) {
      byTab.set(tab, []);
    }
    byTab.get(tab)!.push(snap);
  }
  return byTab;
}

export function computeVisualPanelDiff(lhs: unknown, rhs: unknown): VisualPanelDiffResult {
  const base = extractAllPanels(lhs);
  const newer = extractAllPanels(rhs);
  const usesTabs = base.usesTabs || newer.usesTabs;

  const baseGrouped = groupByTabAndRow(base.grid);
  const newGrouped = groupByTabAndRow(newer.grid);
  const baseAutoByTab = groupAutoGridByTab(base.autoGrid);
  const newAutoByTab = groupAutoGridByTab(newer.autoGrid);

  const tabTitles = new Set<string>([...baseGrouped.keys(), ...newGrouped.keys()]);
  const sortedTabs = [...tabTitles].sort((a, b) => {
    if (a === DEFAULT_TAB) {
      return -1;
    }
    if (b === DEFAULT_TAB) {
      return 1;
    }
    return a.localeCompare(b);
  });

  const tabs: TabDiffSection[] = sortedTabs.map((tabTitle) => {
    const baseTab = baseGrouped.get(tabTitle);
    const newTab = newGrouped.get(tabTitle);
    const tabStatus: TabDiffSection['tabStatus'] =
      baseTab && newTab ? 'both' : baseTab ? 'removed' : 'added';

    const rowTitles = new Set<string>([
      ...(baseTab ? [...baseTab.keys()] : []),
      ...(newTab ? [...newTab.keys()] : []),
    ]);

    const rows: RowDiffSection[] = [...rowTitles].sort().map((rowTitle) => {
      const basePanels = baseTab?.get(rowTitle) ?? [];
      const newPanels = newTab?.get(rowTitle) ?? [];
      const entries = matchPanelsInScope(basePanels, newPanels);
      return {
        title: rowTitle || 'Panels',
        entries,
        gridMaxY: gridMaxY(entries),
      };
    });

    const autoGridEntries = matchPanelsInScope(baseAutoByTab.get(tabTitle) ?? [], newAutoByTab.get(tabTitle) ?? []);

    return {
      title: tabTitle || 'Dashboard',
      tabStatus,
      rows,
      autoGridEntries,
    };
  });

  return { tabs, usesTabs };
}

export function getPanelsForTab(result: VisualPanelDiffResult, tabTitle: string): TabDiffSection | undefined {
  return result.tabs.find((t) => t.title === tabTitle || (tabTitle === 'Dashboard' && t.title === 'Dashboard'));
}
