// Add the Google email addresses of users allowed to log in.
// Only these emails will be granted access.
export const ALLOWED_EMAILS: string[] = ['julioggonz@gmail.com']

export function isEmailAllowed(email: string): boolean {
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
