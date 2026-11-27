export function restoreVercelApiPath(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost')
  if (url.pathname !== '/api/index' || !url.searchParams.has('__g_path')) return requestUrl
  const paths = url.searchParams.getAll('__g_path')
  if (paths.length !== 1 || /[?#\\\x00-\x1f]/.test(paths[0])) throw new Error('Caminho da API inválido.')
  url.searchParams.delete('__g_path')
  const query = url.searchParams.toString()
  return `/api/${paths[0]}${query ? `?${query}` : ''}`
}
