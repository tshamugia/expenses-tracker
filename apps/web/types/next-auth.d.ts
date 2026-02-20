import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      hasSetPassword?: boolean
    } & DefaultSession['user']
  }

  interface User {
    id: string
    hasSetPassword?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    provider?: string
    hasSetPassword?: boolean
  }
}
