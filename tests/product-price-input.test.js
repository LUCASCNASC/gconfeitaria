import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPriceInput } from '../src/services/product-price-input.js'
import { normalizePrice } from '../src/services/product-validation.js'

test('formata a digitação em centavos e permite limpar ou colar valores formatados', () => {
  for (const [input, expected] of [['', ''], ['1', '0,01'], ['12', '0,12'], ['1234', '12,34'], ['R$ 1.234,56', '1234,56'], ['000000', '0,00']]) {
    assert.equal(formatPriceInput(input), expected)
  }
})

test('preserva valores acima do limite para a validação rejeitá-los', () => {
  assert.equal(normalizePrice(formatPriceInput('9999999999')), '99999999.99')
  assert.equal(normalizePrice(formatPriceInput('10000000000')), null)
})
