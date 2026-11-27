import { createCatalogRouter } from './catalog.js'

export function createMenusRouter(pool) {
  return createCatalogRouter(pool, {
    table: 'menus', singular: 'menu', plural: 'menus', subject: 'do menu', notFound: 'Menu não encontrado.',
    nameMax: 150, descriptionMax: 150, statusColumn: 'is_active',
  })
}
