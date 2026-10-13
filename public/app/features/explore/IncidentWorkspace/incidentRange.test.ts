import { clampRangeToView, defaultIncidentRange, overlayOffsets, rangeFromTrackPointer } from './incidentRange';

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

  it('keeps a handle drag that meets the other handle inside the view', () => {
    const next = rangeFromTrackPointer(80, 0, 100, view, 'from', { from: 20, to: 40 }, 20);
    expect(next).toEqual({ from: 40, to: 40 });
    expect(clampRangeToView(next, view)).toEqual({ from: 40, to: 40 });
  });

  it('maps a highlight to overlay offsets', () => {
    expect(overlayOffsets({ from: 25, to: 75 }, view)).toEqual({ left: 25, width: 50 });
  });

  it('clips the overlay to the incident instead of the default band', () => {
    expect(overlayOffsets({ from: -10, to: 40 }, view)).toEqual({ left: 0, width: 40 });
    expect(overlayOffsets({ from: 200, to: 300 }, view)).toBeNull();
  });

  it('moves the start handle from a track pointer', () => {
    expect(rangeFromTrackPointer(10, 0, 100, { from: 1000, to: 5000 }, 'from', { from: 2000, to: 4000 }, 25)).toEqual({
      from: 1400,
      to: 4000,
    });
  });

  it('moves the whole highlight when dragging the selected range', () => {
    expect(rangeFromTrackPointer(40, 0, 100, { from: 1000, to: 5000 }, 'range', { from: 2000, to: 4000 }, 25)).toEqual({
      from: 2600,
      to: 4600,
    });
  });
});
