import { buildFieldChanges, buildVisualDiff } from './visualDiff';

describe('buildVisualDiff', () => {
  it('classifies v1 panel add, remove, change, and move', () => {
    const lhs = {
      panels: [
        { id: 1, type: 'timeseries', title: 'CPU', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [{ refId: 'A', expr: 'up' }] },
        { id: 2, type: 'stat', title: 'Memory', gridPos: { x: 12, y: 0, w: 12, h: 8 }, targets: [] },
      ],
    };
    const rhs = {
      panels: [
        { id: 1, type: 'timeseries', title: 'CPU usage', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [{ refId: 'A', expr: 'up' }] },
        { id: 3, type: 'gauge', title: 'Disk', gridPos: { x: 12, y: 0, w: 12, h: 8 }, targets: [] },
        { id: 2, type: 'stat', title: 'Memory', gridPos: { x: 0, y: 8, w: 12, h: 8 }, targets: [] },
      ],
    };

    const result = buildVisualDiff(lhs, rhs);
    const items = result.itemsByTab.default;

    expect(items.find((p) => p.id === 1)?.status).toBe('changed');
    expect(items.find((p) => p.id === 2)?.status).toBe('moved');
    expect(items.find((p) => p.id === 3)?.status).toBe('added');
    expect(items.some((p) => p.status === 'removed')).toBe(false);
  });

  it('isolates v2 tabs so panels on tab B are not shown on tab A', () => {
    const mkDashboard = (tabBTitle: string) => ({
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: 'Tab A',
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
                          element: { kind: 'ElementReference', name: 'panel-1' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: tabBTitle,
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
                          element: { kind: 'ElementReference', name: 'panel-2' },
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
      elements: {
        'panel-1': {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'On tab A',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: { kind: 'VizConfig', group: 'timeseries', version: '1', spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } } },
          },
        },
        'panel-2': {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'On tab B',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: { kind: 'VizConfig', group: 'stat', version: '1', spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } } },
          },
        },
      },
    });

    const lhs = mkDashboard('Tab B');
    const rhs = mkDashboard('Tab B');

    const result = buildVisualDiff(lhs, rhs);
    const tabAId = result.tabs.find((t) => t.title === 'Tab A')!.id;
    const tabBId = result.tabs.find((t) => t.title === 'Tab B')!.id;

    expect(result.itemsByTab[tabAId].map((p) => p.id)).toEqual([1]);
    expect(result.itemsByTab[tabBId].map((p) => p.id)).toEqual([2]);
  });

  it('builds human-readable field changes for title, query, viz, thresholds, and position', () => {
    const lhs = {
      panels: [
        {
          id: 10,
          type: 'timeseries',
          title: 'Old',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'old' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] } } },
        },
      ],
    };
    const rhs = {
      panels: [
        {
          id: 10,
          type: 'stat',
          title: 'New',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'new' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }] } } },
        },
      ],
    };

    const item = buildVisualDiff(lhs, rhs).itemsByTab.default[0];
    const labels = buildFieldChanges(item.lhs, item.rhs).map((c) => c.label);

    expect(labels).toContain('Title');
    expect(labels).toContain('Visualization');
    expect(labels).toContain('Query A');
    expect(labels).toContain('Thresholds');
    expect(labels).toContain('Position');
  });
});
