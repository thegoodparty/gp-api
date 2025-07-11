# Website and Domain Functionality Documentation

## Database Models

### Website
The main website entity that stores campaign website data including content, status, and vanity path for public access.

### Domain  
For using a custom domain for a website. Stored AWS Route53 operationId for polling registration status. Stores the registration price and a Stripe paymentId for connecting a customer payment to the entity.

### WebsiteContact
Stores basic contact form submissions from website visitors including name, email, phone, message, and SMS consent. Just used for capturing form submissions and displaying them until a larger CRM type solution can be implemented.

### WebsiteView
Used for very basic tracking of visitor views. Frontend generates a UUID in localStorage to identify individual visitors, and will send a tracking call once per session.

### Relationships
- **Website** ↔ **Campaign**: One-to-one relationship (each campaign has one website)
- **Website** ↔ **Domain**: One-to-one relationship (each website can have one custom domain)
- **Website** ↔ **WebsiteContact**: One-to-many relationship (website has many contact submissions)
- **Website** ↔ **WebsiteView**: One-to-many relationship (website has many view records)

## API Endpoints

### Website Management (WebsitesController)

#### Creating a Website
**POST** `/websites`
- Creates a new website for the current user's campaign
- Automatically generates default content based on campaign positions and user data
- Defaults the `vanityPath` to the campaign's slug
- Returns the created website with basic content structure

#### Updating Website Content
**PUT** `/websites/mine`
- Updates website content and configuration
- Accepts multipart form data for file uploads (logo and hero images)
- Merges content updates with existing content using deep merge 
- **Payload Structure:**

  ```typescript
  {
    logo?: string | 'null'           // 'null' to remove the image
    status?: 'published' | 'unpublished'
    vanityPath?: string              // URL-friendly path
    theme?: string                   // Themes are hardcoded on the frontend currently, see WEBSITE_THEMES constant
    main?: {
      title?: string
      tagline?: string
      image?: string | 'null'        // 'null' to remove the image
    }
    about?: {
      bio?: string
      issues?: Array<{
        title?: string
        description?: string
      }>
    }
    contact?: {
      address?: string
      email?: string
      phone?: string
    }
  }
  ```
- **File Uploads:** Also accepts logo and hero image uploads, by sending the image files in the `heroFile` and `logoFile` keys. 
- **Content Merging:** Uses deep merge to combine updates with existing content.
- **Array Handling:** Issues array is replaced entirely, to avoid merging an old array with the new value.

> ⚠️ **NOTE:** For the `logo` and `main.image` fields, you _could_ sent an external URL to use as the image path, but primarily images would be uploaded as files along with the request paylod. Currently, these fields are only used when removing the logo or main image from the content.

#### Retrieving Website Data
**GET** `/websites/mine`
- Returns the current user's website with domain information
- Includes campaign details and user information

#### Managing Contacts
**GET** `/websites/mine/contacts`
- Retrieves contact form submissions with pagination
- **Query Parameters:**
  - `sortBy`: Field to sort by (createdAt, name, email, etc.)
  - `sortOrder`: 'asc' or 'desc' (default: 'desc')
  - `limit`: Number of contacts per page (default: 25)
  - `page`: Page number (default: 1)
- Returns paginated results with total count and page info

#### Site Views
**GET** `/websites/mine/views`
- Retrieves website view records with date range filtering
- **Query Parameters:**
  - `startDate`: Start date for analytics (optional)
  - `endDate`: End date for analytics (optional)

#### Vanity Path Validation
**POST** `/websites/mine/validate-vanity-path`
- Validates if a vanity path is available for use
- Checks for uniqueness and format requirements
- Returns validation result

#### Preview Website
**GET** `/websites/:vanityPath/preview`
- Owner or Admin only endpoint to preview unpublished websites
- Requires admin role, or campaign ownership to access
- Returns website content for preview purposes

#### Public Website Access
**GET** `/websites/:vanityPath/view`
- Public endpoint to view published websites
- Returns website content and campaign information
- Only accessible for websites with 'published' status

#### Contact Form Submission
**POST** `/websites/:vanityPath/contact`
- Public endpoint for contact form submissions
- **Payload Structure:**
  ```typescript
  {
    name: string
    email: string
    phone?: string
    message: string
    smsConsent: boolean
  }
  ```
- Stores contact information with SMS consent tracking
- No authentication required (public endpoint)

#### View Tracking
**POST** `/websites/:vanityPath/track`
- Tracks website views for analytics
- **Payload Structure:**
  ```typescript
  {
    visitorId: string  // UUID generated by frontend
  }
  ```
- Rate-limited to prevent refreshing spams (1 minute window per visitor) **Very flimsy limiting however**
- No authentication required (public endpoint)
> ⚠️ **NOTE:** This is implementation is good enough for the short term, but at some point a more robust site analytics tool could be used (Segment/Amplitude or similar)

### Domain Management (DomainsController)

#### Domain Search
**GET** `/domains/search`
- Searches for domain availability and pricing information
- **Query Parameters:**
  - `domain`: Domain name to search (e.g., "example.com")
- **Returns:**
  - Domain availability status
  - Registration and renewal pricing
  - Alternative domain suggestions with pricing

#### Domain Details (Admin Only)
**GET** `/domains`
- Admin-only endpoint to get detailed domain information
- **Not really used just for development**
- **Query Parameters:**
  - `domain`: Domain name to get details for
- Returns comprehensive domain details from AWS Route53
- Requires admin role

#### Domain Registration
**POST** `/domains`
- Initiates the domain registration process
- **Payload Structure:**
  ```typescript
  {
    domain: string  // Domain name to register
  }
  ```
- **Process:**
  1. Checks domain availability
  2. Gets pricing from AWS Route53
  3. Creates Stripe payment intent
  4. Creates domain record with 'pending' status
- **Returns:**
  - Domain record with pricing
  - Stripe payment secret for client-side payment processing

#### Complete Domain Registration
**POST** `/domains/complete`
- Completes domain registration after payment is processed
- **Current Implementation:**
  - No payload required (contact info is hardcoded)
  - Uses dummy contact data for AWS registration
  - **TODO:** Update to accept contact info in payload (WEB-4233)
- **Process:**
  1. Verifies payment completion
  2. Sends registration request to AWS Route53 with hardcoded contact info
  3. Updates domain status to 'submitted'
  4. Returns AWS operation ID for status polling
- **Future Payload Structure:**
  ```typescript
  {
    firstName: string
    lastName: string
    email: string
    phoneNumber: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    zipCode: string
  }
  ```

#### Check Registration Status
**GET** `/domains/status`
- Checks the status of domain registration with AWS
- Queries AWS Route53 for operation completion
- Updates domain status to 'registered' when successful
- Returns current operation status from AWS

#### Configure Domain
**POST** `/domains/configure`
- Configures DNS and hosting after successful registration
- **Process:**
  1. Disables auto-renewal on AWS Route53
  2. Sets DNS A record to point to Vercel's IP
  3. Adds domain to Vercel project for hosting
  4. Updates domain status to 'active'
- To be called after registration is complete and domain is 'registered'

