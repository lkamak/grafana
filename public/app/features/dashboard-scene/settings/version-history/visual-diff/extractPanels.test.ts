import { buildVisualDiff } from './diffPanels';
import { extractPanelsFromSpec } from './extractPanels';

describe('extractPanelsFromSpec', () => {
  it('extracts v1 panels with grid positions', () => {
    const spec = {
      schemaVersion: 39,
      panels: [
        {
          id: 1,
          title: 'CPU',
          type: 'timeseries',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu_usage' }],
        },
      ],
    };

    const result = extractPanelsFromSpec(spec);
    expect(result.schema).toBe('v1');
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].title).toBe('CPU');
    expect(result.panels[0].gridPos).toEqual({ x: 0, y: 0, w: 12, h: 8 });
    expect(result.panels[0].querySummary).toContain('cpu_usage');
  });

  it('extracts v2 grid layout panels', () => {
    const spec = {
      elements: {
        'panel-1': {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'Memory',
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
                        spec: { expr: 'mem_usage' },
                      },
                    },
                  },
                ],
              },
            },
            vizConfig: { kind: 'VizConfig', group: 'timeseries', spec: { fieldConfig: { defaults: {} } } },
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
                width: 8,
                height: 6,
                element: { kind: 'ElementReference', name: 'panel-1' },
              },
            },
          ],
        },
      },
    };

    const result = extractPanelsFromSpec(spec);
    expect(result.schema).toBe('v2');
    expect(result.panels[0].vizType).toBe('timeseries');
    expect(result.panels[0].gridPos).toEqual({ x: 0, y: 0, w: 8, h: 6 });
  });

  it('isolates panels per tab in v2 tabs layout', () => {
    const spec = {
      elements: {
        'panel-a': {
          kind: 'Panel',
          spec: {
            id: 1,
            title: 'Tab A panel',
            data: { kind: 'QueryGroup', spec: { queries: [] } },
            vizConfig: { kind: 'VizConfig', group: 'stat', spec: {} },
          },
        },
        'panel-b': {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Tab B panel',
            data: { kind: 'QueryGroup', spec: { queries: [] } },
            vizConfig: { kind: 'VizConfig', group: 'stat', spec: {} },
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
                          width: 6,
                          height: 4,
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
                title: 'Details',
                layout: {
                  kind: 'GridLayout',
                  spec: {
                    items: [
                      {
                        kind: 'GridLayoutItem',
                        spec: {
                          x: 0,
                          y: 0,
                          width: 6,
                          height: 4,
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
    };

    const result = extractPanelsFromSpec(spec);
    expect(result.tabs).toHaveLength(2);
    expect(result.panels.find((p) => p.id === 1)?.tabTitle).toBe('Overview');
    expect(result.panels.find((p) => p.id === 2)?.tabTitle).toBe('Details');
  });
});

describe('buildVisualDiff', () => {
  const baseV1 = {
    schemaVersion: 39,
    panels: [
      {
        id: 1,
        title: 'Old title',
        type: 'timeseries',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [{ refId: 'A', expr: 'a' }],
      },
    ],
  };

  it('classifies added, removed, changed, and moved panels', () => {
    const newV1 = {
      schemaVersion: 39,
      panels: [
        {
          id: 1,
          title: 'New title',
          type: 'timeseries',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'a' }],
        },
        {
          id: 2,
          title: 'Added panel',
          type: 'stat',
          gridPos: { x: 0, y: 8, w: 6, h: 4 },
          targets: [],
        },
      ],
    };

    const diff = buildVisualDiff(baseV1, newV1);
    expect(diff.canRenderVisual).toBe(true);
    const entries = diff.entriesByTab.default;
    expect(entries.find((e) => e.panel.id === 1)?.status).toBe('changed');
    expect(entries.find((e) => e.panel.id === 1)?.moved).toBe(true);
    expect(entries.find((e) => e.panel.id === 2)?.status).toBe('added');
  });

  it('skips visual diff for mixed v1/v2 schemas', () => {
    const v2 = {
      elements: {},
      layout: { kind: 'GridLayout', spec: { items: [] } },
    };
    const diff = buildVisualDiff(baseV1, v2);
    expect(diff.mixedSchema).toBe(true);
    expect(diff.canRenderVisual).toBe(false);
  });
});
