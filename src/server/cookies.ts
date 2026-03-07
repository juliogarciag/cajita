interface CookieOptions {
  secure?: boolean
  path?: string
  httpOnly?: boolean
  maxAge?: number
  sameSite?: 'strict' | 'lax' | 'none'
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') || ''
  const cookies: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.split('=')
    if (key) {
      cookies[key.trim()] = rest.join('=').trim()
    }
  }
  return cookies
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`]
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  return parts.join('; ')
}

export function deleteCookieHeader(name: string): string {
  return serializeCookie(name, '', { path: '/', maxAge: 0 })
}
