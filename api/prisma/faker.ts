import { ContentType, CampaignUpdateHistoryType, CampaignTier } from '@prisma/client';
import { faker } from '@faker-js/faker';
import Decimal from 'decimal.js';



export function fakeContent() {
  return {
    updatedAt: undefined,
    type: faker.helpers.arrayElement([ContentType.aiChatPrompt, ContentType.aiContentTemplate, ContentType.articleCategory, ContentType.blogArticle, ContentType.blogHome, ContentType.blogSection, ContentType.candidateTestimonial, ContentType.election, ContentType.faqArticle, ContentType.faqOrder, ContentType.glossaryItem, ContentType.goodPartyTeamMembers, ContentType.onboardingPrompts, ContentType.pledge, ContentType.privacyPage, ContentType.promptInputFields, ContentType.redirects, ContentType.teamMember, ContentType.teamMilestone, ContentType.termsOfService] as const),
    data: JSON.stringify({"foo":"65890903-dc0b-4fc3-a83e-d3cfeb9648ec","bar":7764804861165568,"bike":"e","a":"k","b":0.5064980026800185,"name":"Lawrence","prop":"0b1"}),
  };
}
export function fakeContentComplete() {
  return {
    createdAt: new Date(),
    updatedAt: undefined,
    id: faker.string.uuid(),
    type: faker.helpers.arrayElement([ContentType.aiChatPrompt, ContentType.aiContentTemplate, ContentType.articleCategory, ContentType.blogArticle, ContentType.blogHome, ContentType.blogSection, ContentType.candidateTestimonial, ContentType.election, ContentType.faqArticle, ContentType.faqOrder, ContentType.glossaryItem, ContentType.goodPartyTeamMembers, ContentType.onboardingPrompts, ContentType.pledge, ContentType.privacyPage, ContentType.promptInputFields, ContentType.redirects, ContentType.teamMember, ContentType.teamMilestone, ContentType.termsOfService] as const),
    data: JSON.stringify({"foo":"a289764b-5094-4922-a07b-7223a80cd175","bar":1728616396226560,"bike":"5","a":"0","b":0.965464272769168,"name":"Valentin","prop":"0b0"}),
  };
}
export function fakePathToVictory() {
  return {
    updatedAt: faker.date.anytime(),
    data: JSON.stringify({"foo":"d1deb14a-3591-4641-b656-9f8abcfcdf2b","bar":2326150028197888,"bike":"1","a":"p","b":0.5724279540590942,"name":"Phoebe","prop":"0b1"}),
  };
}
export function fakePathToVictoryComplete() {
  return {
    id: faker.string.uuid(),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    campaignId: faker.number.int(),
    data: JSON.stringify({"foo":"dc2f6c7c-ad6a-408b-9b6e-e273280b572d","bar":8466451537068032,"bike":"d","a":"T","b":0.3825467659626156,"name":"Jewel","prop":"0b1"}),
  };
}
export function fakeCampaignUpdateHistory() {
  return {
    updatedAt: faker.date.anytime(),
    type: faker.helpers.arrayElement([CampaignUpdateHistoryType.doorKnocking, CampaignUpdateHistoryType.calls, CampaignUpdateHistoryType.digital, CampaignUpdateHistoryType.directMail, CampaignUpdateHistoryType.digitalAds, CampaignUpdateHistoryType.text, CampaignUpdateHistoryType.events, CampaignUpdateHistoryType.yardSigns] as const),
    quantity: faker.number.int(),
  };
}
export function fakeCampaignUpdateHistoryComplete() {
  return {
    id: faker.string.uuid(),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    campaignId: faker.number.int(),
    type: faker.helpers.arrayElement([CampaignUpdateHistoryType.doorKnocking, CampaignUpdateHistoryType.calls, CampaignUpdateHistoryType.digital, CampaignUpdateHistoryType.directMail, CampaignUpdateHistoryType.digitalAds, CampaignUpdateHistoryType.text, CampaignUpdateHistoryType.events, CampaignUpdateHistoryType.yardSigns] as const),
    quantity: faker.number.int(),
  };
}
export function fakeCampaign() {
  return {
    updatedAt: faker.date.anytime(),
    slug: faker.lorem.words(5),
    isActive: faker.datatype.boolean(0.5),
    isVerified: faker.datatype.boolean(0.5),
    didWin: undefined,
    dateVerified: undefined,
    tier: faker.helpers.arrayElement([CampaignTier.WIN, CampaignTier.LOSE, CampaignTier.TOSSUP]),
  };
}
export function fakeCampaignComplete() {
  return {
    id: faker.number.int({ max: 2147483647 }),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    slug: faker.lorem.words(5),
    isActive: faker.datatype.boolean(0.5),
    isVerified: faker.datatype.boolean(0.5),
    isPro: faker.datatype.boolean(0.5),
    isDemo: faker.datatype.boolean(0.1),
    didWin: undefined,
    dateVerified: undefined,
    tier: faker.helpers.arrayElement([CampaignTier.WIN, CampaignTier.LOSE, CampaignTier.TOSSUP]),
    data: {},
    details: {},
    aiContent: {},
    vendorTsData: {},
  };
}
