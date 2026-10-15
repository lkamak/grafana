import { isEqual } from 'lodash';

export type PanelDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export type GridPos = { x: number; y: number; w: number; h: number };

export type PanelFieldChange = {
  field: 'title' | 'visualization' | 'query' | 'thresholds';
  label: string;
  from?: string;
  to?: string;
};

export type PanelDiffItem = {
  id: string;
  status: PanelDiffStatus;
  title: string;
  vizType: string;
  position: GridPos;
  previousPosition?: GridPos;
  changes: PanelFieldChange[];
  displayMode: 'grid' | 'stack';
};

export type PanelDiffTab = { key: string; label: string };

export type PanelDiffSection = {
  key: string;
  label: string;
  kind: 'root' | 'tab' | 'row';
  tab?: PanelDiffTab;
  displayMode: 'grid' | 'stack';
  items: PanelDiffItem[];
};

export type DashboardPanelDiffVisual = {
  mode: 'visual';
  sections: PanelDiffSection[];
  hasTabs: boolean;
};

export type DashboardPanelDiffResult = DashboardPanelDiffVisual | { mode: 'schema-mismatch' };

type PanelSnapshot = {
  id: string;
  title: string;
  vizType: string;
  queries: Record<string, string>;
  thresholds?: unknown;
  position: GridPos;
  displayMode: 'grid' | 'stack';
};

type ExtractedSection = {
  key: string;
  label: string;
  kind: 'root' | 'tab' | 'row';
  tab?: PanelDiffTab;
  displayMode: 'grid' | 'stack';
  panels: Map<string, PanelSnapshot>;
};

const DEFAULT_GRID_POS: GridPos = { x: 0, y: 0, w: 6, h: 8 };

export function diffDashboardPanels(lhs: object, rhs: object): DashboardPanelDiffResult {
  const lhsKind = detectDashboardSchema(lhs);
  const rhsKind = detectDashboardSchema(rhs);

  if (lhsKind === 'unknown' || rhsKind === 'unknown' || lhsKind !== rhsKind) {
    return { mode: 'schema-mismatch' };
  }

  const lhsSections = lhsKind === 'v2' ? extractV2Sections(lhs) : extractV1Sections(lhs);
  const rhsSections = rhsKind === 'v2' ? extractV2Sections(rhs) : extractV1Sections(rhs);

  const hasTabs = lhsSections.some((s) => s.tab) || rhsSections.some((s) => s.tab);

  const sectionKeys = new Set([...lhsSections.map((s) => s.key), ...rhsSections.map((s) => s.key)]);
  const lhsByKey = new Map(lhsSections.map((s) => [s.key, s]));
  const rhsByKey = new Map(rhsSections.map((s) => [s.key, s]));

  const sections: PanelDiffSection[] = [];

  for (const key of [...sectionKeys].sort()) {
    const lhsSection = lhsByKey.get(key);
    const rhsSection = rhsByKey.get(key);
    const label = lhsSection?.label ?? rhsSection?.label ?? key;
    const kind = lhsSection?.kind ?? rhsSection?.kind ?? 'root';
    const tab = lhsSection?.tab ?? rhsSection?.tab;
    const displayMode = lhsSection?.displayMode ?? rhsSection?.displayMode ?? 'grid';

    const lhsPanels = lhsSection?.panels ?? new Map<string, PanelSnapshot>();
    const rhsPanels = rhsSection?.panels ?? new Map<string, PanelSnapshot>();
    const ids = new Set([...lhsPanels.keys(), ...rhsPanels.keys()]);

    const items: PanelDiffItem[] = [];

    for (const id of ids) {
      const base = lhsPanels.get(id);
      const newer = rhsPanels.get(id);

      if (base && !newer) {
        items.push({
          id,
          status: 'removed',
          title: base.title,
          vizType: base.vizType,
          position: base.position,
          changes: snapshotChanges(base),
          displayMode: base.displayMode,
        });
        continue;
      }

      if (!base && newer) {
        items.push({
          id,
          status: 'added',
          title: newer.title,
          vizType: newer.vizType,
          position: newer.position,
          changes: snapshotChanges(newer),
          displayMode: newer.displayMode,
        });
        continue;
      }

      if (base && newer) {
        const contentChanges = diffPanelContent(base, newer);
        const positionChanged = !positionsEqual(base.position, newer.position);

        if (contentChanges.length === 0 && !positionChanged) {
          items.push({
            id,
            status: 'unchanged',
            title: newer.title,
            vizType: newer.vizType,
            position: newer.position,
            changes: [],
            displayMode: newer.displayMode,
          });
        } else {
          items.push({
            id,
            status: 'changed',
            title: newer.title,
            vizType: newer.vizType,
            position: newer.position,
            previousPosition: positionChanged ? base.position : undefined,
            changes: contentChanges,
            displayMode: newer.displayMode,
          });
        }
      }
    }

    items.sort((a, b) => sortByGridPosition(a.position, b.position));

    if (items.length > 0) {
      sections.push({ key, label, kind, tab, displayMode, items });
    }
  }

  return { mode: 'visual', sections, hasTabs };
}

function detectDashboardSchema(data: object): 'v1' | 'v2' | 'unknown' {
  if ('elements' in data && 'layout' in data) {
    return 'v2';
  }
  if ('panels' in data && Array.isArray((data as { panels?: unknown }).panels)) {
    return 'v1';
  }
  return 'unknown';
}

function extractV1Sections(data: object): ExtractedSection[] {
  const panels = (data as { panels?: unknown[] }).panels ?? [];
  return [
    {
      key: 'root:default',
      label: '',
      kind: 'root',
      displayMode: 'grid',
      panels: extractV1Panels(panels),
    },
  ];
}

function extractV1Panels(panels: unknown[], into = new Map<string, PanelSnapshot>()): Map<string, PanelSnapshot> {
  for (const raw of panels) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const panel = raw as Record<string, unknown>;
    const type = panel.type as string | undefined;

    if (type === 'row') {
      const nested = panel.panels;
      if (Array.isArray(nested)) {
        extractV1Panels(nested, into);
      }
      continue;
    }

    const id = panel.id != null ? String(panel.id) : undefined;
    if (!id) {
      continue;
    }

    const gridPos = (panel.gridPos as GridPos | undefined) ?? DEFAULT_GRID_POS;
    into.set(id, {
      id,
      title: String(panel.title ?? ''),
      vizType: String(type ?? ''),
      queries: queriesFromV1Targets(panel.targets),
      thresholds: (panel.fieldConfig as { defaults?: { thresholds?: unknown } } | undefined)?.defaults?.thresholds,
      position: { x: gridPos.x, y: gridPos.y, w: gridPos.w, h: gridPos.h },
      displayMode: 'grid',
    });
  }

  return into;
}

function extractV2Sections(data: object): ExtractedSection[] {
  const spec = data as {
    elements?: Record<string, unknown>;
    layout?: LayoutNode;
  };
  const elements = spec.elements ?? {};
  const layout = spec.layout;

  if (!layout) {
    return [];
  }

  const sections: ExtractedSection[] = [];
  walkV2Layout(layout, elements, sections, { keyPrefix: 'root', label: '', kind: 'root' });
  return sections;
}

type LayoutContext = {
  keyPrefix: string;
  label: string;
  kind: 'root' | 'tab' | 'row';
  tab?: PanelDiffTab;
};

type LayoutNode = {
  kind?: string;
  spec?: Record<string, unknown>;
};

function walkV2Layout(
  layout: LayoutNode,
  elements: Record<string, unknown>,
  sections: ExtractedSection[],
  ctx: LayoutContext
) {
  const kind = layout.kind;

  if (kind === 'TabsLayout') {
    const tabs = (layout.spec?.tabs as LayoutNode[] | undefined) ?? [];
    tabs.forEach((tab, index) => {
      const tabSpec = tab.spec as { title?: string; layout?: LayoutNode } | undefined;
      const title = tabSpec?.title?.trim() || `Tab ${index + 1}`;
      const tabKey = `${ctx.keyPrefix}|tab:${index}:${title}`;
      const nested = tabSpec?.layout;
      if (nested) {
        walkV2Layout(nested, elements, sections, {
          keyPrefix: tabKey,
          label: title,
          kind: 'tab',
          tab: ctx.tab ?? { key: tabKey, label: title },
        });
      }
    });
    return;
  }

  if (kind === 'RowsLayout') {
    const rows = (layout.spec?.rows as LayoutNode[] | undefined) ?? [];
    const titleCounts = new Map<string, number>();
    rows.forEach((row, index) => {
      const rowSpec = row.spec as { title?: string; layout?: LayoutNode } | undefined;
      const title = rowSpec?.title?.trim() || `Row ${index + 1}`;
      // Key by title so reordered rows still match; suffix only disambiguates duplicate titles.
      const occurrence = (titleCounts.get(title) ?? 0) + 1;
      titleCounts.set(title, occurrence);
      const nested = rowSpec?.layout;
      if (nested) {
        walkV2Layout(nested, elements, sections, {
          keyPrefix: `${ctx.keyPrefix}|row:${title}${occurrence > 1 ? `#${occurrence}` : ''}`,
          label: title,
          kind: 'row',
          tab: ctx.tab,
        });
      }
    });
    return;
  }

  const sectionKey = ctx.kind === 'root' ? 'root:default' : `${ctx.keyPrefix}`;
  const panels = new Map<string, PanelSnapshot>();

  if (kind === 'GridLayout') {
    const items = (layout.spec?.items as LayoutNode[] | undefined) ?? [];
    for (const item of items) {
      addV2GridItem(item, elements, panels);
    }
  } else if (kind === 'AutoGridLayout') {
    const items = (layout.spec?.items as LayoutNode[] | undefined) ?? [];
    let y = 0;
    for (const item of items) {
      const snap = panelFromV2AutoItem(item, elements, y);
      if (snap) {
        panels.set(snap.id, snap);
        y += 1;
      }
    }
  }

  if (panels.size > 0) {
    sections.push({
      key: sectionKey,
      label: ctx.label,
      kind: ctx.kind,
      tab: ctx.tab,
      displayMode: kind === 'AutoGridLayout' ? 'stack' : 'grid',
      panels,
    });
  }
}

function addV2GridItem(item: LayoutNode, elements: Record<string, unknown>, panels: Map<string, PanelSnapshot>) {
  if (item.kind !== 'GridLayoutItem') {
    return;
  }
  const spec = item.spec as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    element?: { name?: string };
  };
  const name = spec.element?.name;
  if (!name) {
    return;
  }
  const snap = panelFromV2Element(name, elements, {
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    w: spec.width ?? 6,
    h: spec.height ?? 8,
  });
  if (snap) {
    panels.set(snap.id, snap);
  }
}

function panelFromV2AutoItem(
  item: LayoutNode,
  elements: Record<string, unknown>,
  stackIndex: number
): PanelSnapshot | undefined {
  if (item.kind !== 'AutoGridLayoutItem') {
    return undefined;
  }
  const spec = item.spec as { element?: { name?: string } };
  const name = spec.element?.name;
  if (!name) {
    return undefined;
  }
  return panelFromV2Element(name, elements, { x: 0, y: stackIndex, w: 24, h: 8 }, 'stack');
}

function panelFromV2Element(
  name: string,
  elements: Record<string, unknown>,
  position: GridPos,
  displayMode: 'grid' | 'stack' = 'grid'
): PanelSnapshot | undefined {
  const raw = elements[name];
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const element = raw as { kind?: string; spec?: Record<string, unknown> };
  if (element.kind === 'LibraryPanel') {
    const libraryPanel = element.spec?.libraryPanel as { name?: string; uid?: string } | undefined;
    return {
      id: name,
      title: String(element.spec?.title ?? ''),
      vizType: `library panel: ${libraryPanel?.name || libraryPanel?.uid || ''}`,
      queries: {},
      position,
      displayMode,
    };
  }
  if (element.kind !== 'Panel') {
    return undefined;
  }
  const spec = element.spec ?? {};
  const data = spec.data as { spec?: { queries?: unknown[] } } | undefined;
  const vizConfig = spec.vizConfig as {
    group?: string;
    spec?: { fieldConfig?: { defaults?: { thresholds?: unknown } } };
  };

  return {
    id: name,
    title: String(spec.title ?? ''),
    vizType: String(vizConfig?.group ?? ''),
    queries: queriesFromV2Data(data),
    thresholds: vizConfig?.spec?.fieldConfig?.defaults?.thresholds,
    position,
    displayMode,
  };
}

function queriesFromV1Targets(targets: unknown): Record<string, string> {
  if (!Array.isArray(targets)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const t of targets) {
    if (!t || typeof t !== 'object') {
      continue;
    }
    const target = t as Record<string, unknown>;
    const refId = String(target.refId ?? 'A');
    out[refId] = stableStringify(target);
  }
  return out;
}

function queriesFromV2Data(data: { spec?: { queries?: unknown[] } } | undefined): Record<string, string> {
  const queries = data?.spec?.queries;
  if (!Array.isArray(queries)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const q of queries) {
    if (!q || typeof q !== 'object') {
      continue;
    }
    const pq = q as { spec?: { refId?: string } };
    const refId = String(pq.spec?.refId ?? 'A');
    out[refId] = stableStringify(pq.spec);
  }
  return out;
}

function diffPanelContent(base: PanelSnapshot, newer: PanelSnapshot): PanelFieldChange[] {
  const changes: PanelFieldChange[] = [];

  if (base.title !== newer.title) {
    changes.push({
      field: 'title',
      label: 'Title',
      from: base.title || '(empty)',
      to: newer.title || '(empty)',
    });
  }

  if (base.vizType !== newer.vizType) {
    changes.push({
      field: 'visualization',
      label: 'Visualization',
      from: base.vizType || '(empty)',
      to: newer.vizType || '(empty)',
    });
  }

  const refIds = new Set([...Object.keys(base.queries), ...Object.keys(newer.queries)]);
  for (const refId of refIds) {
    const from = base.queries[refId];
    const to = newer.queries[refId];
    if (from !== to) {
      changes.push({
        field: 'query',
        label: `Query ${refId}`,
        from: from ?? '(added)',
        to: to ?? '(removed)',
      });
    }
  }

  if (!isEqual(base.thresholds, newer.thresholds)) {
    changes.push({
      field: 'thresholds',
      label: 'Thresholds',
      from: formatThresholds(base.thresholds),
      to: formatThresholds(newer.thresholds),
    });
  }

  return changes;
}

function snapshotChanges(panel: PanelSnapshot): PanelFieldChange[] {
  const changes: PanelFieldChange[] = [];
  if (panel.title) {
    changes.push({ field: 'title', label: 'Title', to: panel.title });
  }
  if (panel.vizType) {
    changes.push({ field: 'visualization', label: 'Visualization', to: panel.vizType });
  }
  for (const [refId, query] of Object.entries(panel.queries)) {
    changes.push({ field: 'query', label: `Query ${refId}`, to: query });
  }
  const thresholds = formatThresholds(panel.thresholds);
  if (thresholds) {
    changes.push({ field: 'thresholds', label: 'Thresholds', to: thresholds });
  }
  return changes;
}

function formatThresholds(thresholds: unknown): string {
  if (thresholds == null) {
    return '';
  }
  try {
    return JSON.stringify(thresholds);
  } catch {
    return String(thresholds);
  }
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function positionsEqual(a: GridPos, b: GridPos): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function sortByGridPosition(a: GridPos, b: GridPos): number {
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  if (a.x !== b.x) {
    return a.x - b.x;
  }
  return a.w - b.w;
}
