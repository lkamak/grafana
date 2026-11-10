import { computeVisualPanelDiff } from './panelDiff';

describe('computeVisualPanelDiff', () => {
  it('detects added and removed v1 panels', () => {
    const lhs = {
      panels: [{ id: 1, type: 'timeseries', title: 'CPU', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
    };
    const rhs = {
      panels: [{ id: 2, type: 'stat', title: 'Memory', gridPos: { x: 12, y: 0, w: 12, h: 8 }, targets: [] }],
    };

    const result = computeVisualPanelDiff(lhs, rhs);
    const entries = result.tabs[0].rows[0].entries;
    expect(entries.find((e) => e.status === 'removed')?.title).toBe('CPU');
    expect(entries.find((e) => e.status === 'added')?.title).toBe('Memory');
  });

  it('detects changed title, query, viz, thresholds, and position', () => {
    const lhs = {
      panels: [
        {
          id: 1,
          type: 'timeseries',
          title: 'Old title',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'up' }],
          fieldConfig: { defaults: { thresholds: { steps: [{ value: 0, color: 'green' }] } } },
        },
      ],
    };
    const rhs = {
      panels: [
        {
          id: 1,
          type: 'stat',
          title: 'New title',
          gridPos: { x: 12, y: 0, w: 8, h: 6 },
          targets: [{ refId: 'A', expr: 'down' }],
          fieldConfig: { defaults: { thresholds: { steps: [{ value: 0, color: 'red' }] } } },
        },
      ],
    };

    const entry = computeVisualPanelDiff(lhs, rhs).tabs[0].rows[0].entries[0];
    expect(entry.status).toBe('changed');
    expect(entry.changes.map((c) => c.field).sort()).toEqual(
      ['position', 'query', 'thresholds', 'title', 'viz'].sort()
    );
  });

  it('normalizes v2 grid layout panels', () => {
    const dashboard = {
      elements: {
        p1: {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'Latency',
            data: { kind: 'QueryGroup', spec: { queries: [{ kind: 'PanelQuery', spec: { refId: 'A', query: { kind: 'DataQuery', spec: { expr: 'latency' } } } }] } },
            vizConfig: { kind: 'VizConfig', group: 'timeseries', version: 'v1', spec: { fieldConfig: { defaults: {} } } },
          },
        },
      },
      layout: {
        kind: 'GridLayout',
        spec: {
          items: [
            {
              kind: 'GridLayoutItem',
              spec: { x: 0, y: 0, width: 12, height: 8, element: { kind: 'ElementReference', name: 'p1' } },
            },
          ],
        },
      },
    };

    const result = computeVisualPanelDiff(dashboard, dashboard);
    const entry = result.tabs[0].rows[0].entries[0];
    expect(entry.status).toBe('unchanged');
    expect(entry.current?.viz).toBe('timeseries');
    expect(entry.current?.queries[0]).toContain('latency');
  });

  it('keeps tabs separate', () => {
    const mkTabDashboard = (tabTitle: string, panelTitle: string) => ({
      elements: {
        p1: {
          kind: 'Panel',
          spec: {
            id: 1,
            title: panelTitle,
            data: { kind: 'QueryGroup', spec: { queries: [] } },
            vizConfig: { kind: 'VizConfig', group: 'stat', version: 'v1', spec: { fieldConfig: { defaults: {} } } },
          },
        },
      },
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: tabTitle,
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
                          height: 4,
                          element: { kind: 'ElementReference', name: 'p1' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    });

    const result = computeVisualPanelDiff(mkTabDashboard('Overview', 'Overview panel'), mkTabDashboard('Details', 'Details panel'));
    expect(result.usesTabs).toBe(true);
    expect(result.tabs).toHaveLength(2);
    expect(result.tabs.find((t) => t.title === 'Overview')?.rows[0].entries[0].title).toBe('Overview panel');
    expect(result.tabs.find((t) => t.title === 'Details')?.rows[0].entries[0].title).toBe('Details panel');
  });

  it('keeps row panels in separate row sections', () => {
    const lhs = {
      panels: [
        { id: 2, type: 'stat', title: 'Top level', gridPos: { x: 0, y: 0, w: 6, h: 4 }, targets: [] },
        { id: 1, type: 'row', title: 'Metrics', gridPos: { x: 0, y: 4, w: 24, h: 1 } },
        { id: 3, type: 'stat', title: 'In row', gridPos: { x: 0, y: 5, w: 6, h: 4 }, targets: [] },
      ],
    };
    const rhs = lhs;

    const rows = computeVisualPanelDiff(lhs, rhs).tabs[0].rows;
    expect(rows.find((r) => r.title === 'Panels')?.entries[0].title).toBe('Top level');
    expect(rows.find((r) => r.title === 'Metrics')?.entries[0].title).toBe('In row');
  });
});
