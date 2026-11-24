export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function validateUsername(username) {
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    return 'O usuário deve ter de 3 a 50 caracteres: letras, números, ponto, hífen ou sublinhado.'
  }
  return null
}

export function validateLoginInput(username, password) {
  if (typeof username !== 'string' || !username.trim() || Array.from(username).length > 50) {
    return 'Informe um usuário válido.'
  }
  if (typeof password !== 'string' || !password.trim() || Array.from(password).length > 255) {
    return 'Informe uma senha válida.'
  }
  return null
}

export function validateNewUser(username, password) {
  const usernameError = validateUsername(username)
  if (usernameError) return usernameError
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return 'A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes.'
  }
  return null
}
