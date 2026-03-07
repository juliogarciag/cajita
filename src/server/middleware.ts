import { createMiddleware } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { validateSession } from './session.js'

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const sessionToken = getCookie('session')

  if (!sessionToken) {
    throw new Error('Unauthorized')
  }

  const user = await validateSession(sessionToken)

  if (!user) {
    throw new Error('Unauthorized')
  }

  return next({ context: { user } })
})
