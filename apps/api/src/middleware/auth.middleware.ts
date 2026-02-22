import { Elysia } from 'elysia'
import { bearer } from '@elysiajs/bearer'
import jwtPlugin from '../plugins/jwt.plugin'
import { ERROR_CODES } from '../utils/response'

export const authMiddleware = new Elysia({ name: 'middleware/auth' })
  .use(jwtPlugin)
  .use(bearer())
  .derive({ as: 'scoped' }, async ({ jwt, bearer }) => {
    if (!bearer) {
      throw new Error(ERROR_CODES.UNAUTHORIZED)
    }

    const payload = await jwt.verify(bearer)

    if (!payload) {
      throw new Error(ERROR_CODES.TOKEN_INVALID)
    }

    return {
      userId: payload.sub as string,
      userEmail: payload.email as string,
    }
  })
  .onError({ as: 'scoped' }, ({ error, set }) => {
    const message = error instanceof Error ? error.message : String(error)
    if (message === ERROR_CODES.UNAUTHORIZED) {
      set.status = 401
      return { success: false, error: 'Authentication required', code: ERROR_CODES.UNAUTHORIZED }
    }
    if (message === ERROR_CODES.TOKEN_INVALID) {
      set.status = 401
      return { success: false, error: 'Invalid or expired token', code: ERROR_CODES.TOKEN_INVALID }
    }
  })
