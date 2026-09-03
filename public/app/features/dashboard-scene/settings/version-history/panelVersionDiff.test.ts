import {
  diffDashboardPanels,
  extractPanels,
  formatGridPos,
  listDashboardTabGroups,
  listDashboardTabs,
  mergeDashboardTabGroups,
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

  it('keeps sibling tab groups independent when one tab is selected', () => {
    const dashboard = siblingTabGroupsDashboard();

    expect(listDashboardTabGroups(dashboard)).toEqual([
      {
        id: 'rows/0',
        tabs: [
          { id: 'cpu', title: 'CPU' },
          { id: 'memory', title: 'Memory' },
        ],
      },
      {
        id: 'rows/1',
        tabs: [
          { id: 'app', title: 'App' },
          { id: 'system', title: 'System' },
        ],
      },
    ]);

    const cpuSelected = extractPanels(dashboard, 'cpu');
    expect(cpuSelected.map((panel) => panel.title)).toEqual(['CPU panel', 'App panel']);

    const independent = extractPanels(dashboard, { 'rows/0': 'memory', 'rows/1': 'system' });
    expect(independent.map((panel) => panel.title)).toEqual(['Memory panel', 'System panel']);
  });

  it('collects nested tab panels after a parent tab is selected', () => {
    const dashboard = nestedTabsDashboard();

    expect(listDashboardTabGroups(dashboard)).toEqual([
      { id: 'root', tabs: [{ id: 'parent', title: 'Parent' }] },
      {
        id: 'root/parent',
        tabs: [
          { id: 'inner-a', title: 'Inner A' },
          { id: 'inner-b', title: 'Inner B' },
        ],
      },
    ]);

    expect(extractPanels(dashboard, 'parent')).toHaveLength(1);
    expect(extractPanels(dashboard, 'parent')[0].title).toBe('Inner A panel');

    expect(extractPanels(dashboard, { root: 'parent', 'root/parent': 'inner-b' })[0].title).toBe('Inner B panel');
  });

  it('does not substitute another tab when the selected tab is missing from a version', () => {
    const lhs = {
      elements: {
        overview: v2Panel('Overview panel'),
      },
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [{ metadata: { name: 'overview' }, spec: { title: 'Overview', layout: v2Grid('overview') } }],
        },
      },
    };
    const rhs = {
      elements: {
        overview: v2Panel('Overview panel'),
        added: v2Panel('New panel'),
      },
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            { metadata: { name: 'new-tab' }, spec: { title: 'New', layout: v2Grid('added') } },
            { metadata: { name: 'overview' }, spec: { title: 'Overview', layout: v2Grid('overview') } },
          ],
        },
      },
    };

    expect(extractPanels(lhs, { root: 'new-tab' })).toEqual([]);
    expect(extractPanels(rhs, { root: 'new-tab' }).map((panel) => panel.title)).toEqual(['New panel']);

    const diff = diffDashboardPanels(lhs, rhs, { root: 'new-tab' });
    expect(diff).toHaveLength(1);
    expect(diff[0].kind).toBe('added');
    expect(diff[0].next?.title).toBe('New panel');
  });

  it('merges sibling tab groups from both versions', () => {
    const lhs = siblingTabGroupsDashboard();
    const rhs = {
      ...lhs,
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            lhs.layout.spec.rows[0],
            {
              spec: {
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      ...lhs.layout.spec.rows[1].spec.layout.spec.tabs,
                      {
                        metadata: { name: 'audit' },
                        spec: {
                          title: 'Audit',
                          layout: v2Grid('unused'),
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

    expect(mergeDashboardTabGroups(lhs, rhs)).toEqual([
      {
        id: 'rows/0',
        tabs: [
          { id: 'cpu', title: 'CPU' },
          { id: 'memory', title: 'Memory' },
        ],
      },
      {
        id: 'rows/1',
        tabs: [
          { id: 'app', title: 'App' },
          { id: 'system', title: 'System' },
          { id: 'audit', title: 'Audit' },
        ],
      },
    ]);
  });
});

function v2Panel(title: string) {
  return {
    spec: {
      title,
      vizConfig: { group: 'stat' },
      data: { spec: { queries: [] } },
    },
  };
}

function v2Grid(elementName: string) {
  return {
    kind: 'GridLayout',
    spec: {
      items: [{ spec: { element: { name: elementName }, x: 0, y: 0, width: 12, height: 8 } }],
    },
  };
}

function siblingTabGroupsDashboard() {
  return {
    elements: {
      cpu: v2Panel('CPU panel'),
      memory: v2Panel('Memory panel'),
      app: v2Panel('App panel'),
      system: v2Panel('System panel'),
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
                    { metadata: { name: 'cpu' }, spec: { title: 'CPU', layout: v2Grid('cpu') } },
                    { metadata: { name: 'memory' }, spec: { title: 'Memory', layout: v2Grid('memory') } },
                  ],
                },
              },
            },
          },
          {
            spec: {
              layout: {
                kind: 'TabsLayout',
                spec: {
                  tabs: [
                    { metadata: { name: 'app' }, spec: { title: 'App', layout: v2Grid('app') } },
                    { metadata: { name: 'system' }, spec: { title: 'System', layout: v2Grid('system') } },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
}

function nestedTabsDashboard() {
  return {
    elements: {
      innerA: v2Panel('Inner A panel'),
      innerB: v2Panel('Inner B panel'),
    },
    layout: {
      kind: 'TabsLayout',
      spec: {
        tabs: [
          {
            metadata: { name: 'parent' },
            spec: {
              title: 'Parent',
              layout: {
                kind: 'TabsLayout',
                spec: {
                  tabs: [
                    { metadata: { name: 'inner-a' }, spec: { title: 'Inner A', layout: v2Grid('innerA') } },
                    { metadata: { name: 'inner-b' }, spec: { title: 'Inner B', layout: v2Grid('innerB') } },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
}
