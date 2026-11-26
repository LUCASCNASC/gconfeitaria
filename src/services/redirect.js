export function restoreRedirect(browserWindow) {
  const redirect = browserWindow.sessionStorage.getItem('gconfeitaria:redirect')
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    browserWindow.sessionStorage.removeItem('gconfeitaria:redirect')
    browserWindow.history.replaceState(null, '', redirect)
  }
}
