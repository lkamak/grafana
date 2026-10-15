import { diffDashboardPanels } from './panelDiff';

function v1Panel(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'timeseries',
    title: `Panel ${id}`,
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    targets: [{ refId: 'A', expr: 'up' }],
    fieldConfig: { defaults: {}, overrides: [] },
    ...overrides,
  };
}

function v2Dashboard(
  elements: Record<string, unknown>,
  layout: Record<string, unknown>
): Record<string, unknown> {
  return { title: 'dash', elements, layout };
}

describe('diffDashboardPanels', () => {
  it('detects added and removed panels', () => {
    const lhs = { panels: [v1Panel(1)] };
    const rhs = { panels: [v1Panel(1), v1Panel(2, { gridPos: { x: 12, y: 0, w: 12, h: 8 } })] };

    const result = diffDashboardPanels(lhs, rhs);
    expect(result.mode).toBe('visual');
    if (result.mode !== 'visual') {
      return;
    }

    const items = result.sections[0].items;
    expect(items.find((i) => i.id === '1')?.status).toBe('unchanged');
    expect(items.find((i) => i.id === '2')?.status).toBe('added');
  });

  it('detects removed panels', () => {
    const lhs = { panels: [v1Panel(1), v1Panel(2)] };
    const rhs = { panels: [v1Panel(1)] };

    const result = diffDashboardPanels(lhs, rhs);
    expect(result.mode).toBe('visual');
    if (result.mode !== 'visual') {
      return;
    }
    expect(result.sections[0].items.find((i) => i.id === '2')?.status).toBe('removed');
  });

  it('detects title, query, viz, and threshold changes', () => {
    const lhs = {
      panels: [
        v1Panel(1, {
          title: 'CPU',
          type: 'timeseries',
          targets: [{ refId: 'A', expr: 'rate(foo)' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ value: 80, color: 'green' }] } } },
        }),
      ],
    };
    const rhs = {
      panels: [
        v1Panel(1, {
          title: 'CPU by host',
          type: 'stat',
          targets: [{ refId: 'A', expr: 'rate(bar)' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ value: 70, color: 'yellow' }] } } },
        }),
      ],
    };

    const result = diffDashboardPanels(lhs, rhs);
    expect(result.mode).toBe('visual');
    if (result.mode !== 'visual') {
      return;
    }
    const item = result.sections[0].items[0];
    expect(item.status).toBe('changed');
    expect(item.changes.map((c) => c.field)).toEqual(
      expect.arrayContaining(['title', 'visualization', 'query', 'thresholds'])
    );
  });

  it('marks position-only changes as changed with previousPosition', () => {
    const lhs = { panels: [v1Panel(1, { gridPos: { x: 0, y: 0, w: 12, h: 8 } })] };
    const rhs = { panels: [v1Panel(1, { gridPos: { x: 12, y: 0, w: 12, h: 8 } })] };

    const result = diffDashboardPanels(lhs, rhs);
    expect(result.mode).toBe('visual');
    if (result.mode !== 'visual') {
      return;
    }
    const item = result.sections[0].items[0];
    expect(item.status).toBe('changed');
    expect(item.previousPosition).toEqual({ x: 0, y: 0, w: 12, h: 8 });
    expect(item.position).toEqual({ x: 12, y: 0, w: 12, h: 8 });
  });

  it('keeps panels in separate tab groups when coordinates overlap', () => {
    const panelA = {
      kind: 'Panel',
      spec: {
        id: 1,
        title: 'A',
        data: { kind: 'QueryGroup', spec: { queries: [] } },
        vizConfig: { kind: 'VizConfig', group: 'timeseries', version: '1', spec: { fieldConfig: { defaults: {} } } },
      },
    };
    const panelB = { ...panelA, spec: { ...panelA.spec, id: 2, title: 'B' } };

    const lhs = v2Dashboard(
      { pa: panelA, pb: panelB },
      {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: 'One',
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
                          element: { kind: 'ElementReference', name: 'pa' },
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
                title: 'Two',
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
                          element: { kind: 'ElementReference', name: 'pb' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      }
    );

    const rhs = structuredClone(lhs);

    const result = diffDashboardPanels(lhs, rhs);
    expect(result.mode).toBe('visual');
    if (result.mode !== 'visual') {
      return;
    }
    expect(result.hasTabs).toBe(true);
    expect(result.sections).toHaveLength(2);
    expect(result.sections.every((s) => s.items[0].status === 'unchanged')).toBe(true);
  });

  it('shows tab moves as removed and added', () => {
    const panel = {
      kind: 'Panel',
      spec: {
        id: 1,
        title: 'Moved',
        data: { kind: 'QueryGroup', spec: { queries: [] } },
        vizConfig: { kind: 'VizConfig', group: 'timeseries', version: '1', spec: { fieldConfig: { defaults: {} } } },
      },
    };

    const gridItem = (name: string) => ({
      kind: 'GridLayoutItem',
      spec: {
        x: 0,
        y: 0,
        width: 12,
        height: 8,
        element: { kind: 'ElementReference', name },
      },
    });

    const tabsLayout = (tab0Element: string, tab1Element: string) => ({
      kind: 'TabsLayout',
      spec: {
        tabs: [
          {
            kind: 'TabsLayoutTab',
            spec: {
              title: 'One',
              layout: { kind: 'GridLayout', spec: { items: [gridItem(tab0Element)] } },
            },
          },
          {
            kind: 'TabsLayoutTab',
            spec: {
              title: 'Two',
              layout: { kind: 'GridLayout', spec: { items: [gridItem(tab1Element)] } },
            },
          },
        ],
      },
    });

    const lhs = v2Dashboard({ p1: panel }, tabsLayout('p1', 'missing'));
    const rhs = v2Dashboard({ p1: panel }, tabsLayout('missing', 'p1'));

    const result = diffDashboardPanels(lhs, rhs);
    expect(result.mode).toBe('visual');
    if (result.mode !== 'visual') {
      return;
    }

    const tabOne = result.sections.find((s) => s.label === 'One');
    const tabTwo = result.sections.find((s) => s.label === 'Two');
    expect(tabOne?.items.find((i) => i.id === 'p1')?.status).toBe('removed');
    expect(tabTwo?.items.find((i) => i.id === 'p1')?.status).toBe('added');
  });

  it('returns schema mismatch for v1 vs v2', () => {
    const lhs = { panels: [v1Panel(1)] };
    const rhs = v2Dashboard(
      {
        p1: {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'x',
            data: { kind: 'QueryGroup', spec: { queries: [] } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '1',
              spec: { fieldConfig: { defaults: {} } },
            },
          },
        },
      },
      {
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
      }
    );

    expect(diffDashboardPanels(lhs, rhs)).toEqual({ mode: 'schema-mismatch' });
  });
});
