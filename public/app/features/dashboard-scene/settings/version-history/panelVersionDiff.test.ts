import { diffDashboardPanels, extractPanels, formatGridPos, type PanelSnapshot } from './panelVersionDiff';

const cpuPanel = {
  id: 1,
  title: 'CPU',
  type: 'timeseries',
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  targets: [{ expr: 'rate(cpu[5m])', refId: 'A' }],
  fieldConfig: {
    defaults: {
      thresholds: {
        mode: 'absolute',
        steps: [
          { value: null, color: 'green' },
          { value: 80, color: 'red' },
        ],
      },
    },
  },
};

const memPanel = {
  id: 2,
  title: 'Memory',
  type: 'gauge',
  gridPos: { x: 12, y: 0, w: 12, h: 8 },
  targets: [{ expr: 'mem_used', refId: 'A' }],
};

describe('extractPanels', () => {
  it('extracts v1 panels and skips row wrappers', () => {
    const panels = extractPanels({
      panels: [
        cpuPanel,
        {
          type: 'row',
          title: 'Collapsed',
          panels: [memPanel],
        },
      ],
    });

    expect(panels).toHaveLength(2);
    expect(panels.map((panel) => panel.id)).toEqual(['1', '2']);
    expect(panels[0]).toMatchObject({
      title: 'CPU',
      type: 'timeseries',
      query: 'rate(cpu[5m])',
      thresholds: 'absolute: -∞ → green, 80 → red',
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
    });
  });

  it('extracts v2 grid layout panels from elements', () => {
    const panels = extractPanels({
      elements: {
        cpu: {
          kind: 'Panel',
          spec: {
            id: 10,
            title: 'CPU',
            vizConfig: { kind: 'VizConfig', group: 'timeseries', spec: { fieldConfig: { defaults: {} } } },
            data: {
              kind: 'QueryGroup',
              spec: {
                queries: [
                  {
                    kind: 'PanelQuery',
                    spec: { refId: 'A', query: { spec: { expr: 'up' } } },
                  },
                ],
              },
            },
          },
        },
      },
      layout: {
        kind: 'GridLayout',
        spec: {
          items: [
            {
              kind: 'GridLayoutItem',
              spec: {
                x: 0,
                y: 2,
                width: 8,
                height: 6,
                element: { kind: 'ElementReference', name: 'cpu' },
              },
            },
          ],
        },
      },
    });

    expect(panels).toEqual<PanelSnapshot[]>([
      {
        id: '10',
        title: 'CPU',
        type: 'timeseries',
        gridPos: { x: 0, y: 2, w: 8, h: 6 },
        query: 'up',
        thresholds: '',
      },
    ]);
  });

  it('uses the element name when a v2 panel has no numeric id', () => {
    const panels = extractPanels({
      elements: {
        errors: {
          kind: 'Panel',
          spec: {
            title: 'Errors',
            vizConfig: { kind: 'VizConfig', group: 'logs', spec: { fieldConfig: { defaults: {} } } },
            data: { kind: 'QueryGroup', spec: { queries: [] } },
          },
        },
      },
      layout: {
        kind: 'GridLayout',
        spec: {
          items: [
            {
              kind: 'GridLayoutItem',
              spec: {
                x: 0,
                y: 0,
                width: 12,
                height: 8,
                element: { kind: 'ElementReference', name: 'errors' },
              },
            },
          ],
        },
      },
    });

    expect(panels[0].id).toBe('errors');
  });

  it('places each tab on the same base offset instead of stacking them', () => {
    const panels = extractPanels(
      tabsDashboard([
        { id: 1, title: 'CPU', y: 0, height: 8 },
        { id: 2, title: 'Memory', y: 0, height: 8 },
      ])
    );

    expect(panels).toHaveLength(2);
    expect(panels[0].gridPos).toEqual({ x: 0, y: 0, w: 12, h: 8 });
    expect(panels[1].gridPos).toEqual({ x: 0, y: 0, w: 12, h: 8 });
  });
});

describe('diffDashboardPanels', () => {
  it('marks added, removed, changed, moved, and unchanged panels', () => {
    const lhs = {
      panels: [
        cpuPanel,
        memPanel,
        {
          id: 3,
          title: 'Disk',
          type: 'stat',
          gridPos: { x: 0, y: 8, w: 12, h: 4 },
          targets: [{ expr: 'disk' }],
        },
        {
          id: 4,
          title: 'Network',
          type: 'timeseries',
          gridPos: { x: 12, y: 8, w: 12, h: 4 },
          targets: [{ expr: 'net' }],
        },
      ],
    };
    const rhs = {
      panels: [
        {
          ...cpuPanel,
          title: 'CPU usage',
          type: 'gauge',
          targets: [{ expr: 'rate(cpu[1m])' }],
          fieldConfig: {
            defaults: {
              thresholds: {
                mode: 'absolute',
                steps: [
                  { value: null, color: 'green' },
                  { value: 90, color: 'red' },
                ],
              },
            },
          },
        },
        { ...memPanel, gridPos: { x: 0, y: 8, w: 12, h: 8 } },
        {
          id: 4,
          title: 'Network',
          type: 'timeseries',
          gridPos: { x: 12, y: 8, w: 12, h: 4 },
          targets: [{ expr: 'net' }],
        },
        {
          id: 5,
          title: 'Errors',
          type: 'logs',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [{ expr: '{job="api"}' }],
        },
      ],
    };

    const diff = diffDashboardPanels(lhs, rhs);
    const byId = Object.fromEntries(diff.map((item) => [item.id, item]));

    expect(byId['1'].kind).toBe('changed');
    expect(byId['1'].changes.map((change) => change.field)).toEqual(['title', 'query', 'visualization', 'thresholds']);
    expect(byId['2'].kind).toBe('moved');
    expect(byId['2'].changes).toEqual([
      { field: 'layout', before: formatGridPos(memPanel.gridPos), after: formatGridPos({ x: 0, y: 8, w: 12, h: 8 }) },
    ]);
    expect(byId['3'].kind).toBe('removed');
    expect(byId['4'].kind).toBe('unchanged');
    expect(byId['5'].kind).toBe('added');
  });

  it('keeps a content change as changed when the panel also moved', () => {
    const lhs = { panels: [cpuPanel] };
    const rhs = {
      panels: [{ ...cpuPanel, title: 'CPU usage', gridPos: { x: 12, y: 0, w: 12, h: 8 } }],
    };

    const [item] = diffDashboardPanels(lhs, rhs);
    expect(item.kind).toBe('changed');
    expect(item.changes.map((change) => change.field)).toEqual(['title', 'layout']);
  });

  it('does not mark later-tab panels as moved when an earlier tab grows', () => {
    const lhs = tabsDashboard([
      { id: 1, title: 'CPU', y: 0, height: 8 },
      { id: 2, title: 'Memory', y: 0, height: 8 },
    ]);
    const rhs = tabsDashboard([
      { id: 1, title: 'CPU', y: 0, height: 16 },
      { id: 2, title: 'Memory', y: 0, height: 8 },
    ]);

    const diff = diffDashboardPanels(lhs, rhs);
    const byId = Object.fromEntries(diff.map((item) => [item.id, item]));

    expect(byId['1'].kind).toBe('moved');
    expect(byId['2'].kind).toBe('unchanged');
    expect(byId['2'].changes).toEqual([]);
  });
});

function tabsDashboard(tabs: Array<{ id: number; title: string; y: number; height: number }>) {
  const elements: Record<string, unknown> = {};
  const tabItems = tabs.map((tab) => {
    const elementName = `panel-${tab.id}`;
    elements[elementName] = {
      kind: 'Panel',
      spec: {
        id: tab.id,
        title: tab.title,
        vizConfig: { kind: 'VizConfig', group: 'timeseries', spec: { fieldConfig: { defaults: {} } } },
        data: { kind: 'QueryGroup', spec: { queries: [] } },
      },
    };

    return {
      kind: 'TabsLayoutTab',
      spec: {
        title: tab.title,
        layout: {
          kind: 'GridLayout',
          spec: {
            items: [
              {
                kind: 'GridLayoutItem',
                spec: {
                  x: 0,
                  y: tab.y,
                  width: 12,
                  height: tab.height,
                  element: { kind: 'ElementReference', name: elementName },
                },
              },
            ],
          },
        },
      },
    };
  });

  return {
    elements,
    layout: {
      kind: 'TabsLayout',
      spec: { tabs: tabItems },
    },
  };
}
