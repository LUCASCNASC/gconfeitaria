export function localOnly(req, res, next) {
  const localAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1']
  const isLocal = localAddresses.includes(req.socket.remoteAddress) &&
    localAddresses.includes(req.ip) &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname.toLowerCase())

  if (process.env.NODE_ENV === 'production' || !isLocal) {
    return res.status(403).json({ error: 'Funcionalidade disponível apenas para testes locais.' })
  }
  next()
}
