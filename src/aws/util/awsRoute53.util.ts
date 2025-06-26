/**
 * Formats a phone number to international format required by AWS Route 53
 * @param phone - The phone number to format
 * @returns The phone number in international format (+999.12345678)
 */
export const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (phone.startsWith('+')) {
    return phone
  }

  return `+1${digits}`
}
