## Overview

\[ a 2-5 sentence summary of what we’re trying to accomplish \]

## Key Product Outcomes

- Allow visually switching between "campaign" mode and "elected official" mode in the product. Each will have a separate filtered list of nav items (to be decided by product).
- Allow an elected official to transition _back_ into campaign mode, by creating a new campaign with a _separate_ district from their current elected office.
- A user should be able to go through the campaign → serve → campaign cycle _without_ needing to create a new user account (for their 2nd campaign).
- Users should see a _separate_ list of custom segments for their campaign and elected offices, when viewing the Contacts page.
- When in "elected official" mode, users should NOT be able to see Political Party information about constituents on the Contacts page.

## Key Technical Outcomes

- Break the FK relationship between Campaign ↔ ElectedOffice.
- Conceptually support multiple Campaign records over time for a single user.
- Establish conventions for modeling data relationships for features that fall into each of these categories:
  - Features that are specific to Win
  - Features that are specific to Serve
  - Features that span both use cases

## Not In Scope

- Supporting onboarding new elected officials that did not get elected using Win.

## Proposed Solution

There are three primary technical problems that arise

#### Key Problems

1. Today, Campaign+PathToVictory is the source of truth for a user's BallotReady ids and their L2 District. But, both candidates _and_ EOs need a BallotReady position and a matched L2 District. **Since we are separating ElectedOffice and Campaign,** **how will we store + model BR/L2 links for each use case?**
2. Some features (Contacts + future roadmap items) will need to support usage from Win _and_ Serve. **How will we handle foreign key relationships for features that need cross-product support?**
3. Currently, the product does not _really_ support Win users having multiple Campaign objects over time. **What changes are needed to allow a single user to have multiple Campaigns over time?**

#### Detailed Design

TODO

#### Key Takeaways

\[ a bulleted list of the most important takeaways and aspects of your design \]

## FAQs

#### What About Clerk Organizations?

This data model solution is intended to be _complementary_ to our planned future usage of [Clerk Organizations](https://clerk.com/docs/guides/organizations/overview) to support multi-user membership of orgs and customizable access control. When we reach the point of needing Organizations, this proposal expects a 1:1 relationship between in-product Organizations and Clerk Organizations. In fact, it may be simplest to simply re-use the same `id` between each resource for system simplicity.

## Open Questions

#### BR/L2 Data Modeling

It seems that every BallotReady position should come with the same shared m

\[ todo fill in\]

## Alternatives Considered

#### No Shared Model, duplicate FK work

#### Pure Clerk Organizations

Model Organizations
