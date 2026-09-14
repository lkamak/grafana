import { alignTabDescriptors, extractPanelsFromSpec, mergeTabDescriptors } from './extractPanels';
import {
  type ExtractedPanel,
  type PanelChange,
  type PanelDiffEntry,
  type PanelDiffStatus,
  type TabDescriptor,
  type VisualDiffResult,
} from './types';

export function buildVisualDiff(baseSpec: object, newSpec: object): VisualDiffResult {
  const baseExtract = extractPanelsFromSpec(baseSpec);
  const newExtract = extractPanelsFromSpec(newSpec);

  const mixedSchema =
    baseExtract.schema !== newExtract.schema && baseExtract.schema !== 'unknown' && newExtract.schema !== 'unknown';

  const canRenderVisual = !mixedSchema && baseExtract.schema !== 'unknown' && newExtract.schema !== 'unknown';

  alignTabDescriptors(baseExtract, newExtract);
  const tabs = mergeTabDescriptors(baseExtract.tabs, newExtract.tabs);
  const entriesByTab: Record<string, PanelDiffEntry[]> = {};

  for (const tab of tabs) {
    entriesByTab[tab.id] = [];
  }

  if (!canRenderVisual) {
    return { canRenderVisual, mixedSchema, tabs, entriesByTab };
  }

  const baseByKey = indexPanels(baseExtract.panels);
  const newByKey = indexPanels(newExtract.panels);
  const allKeys = new Set([...baseByKey.keys(), ...newByKey.keys()]);

  for (const key of allKeys) {
    const basePanel = baseByKey.get(key);
    const newPanel = newByKey.get(key);

    if (basePanel && newPanel) {
      if (basePanel.tabId !== newPanel.tabId) {
        pushEntry(entriesByTab, {
          status: 'removed',
          moved: false,
          tabId: basePanel.tabId,
          tabTitle: basePanel.tabTitle,
          panel: basePanel,
          basePanel,
          changes: [],
          layoutMode: basePanel.layoutMode,
          flowOrder: basePanel.flowOrder,
        });
        const tabChange: PanelChange = {
          kind: 'tab',
          before: basePanel.tabTitle,
          after: newPanel.tabTitle,
        };
        const { changes } = comparePanels(basePanel, newPanel);
        pushEntry(entriesByTab, {
          status: changes.length > 0 ? 'changed' : 'added',
          moved: true,
          tabId: newPanel.tabId,
          tabTitle: newPanel.tabTitle,
          panel: newPanel,
          basePanel,
          changes: [tabChange, ...changes.filter((c) => c.kind !== 'tab')],
          layoutMode: newPanel.layoutMode,
          flowOrder: newPanel.flowOrder,
        });
      } else {
        const { status, moved, changes } = comparePanels(basePanel, newPanel);
        pushEntry(entriesByTab, {
          status,
          moved,
          tabId: newPanel.tabId,
          tabTitle: newPanel.tabTitle,
          panel: newPanel,
          basePanel,
          changes,
          layoutMode: newPanel.layoutMode,
          flowOrder: newPanel.flowOrder,
        });
      }
    } else if (newPanel) {
      pushEntry(entriesByTab, {
        status: 'added',
        moved: false,
        tabId: newPanel.tabId,
        tabTitle: newPanel.tabTitle,
        panel: newPanel,
        changes: [],
        layoutMode: newPanel.layoutMode,
        flowOrder: newPanel.flowOrder,
      });
    } else if (basePanel) {
      pushEntry(entriesByTab, {
        status: 'removed',
        moved: false,
        tabId: basePanel.tabId,
        tabTitle: basePanel.tabTitle,
        panel: basePanel,
        basePanel,
        changes: [],
        layoutMode: basePanel.layoutMode,
        flowOrder: basePanel.flowOrder,
      });
    }
  }

  for (const tabId of Object.keys(entriesByTab)) {
    entriesByTab[tabId].sort((a, b) => {
      if (a.layoutMode === 'flow' && b.layoutMode === 'flow') {
        return (a.flowOrder ?? 0) - (b.flowOrder ?? 0);
      }
      const ay = a.panel.gridPos?.y ?? a.basePanel?.gridPos?.y ?? 0;
      const by = b.panel.gridPos?.y ?? b.basePanel?.gridPos?.y ?? 0;
      if (ay !== by) {
        return ay - by;
      }
      const ax = a.panel.gridPos?.x ?? a.basePanel?.gridPos?.x ?? 0;
      const bx = b.panel.gridPos?.x ?? b.basePanel?.gridPos?.x ?? 0;
      return ax - bx;
    });
  }

  return { canRenderVisual, mixedSchema, tabs, entriesByTab };
}

function pushEntry(entriesByTab: Record<string, PanelDiffEntry[]>, entry: PanelDiffEntry) {
  if (!entriesByTab[entry.tabId]) {
    entriesByTab[entry.tabId] = [];
  }
  entriesByTab[entry.tabId].push(entry);
}

function indexPanels(panels: ExtractedPanel[]): Map<string, ExtractedPanel> {
  const map = new Map<string, ExtractedPanel>();
  for (const panel of panels) {
    map.set(panel.matchKey, panel);
  }
  return map;
}

function comparePanels(
  base: ExtractedPanel,
  current: ExtractedPanel
): { status: PanelDiffStatus; moved: boolean; changes: PanelChange[] } {
  const changes: PanelChange[] = [];

  if (base.title !== current.title) {
    changes.push({
      kind: 'title',
      before: base.title,
      after: current.title,
    });
  }
  if (base.vizType !== current.vizType) {
    changes.push({
      kind: 'vizType',
      before: base.vizType || '—',
      after: current.vizType || '—',
    });
  }
  if (base.querySummary !== current.querySummary) {
    changes.push({
      kind: 'query',
      before: base.querySummary || '—',
      after: current.querySummary || '—',
    });
  }
  if (base.thresholdsSummary !== current.thresholdsSummary) {
    changes.push({
      kind: 'thresholds',
      before: base.thresholdsSummary || '—',
      after: current.thresholdsSummary || '—',
    });
  }

  const positionChanged = !gridPosEqual(base.gridPos, current.gridPos);
  if (positionChanged && base.gridPos && current.gridPos) {
    changes.push({
      kind: 'position',
      before: formatGridPos(base.gridPos),
      after: formatGridPos(current.gridPos),
    });
  }

  if (base.tabId !== current.tabId) {
    changes.push({
      kind: 'tab',
      before: base.tabTitle,
      after: current.tabTitle,
    });
  }

  const moved = positionChanged || base.tabId !== current.tabId;
  const hasContentChange = changes.some((change) => change.kind !== 'position');
  const status: PanelDiffStatus = hasContentChange ? 'changed' : 'unchanged';

  if (changes.length === 0 && !moved) {
    return { status: 'unchanged', moved: false, changes: [] };
  }

  return { status, moved, changes };
}

function gridPosEqual(a?: ExtractedPanel['gridPos'], b?: ExtractedPanel['gridPos']): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function formatGridPos(gridPos: NonNullable<ExtractedPanel['gridPos']>): string {
  return `x=${gridPos.x}, y=${gridPos.y}, w=${gridPos.w}, h=${gridPos.h}`;
}

export function tabHasDiffEntries(tab: TabDescriptor, entriesByTab: Record<string, PanelDiffEntry[]>): boolean {
  const entries = entriesByTab[tab.id] ?? [];
  return entries.length > 0;
}
