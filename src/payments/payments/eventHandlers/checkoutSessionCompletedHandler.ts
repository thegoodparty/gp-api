import { Stripe } from 'stripe'

export async function checkoutSessionCompletedHandler(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  const session = event.data.object
  const { customer: customerId, subscription: subscriptionId } = session
  if (!customerId) {
    throw 'No customerId found in checkout session'
  }

  const { userId } = session.metadata
  if (!userId) {
    throw 'No userId found in checkout session metadata'
  }

  const user = await User.findOne({ id: userId })
  if (!user) {
    throw 'No user found with given checkout session userId'
  }
  const campaign = await sails.helpers.campaign.byUser(user.id)
  if (!campaign) {
    throw 'No campaign found for user'
  }

  await Promise.allSettled([
    patchUserMetaData(user, { customerId, checkoutSessionId: null }),
    setCampaignSubscriptionId(campaign, subscriptionId),
    setUserCampaignIsPro(campaign),
    sendProSignUpSlackMessage(user, campaign),
    sendProConfirmationEmail(user, campaign),
    doVoterDownloadCheck(campaign),
  ])
}
