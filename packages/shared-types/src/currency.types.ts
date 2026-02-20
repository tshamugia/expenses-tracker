/**
 * Currency Domain Type Definitions
 * Extracted from currency service for shared use
 */

export interface CurrencyRate {
  code: string
  quantity: number
  rateFormated: string
  diffFormated: string
  rate: number
  name: string
  diff: number
  date: string
  validFromDate: string
}

export interface NBGApiResponse {
  date: string
  currencies: CurrencyRate[]
}
