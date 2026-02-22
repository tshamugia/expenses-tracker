import { Elysia } from 'elysia'
import { jwt } from '@elysiajs/jwt'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production')
}

const jwtPlugin = new Elysia({ name: 'plugin/jwt' }).use(
  jwt({
    name: 'jwt',
    secret: JWT_SECRET ?? 'dev-secret-do-not-use-in-production',
    exp: '15m',
  })
)

export default jwtPlugin
