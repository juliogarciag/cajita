import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { validateSession } from '#/server/session.js'

const getUser = createServerFn({ method: 'GET' }).handler(async () => {
  const token = getCookie('session')
  if (!token) return null
  const user = await validateSession(token)
  return user
})

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const user = await getUser()
    if (user) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <h1>Cajita</h1>
      <p>Sign in to continue.</p>
      <a href="/api/auth/google">
        <button type="button">Sign in with Google</button>
      </a>
    </div>
  )
}
