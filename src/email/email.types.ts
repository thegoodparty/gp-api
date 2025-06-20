export enum EmailTemplateName {
  candidateVictoryReady = 'candidate-victory-ready',
  textCampaignSubmitted = 'text-campaign-submitted',
  proConfirmation = 'pro-confirmation',
  subscriptionCancellationConfirmation = 'subscription-cancellation-confirmation',
  setPassword = 'set-password',
  campaignCountdown5Days = 'campaign-countdown-5-days',
  campaignCountdown4Days = 'campaign-countdown-4-days',
}

export enum ScheduledMessageTypes {
  EMAIL = 'EMAIL',
}

export type SendEmailInput = {
  to: string
  subject?: string
  message: string
  from?: string
}
export type SendTemplateEmailInput = Omit<SendEmailInput, 'message'> & {
  template: EmailTemplateName
  variables?: object
  cc?: string
}
