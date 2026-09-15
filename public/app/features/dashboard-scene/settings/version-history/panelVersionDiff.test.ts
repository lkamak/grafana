import { computeVisualPanelVersionDiff } from './panelVersionDiff';

describe('computeVisualPanelVersionDiff', () => {
  it('classifies v1 panel add, remove, change, and move', () => {
    const base = {
      panels: [
        {
          id: 1,
          type: 'timeseries',
          title: 'CPU',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu' }],
        },
        {
          id: 2,
          type: 'stat',
          title: 'Memory',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'mem' }],
        },
      ],
    };

    const current = {
      panels: [
        {
          id: 1,
          type: 'timeseries',
          title: 'CPU usage',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu' }],
        },
        {
          id: 2,
          type: 'stat',
          title: 'Memory',
          gridPos: { x: 0, y: 8, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'mem' }],
        },
        {
          id: 3,
          type: 'gauge',
          title: 'Disk',
          gridPos: { x: 12, y: 8, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'disk' }],
        },
      ],
    };

    const result = computeVisualPanelVersionDiff(base, current);
    const panels = result.tabs[0].panels;

    expect(panels.find((p) => p.id === 1)?.status).toBe('changed');
    expect(panels.find((p) => p.id === 2)?.status).toBe('moved');
    expect(panels.find((p) => p.id === 3)?.status).toBe('added');
  });

  it('isolates v2 tabs with the same grid coordinates', () => {
    const makeDashboard = (tabATitle: string, tabBTitle: string) => ({
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: tabATitle,
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
                          element: { kind: 'ElementReference', name: 'panel-a' },
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
                          element: { kind: 'ElementReference', name: 'panel-b' },
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
        'panel-a': {
          kind: 'Panel',
          spec: {
            id: 10,
            title: 'Tab A panel',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        'panel-b': {
          kind: 'Panel',
          spec: {
            id: 11,
            title: 'Tab B panel',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'stat',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
      },
    });

    const base = makeDashboard('Overview', 'Details');
    const current = makeDashboard('Overview', 'Details');

    const result = computeVisualPanelVersionDiff(base, current);
    expect(result.hasTabs).toBe(true);
    expect(result.tabs).toHaveLength(2);

    const overview = result.tabs.find((t) => t.tabTitle === 'Overview');
    const details = result.tabs.find((t) => t.tabTitle === 'Details');

    expect(overview?.panels).toHaveLength(1);
    expect(details?.panels).toHaveLength(1);
    expect(overview?.panels[0].id).toBe(10);
    expect(details?.panels[0].id).toBe(11);
  });

  it('detects AutoGrid index moves', () => {
    const makeAutoGridDashboard = (elementOrder: string[]) => ({
      layout: {
        kind: 'AutoGridLayout',
        spec: {
          columnWidthMode: 'standard',
          rowHeightMode: 'standard',
          items: elementOrder.map((name) => ({
            kind: 'AutoGridLayoutItem',
            spec: { element: { kind: 'ElementReference', name } },
          })),
        },
      },
      elements: {
        p1: {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'One',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        p2: {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Two',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
      },
    });

    const base = makeAutoGridDashboard(['p1', 'p2']);
    const current = makeAutoGridDashboard(['p2', 'p1']);

    const result = computeVisualPanelVersionDiff(base, current);
    const panels = result.tabs[0].panels;

    expect(panels.find((p) => p.id === 1)?.status).toBe('moved');
    expect(panels.find((p) => p.id === 2)?.status).toBe('moved');
  });
});
