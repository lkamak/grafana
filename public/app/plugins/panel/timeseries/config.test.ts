import { createFieldConfigRegistry, standardEditorsRegistry } from '@grafana/data';
import { getAllOptionEditors } from 'app/core/components/OptionsUI/registry';

import { defaultGraphConfig, getGraphFieldConfig } from './config';

standardEditorsRegistry.setInit(getAllOptionEditors);

describe('getGraphFieldConfig', () => {
  it('registers suggest-from-data only when the panel can apply field config', () => {
    const shared = createFieldConfigRegistry(getGraphFieldConfig(defaultGraphConfig), 'candlestick');
    expect(shared.getIfExists('custom.thresholdFromData')).toBeUndefined();
    expect(shared.getIfExists('custom.thresholdsStyle')).toBeDefined();

    const timeseries = createFieldConfigRegistry(
      getGraphFieldConfig(defaultGraphConfig, true, { suggestThresholdFromData: true }),
      'timeseries'
    );
    expect(timeseries.getIfExists('custom.thresholdFromData')).toBeDefined();
  });
});
