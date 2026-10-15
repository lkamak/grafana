import {
  computeVisualPanelVersionDiff,
  formatQueriesForDisplay,
  formatThresholdsForDisplay,
  getDefaultTabId,
} from './panelVersionDiff';

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
    expect(result.tabs[0].titlePath).toEqual(['Row A', 'CPU']);
    expect(result.tabs[1].titlePath).toEqual(['Row B', 'CPU']);
    expect(result.tabs[0].tabId).not.toBe(result.tabs[1].tabId);
    expect(result.tabs[0].panels.map((p) => p.id)).toEqual([1]);
    expect(result.tabs[1].panels.map((p) => p.id)).toEqual([2]);
  });

  it('does not include inner row titles in a tab title path', () => {
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
                            kind: 'RowsLayout',
                            spec: {
                              rows: [
                                {
                                  kind: 'RowsLayoutRow',
                                  spec: {
                                    title: 'Metrics',
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
    expect(result.tabs[0].titlePath).toEqual(['Row A', 'CPU']);
    expect(result.tabs[1].titlePath).toEqual(['Row B', 'CPU']);
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

  it('formats query and threshold field changes for display', () => {
    const base = {
      panels: [
        {
          id: 1,
          type: 'timeseries',
          title: 'CPU',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu' }],
        },
      ],
    };
    const current = {
      panels: [
        {
          id: 1,
          type: 'timeseries',
          title: 'CPU',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu_usage' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ value: 0, color: 'green' }] } } },
        },
      ],
    };

    const entry = computeVisualPanelVersionDiff(base, current).tabs[0].panels[0];
    const queryChange = entry.fieldChanges.find((c) => c.field === 'query');
    const thresholdChange = entry.fieldChanges.find((c) => c.field === 'thresholds');

    expect(queryChange?.before).toBe('A: cpu');
    expect(queryChange?.after).toBe('A: cpu_usage');
    expect(thresholdChange?.before).toBe('—');
    expect(thresholdChange?.after).toBe('absolute: 0=green');
  });

  it('shows panels from a tabbed version when the other version is empty', () => {
    const tabbed = {
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: 'Overview',
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
            title: 'Overview panel',
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
    };

    const diff = computeVisualPanelVersionDiff(tabbed, { panels: [] });

    expect(diff.tabs.every((tab) => tab.panels.length > 0)).toBe(true);
    expect(diff.tabs.find((tab) => tab.tabId === '__default__')).toBeUndefined();
    expect(getDefaultTabId(diff)).toBe(diff.tabs[0].tabId);
    expect(diff.tabs[0].panels[0].status).toBe('removed');
  });

  it('keeps an empty default tab only when neither version has panels', () => {
    const diff = computeVisualPanelVersionDiff({ panels: [] }, { panels: [] });

    expect(diff.tabs).toHaveLength(1);
    expect(diff.tabs[0].tabId).toBe('__default__');
    expect(diff.tabs[0].panels).toHaveLength(0);
    expect(getDefaultTabId(diff)).toBe('__default__');
  });

  it('leaves the default group title empty so the picker can label it', () => {
    const dashboard = {
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              kind: 'RowsLayoutRow',
              spec: {
                title: 'Row',
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        kind: 'TabsLayoutTab',
                        spec: {
                          title: 'Overview',
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
              },
            },
            {
              kind: 'RowsLayoutRow',
              spec: {
                title: 'Loose',
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
            id: 1,
            title: 'Tabbed',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'stat',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        'panel-b': {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Loose',
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
    };

    const diff = computeVisualPanelVersionDiff(dashboard, dashboard);
    const defaultTab = diff.tabs.find((tab) => tab.tabId === '__default__');
    const untitled = computeVisualPanelVersionDiff(untitledTabDashboard(), untitledTabDashboard());

    expect(defaultTab?.tabTitle).toBe('');
    expect(defaultTab?.panels.map((panel) => panel.id)).toEqual([2]);
    expect(untitled.tabs[0].tabId).toBe('tab-0');
    expect(untitled.tabs[0].tabTitle).toBe('');
  });

  it('treats equivalent v1 and v2 queries as unchanged', () => {
    const same = computeVisualPanelVersionDiff(
      v1QueryDashboard({ expr: 'cpu', legendFormat: '{{instance}}' }),
      v2QueryDashboard({ expr: 'cpu', legendFormat: '{{instance}}' })
    );
    expect(same.tabs[0].panels[0].status).toBe('unchanged');
    expect(same.tabs[0].panels[0].fieldChanges.find((change) => change.field === 'query')).toBeUndefined();

    expect(
      computeVisualPanelVersionDiff(
        v1QueryDashboard({ query: 'stats.gauges.*' }),
        v2QueryDashboard({ query: 'stats.gauges.*' })
      ).tabs[0].panels[0].status
    ).toBe('unchanged');
    expect(
      computeVisualPanelVersionDiff(v1QueryDashboard({ rawSql: 'SELECT 1' }), v2QueryDashboard({ rawSql: 'SELECT 1' }))
        .tabs[0].panels[0].status
    ).toBe('unchanged');

    const changed = computeVisualPanelVersionDiff(
      v1QueryDashboard({ expr: 'cpu' }),
      v2QueryDashboard({ expr: 'cpu_usage' })
    );
    expect(changed.tabs[0].panels[0].status).toBe('changed');
    expect(changed.tabs[0].panels[0].fieldChanges).toEqual([
      expect.objectContaining({ field: 'query', before: 'A: cpu', after: 'A: cpu_usage' }),
    ]);
  });
});

function v1QueryDashboard(target: Record<string, unknown>) {
  return {
    panels: [
      {
        id: 1,
        type: 'timeseries',
        title: 'CPU',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [{ refId: 'A', ...target }],
      },
    ],
  };
}

function v2QueryDashboard(querySpec: Record<string, unknown>) {
  return {
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
    elements: {
      'panel-1': {
        kind: 'Panel',
        spec: {
          id: 1,
          title: 'CPU',
          data: {
            kind: 'QueryGroup',
            spec: {
              queries: [
                {
                  kind: 'PanelQuery',
                  spec: {
                    refId: 'A',
                    query: {
                      kind: 'DataQuery',
                      group: 'prometheus',
                      version: 'v0',
                      spec: querySpec,
                    },
                  },
                },
              ],
            },
          },
          vizConfig: {
            kind: 'VizConfig',
            group: 'timeseries',
            version: '1',
            spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
          },
        },
      },
    },
  };
}

function untitledTabDashboard() {
  return {
    layout: {
      kind: 'TabsLayout',
      spec: {
        tabs: [
          {
            kind: 'TabsLayoutTab',
            spec: {
              title: '',
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
          id: 1,
          title: 'Untitled tab panel',
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
  };
}

describe('formatQueriesForDisplay', () => {
  it('returns em dash for empty serialized queries', () => {
    expect(formatQueriesForDisplay('')).toBe('—');
  });

  it('formats v1 string fields and v2 DataQuery objects', () => {
    expect(formatQueriesForDisplay(JSON.stringify([{ refId: 'A', expr: 'cpu' }]))).toBe('A: cpu');
    expect(formatQueriesForDisplay(JSON.stringify([{ refId: 'A', query: 'stats.gauges.*' }]))).toBe(
      'A: stats.gauges.*'
    );
    expect(formatQueriesForDisplay(JSON.stringify([{ refId: 'A', rawSql: 'SELECT 1' }]))).toBe('A: SELECT 1');

    const v2 = JSON.stringify([
      {
        refId: 'A',
        query: { kind: 'DataQuery', group: 'prometheus', spec: { expr: 'up' } },
      },
      {
        refId: 'B',
        query: { kind: 'DataQuery', group: 'mysql', spec: { rawSql: 'SELECT 1' } },
      },
      {
        refId: 'C',
        query: { kind: 'DataQuery', group: 'graphite', spec: { query: 'stats.gauges.*' } },
      },
    ]);
    expect(formatQueriesForDisplay(v2)).toBe('A: up; B: SELECT 1; C: stats.gauges.*');
    expect(formatQueriesForDisplay(v2)).not.toContain('[object Object]');
  });
});

describe('formatThresholdsForDisplay', () => {
  it('returns em dash for empty serialized thresholds', () => {
    expect(formatThresholdsForDisplay('')).toBe('—');
  });
});
