import { getVisualDashboardDiff } from './getVisualDashboardDiff';

describe('getVisualDashboardDiff', () => {
  it('returns empty panels for identical dashboards', () => {
    const dash = {
      title: 'Same',
      panels: [{ id: 1, title: 'A', type: 'timeseries', gridPos: { x: 0, y: 0, w: 12, h: 8 } }],
    };

    const result = getVisualDashboardDiff(dash, structuredClone(dash));

    expect(result.panels).toEqual([]);
    expect(result.hasDashboardLevelChanges).toBe(false);
    expect(result.hasMigratedToV2).toBe(false);
  });

  it('matches v1 panels by id and classifies changed specs', () => {
    const lhs = {
      title: 'Dash',
      panels: [
        { id: 1, title: 'CPU', type: 'timeseries', targets: [{ refId: 'A' }], gridPos: { x: 0, y: 0, w: 12, h: 8 } },
      ],
    };
    const rhs = {
      title: 'Dash',
      panels: [
        {
          id: 1,
          title: 'CPU',
          type: 'timeseries',
          targets: [{ refId: 'A' }, { refId: 'B' }],
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
        },
      ],
    };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toHaveLength(1);
    expect(result.panels[0]).toMatchObject({ key: '1', kind: 'changed', title: 'CPU', type: 'timeseries' });
    expect(result.panels[0].lhs).toBeDefined();
    expect(result.panels[0].rhs).toBeDefined();
  });

  it('classifies layout-only when only gridPos changes', () => {
    const panelBody = { id: 2, title: 'Mem', type: 'stat', targets: [{ refId: 'A' }] };
    const lhs = { title: 'Dash', panels: [{ ...panelBody, gridPos: { x: 0, y: 0, w: 6, h: 4 } }] };
    const rhs = { title: 'Dash', panels: [{ ...panelBody, gridPos: { x: 6, y: 0, w: 6, h: 4 } }] };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toEqual([
      expect.objectContaining({ key: '2', kind: 'layout-only', title: 'Mem', type: 'stat' }),
    ]);
  });

  it('classifies added and removed panels', () => {
    const lhs = {
      title: 'Dash',
      panels: [{ id: 1, title: 'Old', type: 'text', gridPos: { x: 0, y: 0, w: 12, h: 4 } }],
    };
    const rhs = {
      title: 'Dash',
      panels: [{ id: 2, title: 'New', type: 'timeseries', gridPos: { x: 0, y: 0, w: 12, h: 8 } }],
    };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: '1', kind: 'removed', title: 'Old' }),
        expect.objectContaining({ key: '2', kind: 'added', title: 'New' }),
      ])
    );
  });

  it('skips row panels in v1', () => {
    const lhs = {
      title: 'Dash',
      panels: [
        { id: 10, title: 'Row', type: 'row' },
        { id: 1, title: 'P', type: 'text', gridPos: { x: 0, y: 1, w: 12, h: 4 } },
      ],
    };
    const rhs = structuredClone(lhs);

    expect(getVisualDashboardDiff(lhs, rhs).panels).toEqual([]);
  });

  it('includes panels nested on collapsed rows', () => {
    const child = {
      id: 2,
      title: 'Nested',
      type: 'stat',
      targets: [{ refId: 'A' }],
      gridPos: { x: 0, y: 1, w: 12, h: 4 },
    };
    const lhs = {
      title: 'Dash',
      panels: [{ id: 10, title: 'Row', type: 'row', collapsed: true, panels: [child] }],
    };
    const rhs = {
      title: 'Dash',
      panels: [
        {
          id: 10,
          title: 'Row',
          type: 'row',
          collapsed: true,
          panels: [{ ...child, targets: [{ refId: 'A' }, { refId: 'B' }] }],
        },
      ],
    };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toEqual([
      expect.objectContaining({ key: '2', kind: 'changed', title: 'Nested', type: 'stat' }),
    ]);
  });

  it('does not treat row collapse-state-only moves as added or removed panels', () => {
    const child = {
      id: 2,
      title: 'Nested',
      type: 'stat',
      targets: [{ refId: 'A' }],
      gridPos: { x: 0, y: 1, w: 12, h: 4 },
    };
    const collapsed = {
      title: 'Dash',
      panels: [{ id: 10, title: 'Row', type: 'row', collapsed: true, panels: [child] }],
    };
    const expanded = {
      title: 'Dash',
      panels: [{ id: 10, title: 'Row', type: 'row', collapsed: false, panels: [] }, { ...child }],
    };

    expect(getVisualDashboardDiff(collapsed, expanded).panels).toEqual([]);
  });

  it('falls back to title+type when ids differ', () => {
    const lhs = {
      title: 'Dash',
      panels: [{ id: 1, title: 'Shared', type: 'gauge', options: { a: 1 }, gridPos: { x: 0, y: 0, w: 6, h: 4 } }],
    };
    const rhs = {
      title: 'Dash',
      panels: [{ id: 99, title: 'Shared', type: 'gauge', options: { a: 2 }, gridPos: { x: 0, y: 0, w: 6, h: 4 } }],
    };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].kind).toBe('changed');
    expect(result.panels[0].lhs?.title).toBe('Shared');
    expect(result.panels[0].rhs?.title).toBe('Shared');
  });

  it('matches v2 elements by key and detects layout-only', () => {
    const element = {
      kind: 'Panel',
      spec: {
        id: 1,
        title: 'V2 Panel',
        description: '',
        links: [],
        data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
        vizConfig: {
          kind: 'VizConfig',
          group: 'timeseries',
          version: '',
          spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
        },
      },
    };
    const lhs = {
      title: 'V2',
      elements: { 'panel-1': element },
      layout: {
        kind: 'GridLayout',
        spec: {
          items: [
            {
              kind: 'GridLayoutItem',
              spec: { x: 0, y: 0, width: 12, height: 8, element: { kind: 'ElementReference', name: 'panel-1' } },
            },
          ],
        },
      },
    };
    const rhs = {
      title: 'V2',
      elements: { 'panel-1': structuredClone(element) },
      layout: {
        kind: 'GridLayout',
        spec: {
          items: [
            {
              kind: 'GridLayoutItem',
              spec: { x: 12, y: 0, width: 12, height: 8, element: { kind: 'ElementReference', name: 'panel-1' } },
            },
          ],
        },
      },
    };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toEqual([
      expect.objectContaining({ key: 'panel-1', kind: 'layout-only', title: 'V2 Panel', type: 'timeseries' }),
    ]);
  });

  it('handles mixed v1↔v2 history with title fallback and migration flag', () => {
    const lhs = {
      title: 'Old format',
      panels: [
        { id: 1, title: 'CPU', type: 'timeseries', targets: [{ refId: 'A' }], gridPos: { x: 0, y: 0, w: 12, h: 8 } },
      ],
    };
    const rhs = {
      title: 'New format',
      elements: {
        'panel-1': {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'CPU',
            description: '',
            links: [],
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
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
              spec: { x: 0, y: 0, width: 12, height: 8, element: { kind: 'ElementReference', name: 'panel-1' } },
            },
          ],
        },
      },
    };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.hasMigratedToV2).toBe(true);
    expect(result.hasDashboardLevelChanges).toBe(true);
    expect(result.panels.length).toBeGreaterThanOrEqual(1);
    expect(result.panels.some((p) => p.title === 'CPU')).toBe(true);
  });

  it('flags dashboard-level title changes without panel diffs', () => {
    const panel = { id: 1, title: 'P', type: 'text', gridPos: { x: 0, y: 0, w: 12, h: 4 } };
    const lhs = { title: 'A', panels: [panel] };
    const rhs = { title: 'B', panels: [structuredClone(panel)] };

    const result = getVisualDashboardDiff(lhs, rhs);

    expect(result.panels).toEqual([]);
    expect(result.hasDashboardLevelChanges).toBe(true);
  });
});
