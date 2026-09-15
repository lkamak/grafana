import { css } from '@emotion/css';
import { useMemo } from 'react';

import { type GrafanaTheme2, type LogRowModel } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Button, FilterPill, Stack, useStyles2 } from '@grafana/ui';

import { getTopLogPatterns } from './logPatternChips';

export interface LogPatternChipsProps {
  logRows: LogRowModel[];
  selectedPattern?: string;
  onSelectPattern: (patternId?: string) => void;
}

export function LogPatternChips({ logRows, selectedPattern, onSelectPattern }: LogPatternChipsProps) {
  const styles = useStyles2(getStyles);
  const patterns = useMemo(() => getTopLogPatterns(logRows), [logRows]);

  if (patterns.length === 0) {
    return null;
  }

  return (
    <div
      className={styles.wrapper}
      data-testid="log-pattern-chips"
      role="group"
      aria-label={t('explore.log-pattern-chips.aria-label', 'Log patterns')}
    >
      <Stack direction="row" gap={1} wrap="wrap" alignItems="center">
        {patterns.map((pattern) => {
          const isSelected = selectedPattern === pattern.id;
          return (
            <FilterPill
              key={pattern.id}
              label={`${pattern.label} (${pattern.count})`}
              selected={isSelected}
              onClick={() => onSelectPattern(isSelected ? undefined : pattern.id)}
            />
          );
        })}
        {selectedPattern && (
          <Button size="sm" fill="text" variant="secondary" onClick={() => onSelectPattern(undefined)}>
            {t('explore.log-pattern-chips.clear', 'Clear pattern')}
          </Button>
        )}
      </Stack>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    padding: theme.spacing(0.5, 0, 1),
  }),
});
