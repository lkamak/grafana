import { useState } from 'react';

import { type FieldConfigSource, type StandardEditorProps } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { Button, Input, Stack, Text } from '@grafana/ui';

import {
  applySuggestedThreshold,
  computeP95FromFrames,
  countPointsAbove,
  type ThresholdFromDataInstanceState,
} from './thresholdFromData';

type Props = StandardEditorProps<unknown>;

export function ThresholdFromDataEditor({ context }: Props) {
  const frames = context.data ?? [];
  const p95 = computeP95FromFrames(frames);
  const instanceState = context.instanceState as ThresholdFromDataInstanceState | undefined;
  const applyFieldConfig = instanceState?.applyFieldConfig;
  const fieldConfig = instanceState?.fieldConfig;

  const [snapshot, setSnapshot] = useState<FieldConfigSource | undefined>();
  const [suggested, setSuggested] = useState<number | undefined>();
  const [draft, setDraft] = useState('');

  if (p95 == null) {
    return null;
  }

  const isPreviewing = snapshot != null && suggested != null;
  const counts = suggested != null ? countPointsAbove(frames, suggested) : undefined;
  const canApply = Boolean(applyFieldConfig && fieldConfig);

  const onSuggest = () => {
    if (!applyFieldConfig || !fieldConfig) {
      return;
    }

    setSnapshot(fieldConfig);
    setSuggested(p95);
    setDraft(String(p95));
    applyFieldConfig(applySuggestedThreshold(fieldConfig, p95));
  };

  const onDiscard = () => {
    if (snapshot && applyFieldConfig) {
      applyFieldConfig(snapshot);
    }
    setSnapshot(undefined);
    setSuggested(undefined);
    setDraft('');
  };

  const onAccept = () => {
    setSnapshot(undefined);
    setSuggested(undefined);
    setDraft('');
  };

  const onEditSuggested = (raw: string) => {
    setDraft(raw);
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || !snapshot || !applyFieldConfig) {
      return;
    }

    setSuggested(parsed);
    applyFieldConfig(applySuggestedThreshold(snapshot, parsed));
  };

  return (
    <Stack direction="column" gap={1}>
      {!isPreviewing && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onSuggest}
          disabled={!canApply}
          tooltip={
            canApply
              ? undefined
              : t(
                  'timeseries.threshold-from-data.suggest-disabled',
                  'Available after the time series panel is ready in panel edit'
                )
          }
          aria-label={t('timeseries.threshold-from-data.suggest-aria', 'Suggest threshold from data (p95)')}
        >
          <Trans i18nKey="timeseries.threshold-from-data.suggest">Suggest from data (p95)</Trans>
        </Button>
      )}

      {isPreviewing && (
        <>
          <Input
            type="number"
            step="0.0001"
            value={draft}
            onChange={(event) => onEditSuggested(event.currentTarget.value)}
            aria-label={t('timeseries.threshold-from-data.suggested-value-aria', 'Suggested threshold')}
          />
          {counts && (
            <Text variant="bodySmall" color="secondary">
              {t(
                'timeseries.threshold-from-data.points-above',
                '{{above}} of {{total}} points sit above this line (preview, not an alert rule)',
                { above: counts.above, total: counts.total }
              )}
            </Text>
          )}
          <Stack gap={1}>
            <Button
              size="sm"
              variant="primary"
              onClick={onAccept}
              aria-label={t('timeseries.threshold-from-data.accept-aria', 'Accept suggested threshold')}
            >
              <Trans i18nKey="timeseries.threshold-from-data.accept">Accept</Trans>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onDiscard}
              aria-label={t('timeseries.threshold-from-data.discard-aria', 'Discard suggested threshold')}
            >
              <Trans i18nKey="timeseries.threshold-from-data.discard">Discard</Trans>
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
