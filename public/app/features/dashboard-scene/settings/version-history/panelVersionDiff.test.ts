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

  it('includes panels stored inside collapsed v1 rows', () => {
    const collapsed = {
      panels: [
        {
          id: 100,
          type: 'row',
          collapsed: true,
          title: 'Metrics',
          gridPos: { x: 0, y: 0, w: 24, h: 1 },
          panels: [
            {
              id: 1,
              type: 'stat',
              title: 'CPU',
              gridPos: { x: 0, y: 1, w: 12, h: 8 },
              targets: [{ refId: 'A', expr: 'cpu' }],
            },
          ],
        },
      ],
    };
    const expanded = {
      panels: [
        {
          id: 100,
          type: 'row',
          collapsed: false,
          title: 'Metrics',
          gridPos: { x: 0, y: 0, w: 24, h: 1 },
          panels: [],
        },
        {
          id: 1,
          type: 'stat',
          title: 'CPU',
          gridPos: { x: 0, y: 1, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu' }],
        },
      ],
    };

    const result = computeVisualPanelVersionDiff(collapsed, expanded);
    const panels = result.tabs[0].panels;

    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe(1);
    expect(panels[0].status).toBe('unchanged');
  });

  it('includes panels inside collapsed v2 rows and keeps later row offsets', () => {
    const makeRowsDashboard = (firstCollapsed: boolean) => ({
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              kind: 'RowsLayoutRow',
              spec: {
                collapse: firstCollapsed,
                title: 'First',
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
                          element: { kind: 'ElementReference', name: 'p1' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            {
              kind: 'RowsLayoutRow',
              spec: {
                collapse: false,
                title: 'Second',
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
                          element: { kind: 'ElementReference', name: 'p2' },
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
        p1: {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'CPU',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'stat',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        p2: {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Memory',
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

    const result = computeVisualPanelVersionDiff(makeRowsDashboard(true), makeRowsDashboard(false));
    const panels = result.tabs[0].panels;

    expect(panels).toHaveLength(2);
    expect(panels.find((p) => p.id === 1)?.status).toBe('unchanged');
    expect(panels.find((p) => p.id === 2)?.status).toBe('unchanged');
    expect(panels.find((p) => p.id === 2)?.current?.gridPos?.y).toBe(8);
  });

  it('includes v2 library panels and detects a library uid swap', () => {
    const makeDashboard = (uid: string) => ({
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
                element: { kind: 'ElementReference', name: 'lib-1' },
              },
            },
          ],
        },
      },
      elements: {
        'lib-1': {
          kind: 'LibraryPanel',
          spec: {
            id: 5,
            title: 'Shared CPU',
            libraryPanel: { uid, name: 'Shared CPU' },
          },
        },
      },
    });

    const added = computeVisualPanelVersionDiff(
      { layout: { kind: 'GridLayout', spec: { items: [] } }, elements: {} },
      makeDashboard('uid-a')
    );
    expect(added.tabs[0].panels).toHaveLength(1);
    expect(added.tabs[0].panels[0].status).toBe('added');
    expect(added.tabs[0].panels[0].id).toBe(5);

    const swapped = computeVisualPanelVersionDiff(makeDashboard('uid-a'), makeDashboard('uid-b'));
    expect(swapped.tabs[0].panels[0].status).toBe('changed');
    expect(swapped.tabs[0].panels[0].fieldChanges).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'libraryPanel', before: 'uid-a', after: 'uid-b' })])
    );
  });

  it('detects a v1 library panel swap with the same title and type', () => {
    const makeDashboard = (uid: string) => ({
      panels: [
        {
          id: 1,
          type: 'timeseries',
          title: 'CPU',
          libraryPanel: { uid, name: 'CPU' },
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
        },
      ],
    });

    const result = computeVisualPanelVersionDiff(makeDashboard('old-uid'), makeDashboard('new-uid'));
    expect(result.tabs[0].panels[0].status).toBe('changed');
    expect(result.tabs[0].panels[0].fieldChanges).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'libraryPanel', before: 'old-uid', after: 'new-uid' })])
    );
  });

  it('keeps duplicate tab titles and sibling tab groups distinct', () => {
    const makeDashboard = () => ({
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              kind: 'RowsLayoutRow',
              spec: {
                title: 'Row A',
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        kind: 'TabsLayoutTab',
                        spec: {
                          title: 'CPU',
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
              },
            },
            {
              kind: 'RowsLayoutRow',
              spec: {
                title: 'Row B',
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        kind: 'TabsLayoutTab',
                        spec: {
                          title: 'CPU',
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
                                    element: { kind: 'ElementReference', name: 'p2' },
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
              },
            },
          ],
        },
      },
      elements: {
        p1: {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'Row A CPU',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'stat',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        p2: {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Row B CPU',
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

    const result = computeVisualPanelVersionDiff(makeDashboard(), makeDashboard());
    expect(result.tabs).toHaveLength(2);
    expect(result.tabs[0].tabTitle).toBe('CPU');
    expect(result.tabs[1].tabTitle).toBe('CPU');
    expect(result.tabs[0].tabId).not.toBe(result.tabs[1].tabId);
    expect(result.tabs[0].panels.map((p) => p.id)).toEqual([1]);
    expect(result.tabs[1].panels.map((p) => p.id)).toEqual([2]);
  });

  it('keeps panels matched when a tab is renamed', () => {
    const makeDashboard = (tabTitle: string) => ({
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
                          height: 8,
                          element: { kind: 'ElementReference', name: 'panel-a' },
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
            title: 'Tab panel',
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

    const result = computeVisualPanelVersionDiff(makeDashboard('Overview'), makeDashboard('Summary'));
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].tabTitle).toBe('Summary');
    expect(result.tabs[0].panels).toHaveLength(1);
    expect(result.tabs[0].panels[0].status).toBe('unchanged');
  });
});
