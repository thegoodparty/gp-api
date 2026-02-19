export enum EmailTemplateName {
  subscriptionCancellationConfirmation = 'subscription-cancellation-confirmation',
  setPassword = 'set-password',
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
