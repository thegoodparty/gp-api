export enum EmailTemplateName {
  candidateVictoryReady = 'candidate-victory-ready',
  // TODO: "campagin-launch" is misspelled in Mailgun as well, must change there first.
  campaignLaunch = 'campagin-launch',
  textCampaignSubmitted = 'text-campaign-submitted',
  proConfirmation = 'pro-confirmation',
  endOfProSubscription = 'end-of-pro-subscription',
  subscriptionCancellationConfirmation = 'subscription-cancellation-confirmation',
  setPassword = 'set-password',
  campaignCountdownWeek1 = 'campaign-countdown-week-1',
  campaignCountdownWeek2 = 'campaign-countdown-week-2',
  campaignCountdownWeek3 = 'campaign-countdown-week-3',
  campaignCountdownWeek4 = 'campaign-countdown-week-4',
  campaignCountdownWeek5 = 'campaign-countdown-week-5',
  campaignCountdownWeek6 = 'campaign-countdown-week-6',
  campaignCountdownWeek7 = 'campaign-countdown-week-7',
  campaignCountdownWeek8 = 'campaign-countdown-week-8',
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
