export const getTCRIdentityName = (userFullName: string, campaignEIN: string) =>
  `${userFullName} - ${campaignEIN}`
