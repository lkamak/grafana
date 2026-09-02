import { isEqual } from 'lodash';

import { isRecord } from 'app/core/utils/isRecord';
import { isDashboardV2Spec } from 'app/features/dashboard/api/utils';

export type VisualPanelChangeKind = 'added' | 'removed' | 'changed' | 'layout-only';

export interface VisualPanelSnapshot {
  key: string;
  title: string;
  type: string;
  panel: unknown;
  layout?: unknown;
}

export interface VisualPanelDiff {
  key: string;
  kind: VisualPanelChangeKind;
  title: string;
  type: string;
  lhs?: VisualPanelSnapshot;
  rhs?: VisualPanelSnapshot;
}

export interface VisualDashboardDiff {
  panels: VisualPanelDiff[];
  hasDashboardLevelChanges: boolean;
  hasMigratedToV2: boolean;
}

const V1_DASHBOARD_LEVEL_KEYS = [
  'title',
  'description',
  'tags',
  'time',
  'timepicker',
  'timezone',
  'weekStart',
  'refresh',
  'templating',
  'annotations',
  'links',
  'fiscalYearStartMonth',
  'graphTooltip',
  'liveNow',
  'editable',
] as const;

const V2_DASHBOARD_LEVEL_KEYS = [
  'title',
  'description',
  'tags',
  'timeSettings',
  'variables',
  'annotations',
  'links',
  'cursorSync',
  'liveNow',
  'editable',
  'preload',
] as const;

/**
 * Classifies panel-level and dashboard-level differences between two dashboard revision specs.
 * Supports v1 (panels[]) and v2 (elements) formats, including mixed-history comparisons.
 */
export function getVisualDashboardDiff(lhs: object, rhs: object): VisualDashboardDiff {
  const lhsPanels = extractPanelSnapshots(lhs);
  const rhsPanels = extractPanelSnapshots(rhs);
  const matched = matchPanels(lhsPanels, rhsPanels);
  const panels: VisualPanelDiff[] = [];

  for (const { key, left, right } of matched) {
    if (left && !right) {
      panels.push({
        key,
        kind: 'removed',
        title: left.title,
        type: left.type,
        lhs: left,
      });
      continue;
    }
    if (!left && right) {
      panels.push({
        key,
        kind: 'added',
        title: right.title,
        type: right.type,
        rhs: right,
      });
      continue;
    }
    if (!left || !right) {
      continue;
    }

    const bodyEqual = isEqual(stripLayout(left), stripLayout(right));
    const layoutEqual = isEqual(left.layout ?? null, right.layout ?? null);

    if (bodyEqual && layoutEqual) {
      continue;
    }

    panels.push({
      key,
      kind: bodyEqual && !layoutEqual ? 'layout-only' : 'changed',
      title: right.title || left.title,
      type: right.type || left.type,
      lhs: left,
      rhs: right,
    });
  }

  return {
    panels,
    hasDashboardLevelChanges: hasDashboardLevelChanges(lhs, rhs),
    hasMigratedToV2: isDashboardV2Spec(rhs) && !isDashboardV2Spec(lhs),
  };
}

function extractPanelSnapshots(dashboard: object): VisualPanelSnapshot[] {
  if (isDashboardV2Spec(dashboard)) {
    return extractV2Panels(dashboard);
  }
  return extractV1Panels(dashboard);
}

function extractV1Panels(dashboard: object): VisualPanelSnapshot[] {
  if (!isRecord(dashboard) || !Array.isArray(dashboard.panels)) {
    return [];
  }

  const snapshots: VisualPanelSnapshot[] = [];

  const addPanel = (panel: unknown) => {
    if (!isRecord(panel)) {
      return;
    }
    // Collapsed rows store children only on row.panels; skip the row itself.
    if (panel.type === 'row') {
      if (Array.isArray(panel.panels)) {
        for (const child of panel.panels) {
          addPanel(child);
        }
      }
      return;
    }
    const id = panel.id;
    const title = typeof panel.title === 'string' ? panel.title : '';
    const type = typeof panel.type === 'string' ? panel.type : '';
    const key = id != null ? String(id) : fallbackKey(title, type);
    snapshots.push({
      key,
      title,
      type,
      panel,
      layout: panel.gridPos,
    });
  };

  for (const panel of dashboard.panels) {
    addPanel(panel);
  }
  return snapshots;
}

function extractV2Panels(dashboard: object): VisualPanelSnapshot[] {
  if (!isRecord(dashboard) || !isRecord(dashboard.elements)) {
    return [];
  }

  const layouts = collectV2Layouts(dashboard.layout);
  const snapshots: VisualPanelSnapshot[] = [];

  for (const [elementKey, element] of Object.entries(dashboard.elements)) {
    if (!isRecord(element)) {
      continue;
    }
    // Library panels and regular panels both preview; skip unknown kinds.
    if (element.kind !== 'Panel' && element.kind !== 'LibraryPanel') {
      continue;
    }
    const spec = isRecord(element.spec) ? element.spec : {};
    const title = typeof spec.title === 'string' ? spec.title : '';
    const type =
      element.kind === 'LibraryPanel'
        ? 'library-panel'
        : isRecord(spec.vizConfig) && typeof spec.vizConfig.group === 'string' && spec.vizConfig.group
          ? spec.vizConfig.group
          : isRecord(spec.vizConfig) && typeof spec.vizConfig.kind === 'string' && spec.vizConfig.kind !== 'VizConfig'
            ? spec.vizConfig.kind
            : '';
    snapshots.push({
      key: elementKey,
      title,
      type,
      panel: element,
      layout: layouts.get(elementKey),
    });
  }

  return snapshots;
}

function collectV2Layouts(layout: unknown, acc = new Map<string, unknown>()): Map<string, unknown> {
  if (!isRecord(layout) || !isRecord(layout.spec)) {
    return acc;
  }

  const { kind, spec } = layout;

  if ((kind === 'GridLayout' || kind === 'AutoGridLayout') && Array.isArray(spec.items)) {
    for (const item of spec.items) {
      if (!isRecord(item) || !isRecord(item.spec)) {
        continue;
      }
      const elementName =
        isRecord(item.spec.element) && typeof item.spec.element.name === 'string' ? item.spec.element.name : undefined;
      if (!elementName) {
        continue;
      }
      if (kind === 'GridLayout') {
        acc.set(elementName, {
          x: item.spec.x,
          y: item.spec.y,
          width: item.spec.width,
          height: item.spec.height,
          // v2 repeat lives on the layout item, not the panel body
          ...('repeat' in item.spec ? { repeat: item.spec.repeat } : {}),
        });
      } else {
        acc.set(elementName, {
          ...('repeat' in item.spec ? { repeat: item.spec.repeat } : {}),
          ...('variableName' in item.spec ? { variableName: item.spec.variableName } : {}),
        });
      }
    }
    return acc;
  }

  if (kind === 'RowsLayout' && Array.isArray(spec.rows)) {
    for (const row of spec.rows) {
      if (isRecord(row) && isRecord(row.spec)) {
        collectV2Layouts(row.spec.layout, acc);
      }
    }
    return acc;
  }

  if (kind === 'TabsLayout' && Array.isArray(spec.tabs)) {
    for (const tab of spec.tabs) {
      if (isRecord(tab) && isRecord(tab.spec)) {
        collectV2Layouts(tab.spec.layout, acc);
      }
    }
    return acc;
  }

  return acc;
}

type MatchedPair = { key: string; left?: VisualPanelSnapshot; right?: VisualPanelSnapshot };

function matchPanels(lhs: VisualPanelSnapshot[], rhs: VisualPanelSnapshot[]): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  const usedRight = new Set<string>();

  for (const left of lhs) {
    const right =
      rhs.find((r) => !usedRight.has(r.key) && r.key === left.key) ??
      rhs.find((r) => !usedRight.has(r.key) && weakMatch(left, r));

    if (right) {
      usedRight.add(right.key);
      pairs.push({ key: left.key, left, right });
    } else {
      pairs.push({ key: left.key, left });
    }
  }

  for (const right of rhs) {
    if (!usedRight.has(right.key)) {
      pairs.push({ key: right.key, right });
    }
  }

  return pairs;
}

function weakMatch(a: VisualPanelSnapshot, b: VisualPanelSnapshot): boolean {
  if (!a.title || !b.title || !a.type || !b.type) {
    return false;
  }
  return a.title === b.title && a.type === b.type;
}

function stripLayout(snapshot: VisualPanelSnapshot): unknown {
  if (!isRecord(snapshot.panel)) {
    return snapshot.panel;
  }

  // v1 panel: omit gridPos
  if ('gridPos' in snapshot.panel || 'type' in snapshot.panel) {
    const { gridPos: _gridPos, ...rest } = snapshot.panel;
    return rest;
  }

  // v2 element: panel body only (layout is separate)
  return snapshot.panel;
}

function hasDashboardLevelChanges(lhs: object, rhs: object): boolean {
  const lhsLevel = pickDashboardLevel(lhs);
  const rhsLevel = pickDashboardLevel(rhs);
  return !isEqual(lhsLevel, rhsLevel);
}

function pickDashboardLevel(dashboard: object): Record<string, unknown> {
  if (!isRecord(dashboard)) {
    return {};
  }
  const keys = isDashboardV2Spec(dashboard) ? V2_DASHBOARD_LEVEL_KEYS : V1_DASHBOARD_LEVEL_KEYS;
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in dashboard) {
      picked[key] = dashboard[key];
    }
  }
  return picked;
}

function fallbackKey(title: string, type: string): string {
  return `title:${title}|type:${type}`;
}
