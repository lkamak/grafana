import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  createDataFrame,
  FieldColorModeId,
  type FieldConfigSource,
  FieldType,
  type StandardEditorContext,
  type StandardEditorsRegistryItem,
  ThresholdsMode,
} from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';

import { ThresholdFromDataEditor } from './ThresholdFromDataEditor';
import { type ThresholdFromDataInstanceState } from './thresholdFromData';

const frames = [
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    ],
  }),
];

const emptyFieldConfig: FieldConfigSource = {
  defaults: { color: { mode: FieldColorModeId.PaletteClassic }, custom: {} },
  overrides: [],
};

const item: StandardEditorsRegistryItem = {
  id: 'thresholdFromData',
  name: 'Threshold from data',
  editor: ThresholdFromDataEditor,
};

function renderEditor(instanceState?: ThresholdFromDataInstanceState, data = frames) {
  const context: StandardEditorContext<unknown> = {
    data,
    instanceState,
  };

  return render(<ThresholdFromDataEditor value={undefined} onChange={jest.fn()} context={context} item={item} />);
}

describe('ThresholdFromDataEditor', () => {
  it('does not render when the panel has no numeric data', () => {
    renderEditor(undefined, []);
    expect(screen.queryByRole('button', { name: 'Suggest threshold from data (p95)' })).not.toBeInTheDocument();
  });

  it('shows a disabled suggest action until panel edit can apply field config', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Suggest threshold from data (p95)' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('suggests p95, previews points above the line, and keeps the change on accept', async () => {
    const applyFieldConfig = jest.fn();
    renderEditor({ applyFieldConfig, fieldConfig: emptyFieldConfig });

    await userEvent.click(screen.getByRole('button', { name: 'Suggest threshold from data (p95)' }));

    expect(applyFieldConfig).toHaveBeenCalledTimes(1);
    const suggested = applyFieldConfig.mock.calls[0][0] as FieldConfigSource;
    expect(suggested.defaults.thresholds).toEqual({
      mode: ThresholdsMode.Absolute,
      steps: [
        { value: -Infinity, color: 'green' },
        { value: 10, color: 'red' },
      ],
    });
    expect(suggested.defaults.custom.thresholdsStyle.mode).toBe(GraphThresholdsStyleMode.Line);
    expect(screen.getByText('0 of 10 points sit above this line (preview, not an alert rule)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Accept suggested threshold' }));

    expect(applyFieldConfig).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Suggest threshold from data (p95)' })).toBeInTheDocument();
  });

  it('lets the user edit the suggested value and discard back to the snapshot', async () => {
    const applyFieldConfig = jest.fn();
    renderEditor({ applyFieldConfig, fieldConfig: emptyFieldConfig });

    await userEvent.click(screen.getByRole('button', { name: 'Suggest threshold from data (p95)' }));
    const input = screen.getByRole('spinbutton', { name: 'Suggested threshold' });
    await userEvent.clear(input);
    await userEvent.type(input, '8');

    const edited = applyFieldConfig.mock.calls.at(-1)?.[0] as FieldConfigSource;
    expect(edited.defaults.thresholds?.steps[1].value).toBe(8);
    expect(screen.getByText('2 of 10 points sit above this line (preview, not an alert rule)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Discard suggested threshold' }));

    expect(applyFieldConfig).toHaveBeenLastCalledWith(emptyFieldConfig);
    expect(screen.queryByRole('spinbutton', { name: 'Suggested threshold' })).not.toBeInTheDocument();
  });
});
