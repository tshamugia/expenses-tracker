import { treaty } from '@elysiajs/eden'
import type { App } from '@extracker/api'
import { authenticatedFetch } from './authenticated-fetch'
import { getApiUrl } from '../utils/config'

export const api = treaty<App>(getApiUrl(), {
  fetcher: authenticatedFetch,
})
