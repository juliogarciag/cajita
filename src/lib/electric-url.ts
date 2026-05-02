// Returns an absolute URL for an Electric shape endpoint.
//
// Collections are constructed at module-evaluation time, which runs on both
// the server (during SSR) and the client. The Electric ShapeStream calls
// `new URL(url)`, which throws `ERR_INVALID_URL` in Node when given a
// relative path. On the server we fall back to a localhost base — the
// ShapeStream attempt fails harmlessly and the collection is marked ready,
// then the client takes over with the real origin after hydration.
export function electricShapeUrl(table: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return `${base}/api/electric/${table}`
}
