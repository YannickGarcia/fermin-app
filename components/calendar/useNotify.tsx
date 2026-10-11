'use client';
import {useCallback} from 'react';
import {useToast} from '@astryxdesign/core/Toast';
import {Button} from '@astryxdesign/core/Button';
import {undo} from '@/lib/data/store';

/** Confirmation toast. Every change made from the calendar can be undone from it. */
export function useNotify() {
  const toast = useToast();
  return useCallback(
    (body: string, opts: {canUndo?: boolean; type?: 'info' | 'error'} = {}) => {
      toast({
        body,
        type: opts.type ?? 'info',
        uniqueID: 'fermin-action',
        endContent: opts.canUndo ? <Button label="Deshacer" variant="ghost" size="sm" onClick={() => undo()} /> : undefined,
      });
    },
    [toast],
  );
}
