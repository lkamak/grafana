import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { selectors } from '@grafana/e2e-selectors';
import { TestProvider } from 'test/helpers/TestProvider';

import { VisualDashboardDiff } from './VisualDashboardDiff';

function renderDiff(baseData: object, newData: object) {
  return render(
    <TestProvider>
      <VisualDashboardDiff baseData={baseData} newData={newData} />
    </TestProvider>
  );
}

describe('VisualDashboardDiff', () => {
  it('opens a drawer with human-readable field changes when a changed panel is clicked', async () => {
    const user = userEvent.setup();
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
          type: 'stat',
          title: 'CPU usage',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'cpu_usage' }],
          fieldConfig: { defaults: { thresholds: { mode: 'absolute', steps: [{ value: 0, color: 'green' }] } } },
        },
      ],
    };

    renderDiff(base, current);

    const panelTile = await screen.findByTestId(
      selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(1)
    );
    await user.click(panelTile);

    const drawer = await screen.findByRole('dialog', { name: /CPU usage/i });
    expect(drawer).toHaveTextContent('Title');
    expect(drawer).toHaveTextContent('CPU');
    expect(drawer).toHaveTextContent('Query');
    expect(drawer).toHaveTextContent('Visualization');
    expect(drawer).toHaveTextContent('Thresholds');
    expect(drawer).toHaveTextContent('cpu_usage');
  });

  it('shows tab picker and switches visible panels for tabbed dashboards', async () => {
    const user = userEvent.setup();

    const makeDashboard = () => ({
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
        'panel-b': {
          kind: 'Panel',
          spec: {
            id: 11,
            title: 'Details panel',
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

    renderDiff(makeDashboard(), makeDashboard());

    expect(
      await screen.findByTestId(selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(10))
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(11))
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Details' }));

    expect(
      await screen.findByTestId(selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(11))
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(10))
    ).not.toBeInTheDocument();
  });
});
