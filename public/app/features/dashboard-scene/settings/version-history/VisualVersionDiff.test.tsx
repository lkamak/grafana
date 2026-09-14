import { fireEvent, render, screen } from '@testing-library/react';

import { TestProvider } from 'test/helpers/TestProvider';

import { VisualVersionDiff } from './VisualVersionDiff';

function renderVisualDiff(lhs: object, rhs: object) {
  return render(
    <TestProvider>
      <VisualVersionDiff lhs={lhs} rhs={rhs} />
    </TestProvider>
  );
}

describe('VisualVersionDiff', () => {
  it('marks panels on the canvas and opens drawer with field changes', () => {
    const lhs = {
      panels: [{ id: 1, type: 'timeseries', title: 'CPU', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
    };
    const rhs = {
      panels: [{ id: 1, type: 'stat', title: 'CPU usage', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
    };

    renderVisualDiff(lhs, rhs);

    const panel = screen.getByTestId('visual-panel-1');
    expect(panel).toHaveAttribute('data-status', 'changed');

    fireEvent.click(panel);

    const drawer = screen.getByRole('dialog');
    expect(drawer).toHaveTextContent('Title');
    expect(drawer).toHaveTextContent('Was: CPU');
    expect(drawer).toHaveTextContent('Now: CPU usage');
    expect(drawer).toHaveTextContent('Visualization');
  });

  it('switches visible panels when tab picker changes', () => {
    const dashboard = {
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: 'Alpha',
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
                title: 'Beta',
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
            title: 'Alpha panel',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        'panel-2': {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Beta panel',
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

    renderVisualDiff(dashboard, dashboard);

    expect(screen.getByTestId('visual-panel-1')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-panel-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));

    expect(screen.getByTestId('visual-panel-2')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-panel-1')).not.toBeInTheDocument();
  });

  it('renders rows of auto-grid as a selectable panel list', () => {
    const dashboard = {
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              kind: 'RowsLayoutRow',
              spec: {
                title: 'Row 1',
                layout: {
                  kind: 'AutoGridLayout',
                  spec: {
                    items: [
                      {
                        kind: 'AutoGridLayoutItem',
                        spec: { element: { kind: 'ElementReference', name: 'panel-1' } },
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
            title: 'Auto row panel',
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

    renderVisualDiff(dashboard, dashboard);

    expect(screen.getByTestId('visual-version-diff-auto-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-version-diff-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-panel-1')).toBeInTheDocument();
  });

  it('opens the field-change drawer when a removed canvas panel is selected', () => {
    const lhs = {
      panels: [{ id: 1, type: 'timeseries', title: 'CPU', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
    };
    const rhs = {
      panels: [],
    };

    renderVisualDiff(lhs, rhs);

    const panel = screen.getByTestId('visual-panel-1');
    expect(panel).toHaveAttribute('data-status', 'removed');
    expect(panel).not.toBeDisabled();

    fireEvent.click(panel);

    const drawer = screen.getByRole('dialog');
    expect(drawer).toHaveTextContent('Title');
    expect(drawer).toHaveTextContent('Was: CPU');
    expect(drawer).toHaveTextContent('Visualization');
  });

  it('renders each tab with its own layout mode', () => {
    const dashboard = {
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              kind: 'TabsLayoutTab',
              spec: {
                title: 'Grid tab',
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
                title: 'Auto tab',
                layout: {
                  kind: 'AutoGridLayout',
                  spec: {
                    items: [
                      {
                        kind: 'AutoGridLayoutItem',
                        spec: { element: { kind: 'ElementReference', name: 'panel-2' } },
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
            title: 'Grid panel',
            data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
            vizConfig: {
              kind: 'VizConfig',
              group: 'timeseries',
              version: '1',
              spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } },
            },
          },
        },
        'panel-2': {
          kind: 'Panel',
          spec: {
            id: 2,
            title: 'Auto panel',
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

    renderVisualDiff(dashboard, dashboard);

    expect(screen.getByTestId('visual-version-diff-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-version-diff-auto-grid')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-panel-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Auto tab' }));

    expect(screen.getByTestId('visual-version-diff-auto-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-version-diff-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-panel-2')).toBeInTheDocument();
  });
});
