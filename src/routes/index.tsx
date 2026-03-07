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
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-3xl font-bold">Cajita</h1>
      <p className="mt-2 text-gray-600">Sign in to continue.</p>
      <a href="/api/auth/google" className="mt-6">
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Sign in with Google
        </button>
      </a>
    </div>
  )
}
