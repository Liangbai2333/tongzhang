import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, type QueryKey } from '@tanstack/react-query';

/**
 * Whether a query should replace the page with its loading or error state. Only a first load,
 * or a refetch after a failure, does; a background refresh keeps the current content so pages
 * do not flash, while a failed refresh still hides stale data.
 */
export function blocksContent(query: {
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
}) {
  return query.isPending || (query.isFetching && query.isError);
}

/** A focused page always reads online; cached business data is never an offline fallback. */
export function useOnlineQuery<T>(key: QueryKey, read: () => Promise<T>, enabled = true) {
  const identity = JSON.stringify(key);
  const query = useQuery({
    queryKey: key,
    queryFn: read,
    enabled: false,
    retry: false,
    gcTime: 0,
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (enabled) void refetch();
    }, [enabled, refetch, identity]),
  );
  return query;
}
