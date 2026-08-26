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

export type PanelSectionKind = 'grid' | 'list';

export type PanelSection = {
  key: string;
  title?: string;
  kind: PanelSectionKind;
};

export type PanelSnapshot = {
  id: string;
  title: string;
  type: string;
  gridPos: PanelGridPos;
  query: string;
  thresholds: string;
  section: PanelSection;
};

export type PanelVersionDiffItem = {
  id: string;
  kind: PanelChangeKind;
  base?: PanelSnapshot;
  next?: PanelSnapshot;
  changes: PanelFieldChange[];
};

export type PanelDiffSection = PanelSection & {
  items: PanelVersionDiffItem[];
};

const DEFAULT_GRID_POS: PanelGridPos = { x: 0, y: 0, w: GRID_COLUMN_COUNT, h: 8 };
const DEFAULT_SECTION: PanelSection = { key: 'layout', kind: 'grid' };

export function extractPanels(dashboard: unknown): PanelSnapshot[] {
  const spec = unwrapDashboard(dashboard);
  if (!spec) {
    return [];
  }

  if (Array.isArray(spec.panels)) {
    return collectV1Panels(spec.panels);
  }

  if (isRecord(spec.elements) || isRecord(spec.layout)) {
    return collectV2Panels(spec);
  }

  return [];
}

export function diffDashboardPanels(lhs: unknown, rhs: unknown): PanelVersionDiffItem[] {
  const basePanels = new Map(extractPanels(lhs).map((panel) => [panel.id, panel]));
  const nextPanels = new Map(extractPanels(rhs).map((panel) => [panel.id, panel]));
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

export function groupDiffItemsBySection(items: PanelVersionDiffItem[]): PanelDiffSection[] {
  const sections = new Map<string, PanelDiffSection>();
  const order: string[] = [];

  const addSection = (section?: PanelSection) => {
    if (!section || sections.has(section.key)) {
      return;
    }
    order.push(section.key);
    sections.set(section.key, { ...section, items: [] });
  };

  for (const item of items) {
    addSection(item.next?.section);
  }
  for (const item of items) {
    addSection(item.base?.section);
  }

  for (const item of items) {
    const nextKey = item.next?.section.key;
    const baseKey = item.base?.section.key;
    if (nextKey) {
      sections.get(nextKey)?.items.push(item);
    }
    if (baseKey && baseKey !== nextKey) {
      sections.get(baseKey)?.items.push(item);
    }
  }

  return order.map((key) => sections.get(key)!);
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
  if (!isEqual(base.gridPos, next.gridPos) || base.section.key !== next.section.key) {
    changes.push({
      field: 'layout',
      before: formatLayout(base),
      after: formatLayout(next),
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
    section: DEFAULT_SECTION,
  };
}

function collectV2Panels(spec: Record<string, unknown>): PanelSnapshot[] {
  const elements = isRecord(spec.elements) ? spec.elements : {};
  const snapshots: PanelSnapshot[] = [];
  walkV2Layout(spec.layout, elements, DEFAULT_SECTION, snapshots);
  return snapshots;
}

function walkV2Layout(
  layout: unknown,
  elements: Record<string, unknown>,
  section: PanelSection,
  snapshots: PanelSnapshot[]
): void {
  if (!isRecord(layout)) {
    return;
  }

  const kind = layout.kind;
  const spec = isRecord(layout.spec) ? layout.spec : layout;

  if (kind === 'TabsLayout' && Array.isArray(spec.tabs)) {
    spec.tabs.forEach((tab, index) => {
      if (!isRecord(tab)) {
        return;
      }
      const tabSpec = isRecord(tab.spec) ? tab.spec : tab;
      const title = typeof tabSpec.title === 'string' && tabSpec.title ? tabSpec.title : `Tab ${index + 1}`;
      walkV2Layout(tabSpec.layout, elements, childSection(section, `tab:${index}`, title, tabSpec.layout), snapshots);
    });
    return;
  }

  if (kind === 'RowsLayout' && Array.isArray(spec.rows)) {
    spec.rows.forEach((row, index) => {
      if (!isRecord(row)) {
        return;
      }
      const rowSpec = isRecord(row.spec) ? row.spec : row;
      const title = typeof rowSpec.title === 'string' && rowSpec.title ? rowSpec.title : `Row ${index + 1}`;
      walkV2Layout(rowSpec.layout, elements, childSection(section, `row:${index}`, title, rowSpec.layout), snapshots);
    });
    return;
  }

  if (kind === 'AutoGridLayout') {
    const items = Array.isArray(spec.items) ? spec.items : [];
    const listSection: PanelSection = { ...section, kind: 'list' };
    items.forEach((item, index) => {
      pushV2LayoutItem(item, elements, listSection, snapshots, {
        x: 0,
        y: index * 4,
        w: GRID_COLUMN_COUNT,
        h: 4,
      });
    });
    return;
  }

  const items = Array.isArray(spec.items) ? spec.items : [];
  const gridSection: PanelSection = { ...section, kind: 'grid' };
  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }
    const itemSpec = isRecord(item.spec) ? item.spec : item;
    pushV2LayoutItem(item, elements, gridSection, snapshots, {
      x: readNumber(itemSpec.x, 0),
      y: readNumber(itemSpec.y, 0),
      w: readNumber(itemSpec.width, 12),
      h: readNumber(itemSpec.height, 8),
    });
  }
}

function pushV2LayoutItem(
  item: unknown,
  elements: Record<string, unknown>,
  section: PanelSection,
  snapshots: PanelSnapshot[],
  gridPos: PanelGridPos
): void {
  if (!isRecord(item)) {
    return;
  }
  const itemSpec = isRecord(item.spec) ? item.spec : item;
  const elementName = readElementName(itemSpec.element);
  const panel = elementName ? elements[elementName] : undefined;
  if (isRecord(panel)) {
    snapshots.push(snapshotFromV2Panel(panel, gridPos, section, elementName));
  }
}

function snapshotFromV2Panel(
  panel: Record<string, unknown>,
  gridPos: PanelGridPos,
  section: PanelSection,
  elementName?: string
): PanelSnapshot {
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
    id: panelIdFromUnknown(elementName ?? spec.id, title, type),
    title,
    type,
    gridPos,
    query: summarizeQueries(dataSpec.queries),
    thresholds: summarizeThresholds(defaults.thresholds),
    section,
  };
}

function childSection(parent: PanelSection, suffix: string, title: string, layout: unknown): PanelSection {
  const parentKey = parent.key === DEFAULT_SECTION.key ? suffix : `${parent.key}/${suffix}`;
  return {
    key: parentKey,
    title,
    kind: layoutKind(layout),
  };
}

function layoutKind(layout: unknown): PanelSectionKind {
  if (isRecord(layout) && layout.kind === 'AutoGridLayout') {
    return 'list';
  }
  return 'grid';
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

export function formatLayout(snapshot: PanelSnapshot): string {
  const pos = formatGridPos(snapshot.gridPos);
  return snapshot.section.title ? `${snapshot.section.title} ${pos}` : pos;
}

function panelIdFromUnknown(id: unknown, title: unknown, type: unknown): string {
  if (typeof id === 'number' || typeof id === 'string') {
    const raw = String(id);
    const prefixed = /^panel-(\d+)$/.exec(raw);
    return prefixed ? prefixed[1] : raw;
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
  const sectionA = a.next?.section.key ?? a.base?.section.key ?? '';
  const sectionB = b.next?.section.key ?? b.base?.section.key ?? '';
  if (sectionA !== sectionB) {
    return sectionA.localeCompare(sectionB);
  }
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
