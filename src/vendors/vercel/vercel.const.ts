export const GP_DOMAIN_CONTACT = {
  firstName: 'Victoria',
  lastName: 'Mitchell',
  email: 'accounts@goodparty.org',
  phoneNumber: '+1.3126851162',
  addressLine1: '916 Silver Spur Rd',
  city: 'Rolling Hills Estates',
  state: 'CA',
  zipCode: '90274',
}

// Registrant contact for agent-provisioned domains. ICANN keys its
// "Verify Your Domain Contact Information" requirement on the
// (firstName, lastName, email) tuple, not the email alone. Holding all three
// constant to a GoodParty identity that is already ICANN-verified at Vercel's
// registrar means new domains reuse the verified tuple and auto-confirm — no
// verification email is sent and no human (or agent) ever clicks a link.
export const DOMAIN_REGISTRANT_CONTACT = {
  firstName: 'Tomer',
  lastName: 'Almog',
  email: 'tomer@goodparty.org',
}
