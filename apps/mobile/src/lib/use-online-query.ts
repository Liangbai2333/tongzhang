import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, type QueryKey } from '@tanstack/react-query';

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
