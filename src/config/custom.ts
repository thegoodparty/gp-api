const ONE_HOUR = 60 * 60 * 1000
const ONE_MONTH = 24 * ONE_HOUR * 30

export default () => ({
  passwordResetTokenTTL: ONE_MONTH,
})
