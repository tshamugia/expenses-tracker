import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        console.error('Query error:', error.message)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        console.error('Mutation error:', error.message)
      },
    }),
  })
}
