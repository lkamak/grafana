import { clampRangeToView, defaultIncidentRange, overlayOffsets } from './incidentRange';

const view = { from: 0, to: 100 };

describe('incidentRange', () => {
  it('defaults the highlight to the middle half of the view', () => {
    expect(defaultIncidentRange(view)).toEqual({ from: 25, to: 75 });
  });

  it('clamps a highlight that extends past the view', () => {
    expect(clampRangeToView({ from: -10, to: 110 }, view)).toEqual({ from: 0, to: 100 });
  });

  it('redefaults when the highlight collapses outside the view', () => {
    expect(clampRangeToView({ from: 200, to: 300 }, view)).toEqual({ from: 25, to: 75 });
  });

  it('maps a highlight to overlay offsets', () => {
    expect(overlayOffsets({ from: 25, to: 75 }, view)).toEqual({ left: 25, width: 50 });
  });
});
