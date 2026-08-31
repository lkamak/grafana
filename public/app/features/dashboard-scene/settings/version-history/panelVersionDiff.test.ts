import {
  diffDashboardPanels,
  extractPanels,
  formatGridPos,
  listDashboardTabs,
  mergeDashboardTabs,
} from './panelVersionDiff';

describe('panelVersionDiff', () => {
  const baseV1 = {
    panels: [
      {
        id: 1,
        title: 'CPU usage',
        type: 'timeseries',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [{ expr: 'cpu_usage' }],
        fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } } },
      },
      {
        id: 2,
        title: 'Memory',
        type: 'stat',
        gridPos: { x: 12, y: 0, w: 12, h: 8 },
        targets: [{ expr: 'memory_usage' }],
      },
    ],
  };

  it('detects added, removed, changed, and moved panels in v1 dashboards', () => {
    const nextV1 = {
      panels: [
        {
          id: 1,
          title: 'CPU load',
          type: 'timeseries',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ expr: 'cpu_load' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } } },
        },
        {
          id: 2,
          title: 'Memory',
          type: 'stat',
          gridPos: { x: 0, y: 8, w: 12, h: 8 },
          targets: [{ expr: 'memory_usage' }],
        },
        {
          id: 3,
          title: 'Errors',
          type: 'stat',
          gridPos: { x: 12, y: 8, w: 12, h: 8 },
          targets: [{ expr: 'errors_total' }],
        },
      ],
    };

    const diff = diffDashboardPanels(baseV1, nextV1);
    const byId = Object.fromEntries(diff.map((item) => [item.id, item]));

    expect(byId['1'].kind).toBe('changed');
    expect(byId['1'].changes.some((change) => change.field === 'title')).toBe(true);
    expect(byId['1'].changes.some((change) => change.field === 'query')).toBe(true);

    expect(byId['2'].kind).toBe('moved');
    expect(byId['2'].changes.some((change) => change.field === 'layout')).toBe(true);

    expect(byId['3'].kind).toBe('added');
  });

  it('marks removed panels', () => {
    const nextV1 = {
      panels: [
        {
          id: 1,
          title: 'CPU usage',
          type: 'timeseries',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ expr: 'cpu_usage' }],
        },
      ],
    };

    const diff = diffDashboardPanels(baseV1, nextV1);
    const removed = diff.find((item) => item.id === '2');
    expect(removed?.kind).toBe('removed');
  });

  it('extracts panels from v1 row groups', () => {
    const dashboard = {
      panels: [
        {
          type: 'row',
          title: 'Overview',
          panels: [
            {
              id: 10,
              title: 'Nested',
              type: 'stat',
              gridPos: { x: 0, y: 1, w: 6, h: 4 },
            },
          ],
        },
      ],
    };

    const panels = extractPanels(dashboard);
    expect(panels).toHaveLength(1);
    expect(panels[0].title).toBe('Nested');
  });

  it('shifts panels after a collapsed v1 row so they do not overlap hidden children', () => {
    const dashboard = {
      panels: [
        {
          type: 'row',
          title: 'Overview',
          collapsed: true,
          gridPos: { x: 0, y: 0, w: 24, h: 1 },
          panels: [
            {
              id: 1,
              title: 'Inside row',
              type: 'stat',
              gridPos: { x: 0, y: 1, w: 12, h: 8 },
            },
          ],
        },
        {
          id: 2,
          title: 'After row',
          type: 'stat',
          gridPos: { x: 0, y: 1, w: 12, h: 8 },
        },
      ],
    };

    const panels = extractPanels(dashboard);
    expect(panels).toHaveLength(2);
    expect(panels[0].id).toBe('1');
    expect(panels[0].gridPos.y).toBe(1);
    expect(panels[1].id).toBe('2');
    expect(panels[1].gridPos.y).toBe(9);
  });

  it('does not treat collapse-only layout shifts as panel moves', () => {
    const expanded = {
      panels: [
        { type: 'row', collapsed: false, gridPos: { x: 0, y: 0, w: 24, h: 1 }, panels: [] },
        { id: 1, title: 'Inside', type: 'stat', gridPos: { x: 0, y: 1, w: 12, h: 8 } },
        { id: 2, title: 'After', type: 'stat', gridPos: { x: 0, y: 9, w: 12, h: 8 } },
      ],
    };
    const collapsed = {
      panels: [
        {
          type: 'row',
          collapsed: true,
          gridPos: { x: 0, y: 0, w: 24, h: 1 },
          panels: [{ id: 1, title: 'Inside', type: 'stat', gridPos: { x: 0, y: 1, w: 12, h: 8 } }],
        },
        { id: 2, title: 'After', type: 'stat', gridPos: { x: 0, y: 1, w: 12, h: 8 } },
      ],
    };

    const diff = diffDashboardPanels(expanded, collapsed);
    expect(diff.every((item) => item.kind === 'unchanged')).toBe(true);
  });

  it('extracts panels from v2 grid layout', () => {
    const dashboard = {
      elements: {
        panelA: {
          spec: {
            title: 'Panel A',
            vizConfig: { group: 'timeseries' },
            data: { spec: { queries: [{ spec: { query: { spec: { expr: 'up' } } } }] } },
          },
        },
      },
      layout: {
        kind: 'GridLayout',
        spec: {
          items: [{ spec: { element: { name: 'panelA' }, x: 0, y: 0, width: 12, height: 8 } }],
        },
      },
    };

    const panels = extractPanels(dashboard);
    expect(panels).toHaveLength(1);
    expect(panels[0].title).toBe('Panel A');
    expect(panels[0].query).toBe('up');
  });

  it('lists tabs without flattening tab layouts', () => {
    const dashboard = {
      elements: {
        panelA: {
          spec: {
            title: 'Tab one panel',
            vizConfig: { group: 'stat' },
            data: { spec: { queries: [] } },
          },
        },
        panelB: {
          spec: {
            title: 'Tab two panel',
            vizConfig: { group: 'stat' },
            data: { spec: { queries: [] } },
          },
        },
      },
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              metadata: { name: 'tab-one' },
              spec: {
                title: 'Overview',
                layout: {
                  kind: 'GridLayout',
                  spec: {
                    items: [{ spec: { element: { name: 'panelA' }, x: 0, y: 0, width: 12, height: 8 } }],
                  },
                },
              },
            },
            {
              metadata: { name: 'tab-two' },
              spec: {
                title: 'Details',
                layout: {
                  kind: 'GridLayout',
                  spec: {
                    items: [{ spec: { element: { name: 'panelB' }, x: 0, y: 0, width: 12, height: 8 } }],
                  },
                },
              },
            },
          ],
        },
      },
    };

    const tabs = listDashboardTabs(dashboard);
    expect(tabs).toEqual([
      { id: 'tab-one', title: 'Overview' },
      { id: 'tab-two', title: 'Details' },
    ]);

    expect(extractPanels(dashboard)).toHaveLength(0);
    expect(extractPanels(dashboard, 'tab-one')).toHaveLength(1);
    expect(extractPanels(dashboard, 'tab-one')[0].title).toBe('Tab one panel');
    expect(extractPanels(dashboard, 'tab-two')).toHaveLength(1);
    expect(extractPanels(dashboard, 'tab-two')[0].title).toBe('Tab two panel');
  });

  it('lists tabs nested inside a rows layout', () => {
    const dashboard = {
      elements: {
        panelA: {
          spec: {
            title: 'Tab one panel',
            vizConfig: { group: 'stat' },
            data: { spec: { queries: [] } },
          },
        },
        panelB: {
          spec: {
            title: 'Tab two panel',
            vizConfig: { group: 'stat' },
            data: { spec: { queries: [] } },
          },
        },
      },
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              spec: {
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        metadata: { name: 'tab-one' },
                        spec: {
                          title: 'Overview',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'panelA' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                      {
                        metadata: { name: 'tab-two' },
                        spec: {
                          title: 'Details',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'panelB' }, x: 0, y: 0, width: 12, height: 8 } }],
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
    };

    expect(listDashboardTabs(dashboard)).toEqual([
      { id: 'tab-one', title: 'Overview' },
      { id: 'tab-two', title: 'Details' },
    ]);

    expect(extractPanels(dashboard)).toHaveLength(0);
    expect(extractPanels(dashboard, 'tab-one')).toHaveLength(1);
    expect(extractPanels(dashboard, 'tab-one')[0].title).toBe('Tab one panel');
    expect(extractPanels(dashboard, 'tab-two')[0].title).toBe('Tab two panel');
  });

  it('merges tabs from both versions', () => {
    const lhs = {
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              metadata: { name: 'shared' },
              spec: { title: 'Shared', layout: { kind: 'GridLayout', spec: { items: [] } } },
            },
          ],
        },
      },
      elements: {},
    };
    const rhs = {
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              metadata: { name: 'shared' },
              spec: { title: 'Shared', layout: { kind: 'GridLayout', spec: { items: [] } } },
            },
            {
              metadata: { name: 'new-tab' },
              spec: { title: 'New tab', layout: { kind: 'GridLayout', spec: { items: [] } } },
            },
          ],
        },
      },
      elements: {},
    };

    expect(mergeDashboardTabs(lhs, rhs)).toEqual([
      { id: 'shared', title: 'Shared' },
      { id: 'new-tab', title: 'New tab' },
    ]);
  });

  it('returns empty diff for dashboards with no panels', () => {
    expect(diffDashboardPanels({}, {})).toEqual([]);
  });

  it('formats grid positions for display', () => {
    expect(formatGridPos({ x: 0, y: 4, w: 12, h: 8 })).toBe('(0, 4) 12×8');
  });
});
