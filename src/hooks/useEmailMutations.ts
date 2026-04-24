import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { emailsApi } from '@/api/index';
import type { Folder } from '@/lib/index';

// All email mutations live here so components don't need to open their own
// React Query mutation handles. Each call invalidates the cached `emails`
// queries so the UI refreshes.
export function useEmailMutations() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['emails'] });
    qc.invalidateQueries({ queryKey: ['all-inbox'] });
    qc.invalidateQueries({ queryKey: ['unread-counts'] });
  }, [qc]);

  const markRead = useCallback(async (id: string) => {
    await emailsApi.markRead(id);
    invalidate();
  }, [invalidate]);

  const markUnread = useCallback(async (id: string) => {
    await emailsApi.markUnread(id);
    invalidate();
  }, [invalidate]);

  const toggleStar = useCallback(async (id: string, current: boolean) => {
    await emailsApi.toggleStar(id, !current);
    invalidate();
  }, [invalidate]);

  const moveToFolder = useCallback(async (id: string, folder: Folder) => {
    await emailsApi.moveToFolder(id, folder);
    invalidate();
  }, [invalidate]);

  const deleteEmail = useCallback(async (id: string, currentFolder: Folder) => {
    if (currentFolder === 'trash') {
      await emailsApi.delete(id);
    } else {
      await emailsApi.moveToFolder(id, 'trash');
    }
    invalidate();
  }, [invalidate]);

  return { markRead, markUnread, toggleStar, moveToFolder, deleteEmail };
}
