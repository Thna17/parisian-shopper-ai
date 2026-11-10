import { expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { contentApi } from '../api/content-api.js';
import { contentKeys, useReviseContent } from '../hooks/use-content.js';
import type { ContentJobDetail, ContentVersion, ValidationResult } from '../types/content.types.js';

it('replaces the cached review target with the newly saved and validated caption', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const oldVersion = { id: 'old' } as ContentVersion;
  const newVersion = { id: 'new' } as ContentVersion;
  const validation = { id: 'check-new', status: 'PASSED', blockingCount: 0 } as ValidationResult;
  client.setQueryData(contentKeys.detail('job1'), {
    job: { id: 'job1' },
    currentVersion: oldVersion,
    versions: [],
    attempts: [],
  } as unknown as ContentJobDetail);
  vi.spyOn(contentApi, 'reviseManual').mockResolvedValueOnce({
    version: newVersion,
    validationResult: validation,
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useReviseContent('job1'), { wrapper });
  await act(async () => {
    await hook.result.current.mutateAsync({
      currentVersionId: 'old',
      field: 'headline',
      newValue: 'New headline',
    });
  });
  await waitFor(() =>
    expect(
      client.getQueryData<ContentJobDetail>(contentKeys.detail('job1'))?.currentVersion?.id,
    ).toBe('new'),
  );
  expect(
    client.getQueryData<ContentJobDetail>(contentKeys.detail('job1'))?.latestValidationResult?.id,
  ).toBe('check-new');
  vi.restoreAllMocks();
});
