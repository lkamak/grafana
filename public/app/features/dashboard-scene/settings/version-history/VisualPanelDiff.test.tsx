import { fireEvent, render, screen } from '@testing-library/react';

import { TestProvider } from 'test/helpers/TestProvider';

import { VisualPanelDiff } from './VisualPanelDiff';

function tabbedDashboard(tabTitle: string, panelTitle: string, y: number) {
  return {
    elements: {
      p1: {
        kind: 'Panel',
        spec: {
          id: 1,
          title: panelTitle,
          data: { kind: 'QueryGroup', spec: { queries: [] } },
          vizConfig: { kind: 'VizConfig', group: 'stat', version: 'v1', spec: { fieldConfig: { defaults: {} } } },
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
              title: tabTitle,
              layout: {
                kind: 'GridLayout',
                spec: {
                  items: [
                    {
                      kind: 'GridLayoutItem',
                      spec: {
                        x: 0,
                        y,
                        width: 12,
                        height: 4,
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
  };
}

describe('VisualPanelDiff', () => {
  it('shows only the selected tab panels and detail on changed panel click', () => {
    const lhs = tabbedDashboard('Overview', 'Overview panel', 0);
    const rhs = tabbedDashboard('Details', 'Details panel', 0);

    render(
      <TestProvider>
        <VisualPanelDiff lhs={lhs} rhs={rhs} />
      </TestProvider>
    );

    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Overview panel')).toBeInTheDocument();
    expect(screen.queryByText('Details panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Details panel')).toBeInTheDocument();
    expect(screen.queryByText('Overview panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('panel-diff-p1'));
    expect(screen.getByTestId('panel-diff-detail')).toBeInTheDocument();
    expect(screen.getByText('Panel was added in the newer version.')).toBeInTheDocument();
  });
});
