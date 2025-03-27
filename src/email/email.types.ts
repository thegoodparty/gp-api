export enum EmailTemplateNames {
  candidateVictoryReady = 'candidate-victory-ready',
  // TODO: "campagin-launch" is misspelled in Mailgun as well, must change there first.
  campaignLaunch = 'campagin-launch',
  blank = 'blank-email',
  proConfirmation = 'pro-confirmation',
  volunteerInvitation = 'volunteer-invitation',
  weeklyGoals = 'weekly-goals',
  weeklyContent = 'weekly-content',
  updateTracker = 'update-tracker',
  endOfProSubscription = 'end-of-pro-subscription',
  dayAfterPrimary = 'day-after-primary',
  subscriptionCancellationConfirmation = 'subscription-cancellation-confirmation',
  setPassword = 'set-password',
}

export enum ScheduledMessageTypes {
  EMAIL = 'EMAIL',
}

export type SendEmailInput = {
  to: string
  subject: string
  message: string
  from?: string
}
export type SendTemplateEmailInput = Omit<SendEmailInput, 'message'> & {
  template: EmailTemplateNames
  variables?: object
  cc?: string
}
