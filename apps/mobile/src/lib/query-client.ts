import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: false, networkMode: 'always' },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
