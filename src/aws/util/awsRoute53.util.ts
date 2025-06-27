// assumes US phone number, formats with +1 prefix for sending to AWS Route 53
export const formatPhoneNumber = (phone: string): string => {
  if (phone.startsWith('+')) {
    return phone
  }

  const digits = phone.replace(/\D/g, '')

  if (digits.length >= 11) {
    return `+${digits}`
  } else {
    return `+1${digits}`
  }
}
