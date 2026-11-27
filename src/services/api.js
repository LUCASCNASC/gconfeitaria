const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export function apiUrl(path) {
  return `${apiBaseUrl}${path}`
}

export async function request(path, options = {}) {
  let response
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique se a API está em execução.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.error || 'Não foi possível concluir a solicitação.')
  }
  return body
}
