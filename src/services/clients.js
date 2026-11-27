import { ref } from 'vue'

export const clientNotice = ref('')

const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))

export function formatCpf(value) {
  const digits = value.replace(/\D/g, '')
  if (digits.length > 11) return value
  return digits.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

export function formatTelephone(value) {
  if (/[^\d\s().-]/.test(value)) return value
  const digits = value.replace(/\D/g, '')
  if (digits.length > 11) return value
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  const number = digits.slice(2)
  const split = digits.length > 10 ? 5 : 4
  return `(${digits.slice(0, 2)}) ${number.slice(0, split)}${number.length > split ? `-${number.slice(split)}` : ''}`
}

export function applyCepAddress(address, data, initial) {
  for (const [field, source] of Object.entries({
    city: 'localidade', state: 'uf', street: 'logradouro',
    neighborhood: 'bairro', complement: 'complemento',
  })) {
    if (address[field] === initial[field] && typeof data[source] === 'string' && data[source].trim()) {
      address[field] = data[source].trim()
    }
  }
}

export function personalErrors(form) {
  const errors = {}
  for (const field of ['name', 'birth_date', 'sex_id', 'telefone']) {
    if (!String(form[field] ?? '').trim()) errors[field] = 'Campo obrigatório'
  }
  if (form.birth_date && !errors.birth_date) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(form.birth_date) ? new Date(`${form.birth_date}T00:00:00Z`) : new Date(NaN)
    if (form.birth_date.startsWith('0000-') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== form.birth_date) errors.birth_date = 'Informe uma data válida.'
  }
  if (form.cpf && !/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(form.cpf.trim())) errors.cpf = 'Informe 11 dígitos, com ou sem pontuação.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.'
  return errors
}

export function addressErrors(address) {
  const errors = {}
  for (const field of ['cep', 'city', 'state', 'street', 'neighborhood', 'number']) {
    if (!String(address[field] ?? '').trim()) errors[field] = 'Campo obrigatório'
  }
  if (address.cep && !errors.cep && !/^(?:\d{8}|\d{5}-\d{3})$/.test(address.cep.trim())) errors.cep = 'Informe um CEP com 8 dígitos.'
  if (address.state && !errors.state && !states.has(address.state.trim().toUpperCase())) errors.state = 'Informe uma sigla de estado válida.'
  return errors
}
