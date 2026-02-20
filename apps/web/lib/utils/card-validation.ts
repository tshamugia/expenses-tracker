import type { CardBrand, CardValidationResult } from '@extracker/types'

/**
 * Luhn Algorithm (Mod 10) for credit card validation
 * Used to validate credit card numbers
 */
export function luhnCheck(cardNumber: string): boolean {
  // Remove any spaces or non-digit characters
  const digits = cardNumber.replace(/\D/g, '')

  if (digits.length < 13 || digits.length > 19) {
    return false
  }

  let sum = 0
  let isEven = false

  // Loop through values starting from the rightmost digit
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

/**
 * Detect credit card brand from card number
 */
export function detectCardBrand(cardNumber: string): CardBrand {
  // Remove any spaces or non-digit characters
  const digits = cardNumber.replace(/\D/g, '')

  // Visa: starts with 4
  if (/^4/.test(digits)) {
    return 'Visa'
  }

  // Mastercard: 51-55 or 2221-2720
  if (/^5[1-5]/.test(digits) || /^2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(digits)) {
    return 'Mastercard'
  }

  // American Express: starts with 34 or 37
  if (/^3[47]/.test(digits)) {
    return 'Amex'
  }

  // Discover: 6011, 622126-622925, 644-649, 65
  if (
    /^6011/.test(digits) ||
    /^622(12[6-9]|1[3-9]\d|[2-8]\d{2}|9[01]\d|92[0-5])/.test(digits) ||
    /^64[4-9]/.test(digits) ||
    /^65/.test(digits)
  ) {
    return 'Discover'
  }

  return 'Unknown'
}

/**
 * Validate credit card number and detect brand
 */
export function validateCardNumber(cardNumber: string): CardValidationResult {
  // Remove any spaces or non-digit characters
  const digits = cardNumber.replace(/\D/g, '')

  // Check if empty
  if (!digits) {
    return {
      isValid: false,
      brand: 'Unknown',
      error: 'Card number is required',
    }
  }

  // Check length
  if (digits.length < 13 || digits.length > 19) {
    return {
      isValid: false,
      brand: 'Unknown',
      error: 'Card number must be 13-19 digits',
    }
  }

  // Detect brand
  const brand = detectCardBrand(digits)

  // Validate with Luhn algorithm
  const isValid = luhnCheck(digits)

  if (!isValid) {
    return {
      isValid: false,
      brand,
      error: 'Invalid card number',
    }
  }

  return {
    isValid: true,
    brand,
  }
}

/**
 * Format card number for display (•••• •••• •••• 1234)
 */
export function formatCardNumber(cardNumber: string, showAll: boolean = false): string {
  const digits = cardNumber.replace(/\D/g, '')

  if (showAll) {
    // Format as groups of 4: 1234 5678 9012 3456
    return digits.replace(/(\d{4})/g, '$1 ').trim()
  } else {
    // Show only last 4 digits: •••• •••• •••• 1234
    const lastFour = digits.slice(-4)
    const maskedGroups = '•••• •••• •••• '
    return maskedGroups + lastFour
  }
}

/**
 * Get last 4 digits from card number
 */
export function getLastFourDigits(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '')
  return digits.slice(-4)
}

/**
 * Validate expiry date
 */
export function validateExpiryDate(month: number, year: number): boolean {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1 // 0-indexed

  // Check month range
  if (month < 1 || month > 12) {
    return false
  }

  // Check if card is expired
  if (year < currentYear) {
    return false
  }

  if (year === currentYear && month < currentMonth) {
    return false
  }

  // Check if expiry is too far in the future (10 years)
  if (year > currentYear + 10) {
    return false
  }

  return true
}

/**
 * Format expiry date for display (MM/YY)
 */
export function formatExpiryDate(month: number, year: number): string {
  const monthStr = month.toString().padStart(2, '0')
  const yearStr = year.toString().slice(-2)
  return `${monthStr}/${yearStr}`
}

/**
 * Get card brand logo color
 */
export function getCardBrandColor(brand: CardBrand): string {
  switch (brand) {
    case 'Visa':
      return '#1434CB'
    case 'Mastercard':
      return '#EB001B'
    case 'Amex':
      return '#006FCF'
    case 'Discover':
      return '#FF6000'
    default:
      return '#64748b'
  }
}
