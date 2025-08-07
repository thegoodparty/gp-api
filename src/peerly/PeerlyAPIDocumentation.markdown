# Peerly API Documentation

## Get Authentication Token
**POST** `https://app.peerly.com/api/token-auth`

API endpoint for obtaining a new JWT that is required to authenticate subsequent requests.

### Overview
Peerly expects the user e-mail and password to be sent **as MD5 hashes**—sending the raw credentials will fail.

### Headers
- `Accept: application/json`
- `Content-Type: application/json`

### Request Body (JSON)
```json
{
  "email": "<md5(lowercase email)>",
  "password": "<md5(password)>"
}
```
Example:
```json
{
  "email": "d54b8886ae0b63d8f582f9d4cb78beb5",
  "password": "eb869bc52b0566d34815c27771cc2972"
}
```

### Successful Response (`200`)
```json
{
  "token": "<jwt token>",
  "root_accounts": ["11536770"],
  "user": {
    "first_name": "Matthew",
    "last_name": "Marcus",
    "email": "matthew@goodparty.org",
    "user_id": 65069,
    "user_type": "USER",
    "local_timezone": "US/Central",
    "identities": []
  }
}
```

---

## Upload Phone List
**POST** `https://app.peerly.com/api/phonelists`

API endpoint for uploading a phone list to an account.

### Note: PHP cURL Usage
If using PHP Version 5.5 or later with cURL, use the following to ensure the file is sent correctly:
- Instead of `'file' => '@' . realpath('path/filename.csv')`, use:
  `'file' => curl_file_create(realpath('path/filename.csv'))`
This prevents errors indicating that `'file'` is a required parameter.

### Content Type
Unlike other endpoints, this endpoint uses `multipart/form-data` content type. Most HTTP libraries set this automatically, so you likely do not need to specify the `Content-Type` header.

### Overview
Uploading a phone list requires:
- The **account ID** of the account to upload the phone list into.
- The **phone list file** (accepted formats: `.csv` or a `.zip` containing a `.csv`).
- A **list name** is strongly recommended but not required.

The endpoint returns a **token value** used to:
- Query the status of the phone list via the **Check Phone List Status** endpoint.
- Retrieve the `list_id` after processing completes.

### List Upload Token
Save the token returned in the response for querying the list upload status and obtaining the `list_id`.

### Suppress Cell Phones
The `suppress_cell_phones` parameter determines how phone numbers are filtered:
| Value | Product Type | Description |
|-------|--------------|-------------|
| 0     | IVR          | **No suppression**. No additional numbers removed (except DNC numbers). |
| 1     | IVR          | **Suppress Cell Phones**. Removes all cell phone numbers, leaving only landlines. Recommended for most IVR jobs. |
| 4     | P2P          | **Suppress Landlines**. Removes all landline numbers, leaving only cell phones. Recommended for P2P jobs. |

### Zip Files
If a `.zip` file contains multiple `.csv` files, they will be combined into a single list. Multi-list uploads are not supported, but multi-file uploads within a single `.zip` are.

### List Mapping
If your account has **list mapping enabled**, you must include a JSON `list_map` object to associate column headers with data fields. Example:
```json
{
  "list_map": {
    "first_name": 1,
    "last_name": 2,
    "lead_phone": 3,
    "aux_data1": 4
  }
}
```
Available columns for mapping:
- `lead_phone`
- `extern_id`
- `xtitle`
- `first_name`
- `mid_name`
- `last_name`
- `suffix`
- `address1`
- `address2`
- `city`
- `state`
- `zip`
- `email`
- `gate_keeper`
- `aux_data1`
- `aux_data2`
- `aux_data3`
- `aux_data4`
- `aux_data5`

### Opt-in Information
For all list types except P2P (`suppress_cell_phones=4`), the `opt_in` parameter is required.

#### If `opt_in = 1`:
- **Required fields**:
  - `opt_in_source_url`: URL where opt-in data is collected.
  - `last_contact`: One of: `'WITHIN_LAST_WEEK'`, `'WITHIN_LAST_MONTH'`, `'WITHIN_TWO_MONTHS'`, `'WITHIN_THREE_MONTHS'`, `'WITHIN_SIX_MONTHS'`, `'OVER_SIX_MONTHS'`, `'NEVER'`.
  - `list_description`: Description of how opt-in data was acquired.

#### If `opt_in = 0`:
- **Required fields**:
  - `opt_exempt_initials`: User's first and last initials, signifying the list is opt-in exempt.
  - `last_contact`: Same options as above.
  - `list_description`: Explanation of why the data is opt-in exempt.

### API Explorer Limitation
The API Explorer does not support this endpoint because it requires file object submission.

### Body Parameters
| Parameter                  | Type   | Required | Description |
|----------------------------|--------|----------|-------------|
| `account`                  | string | Yes      | ID number for the account to upload the list to. |
| `identity_id`              | string | No       | ID number of the identity to load the list into, if different from account ID. |
| `list_name`                | string | Yes      | Name for the phone list. |
| `split_states`             | int32  | No       | Boolean (0 or 1, defaults to 0). Splits the list into sublists by the lead phone's state. |
| `split_timezones`          | int32  | No       | Boolean (0 or 1, defaults to 1). Splits the list into sublists by the lead phone's timezone. |
| `suppress_cell_phones`     | int32  | No       | Integer (0, 1, or 4, defaults to 0). See suppression details above. |
| `wireless_suppress_initials` | string | Yes (if `suppress_cell_phones=0`) | User's first and last initials. |
| `use_nat_dnc`              | int32  | No       | Boolean (0 or 1, defaults to 0). Filters the list against the National DNC list. |
| `use_state_dnc`            | int32  | No       | Boolean (0 or 1, defaults to 0). Filters the list against the state DNC list. |
| `dnc_suppress_initials`    | string | Yes (if `use_nat_dnc=0`) | User's first and last initials. |
| `state_dnc_suppress_initials` | string | Yes (if `use_state_dnc=0`) | User's first and last initials. |
| `file`                     | file   | Yes      | The phone list file (`.csv` or `.zip` of `.csv`). |
| `opt_in`                   | int32  | Yes (for IVR and Bulk SMS) | Boolean (0 or 1). Indicates if the list is opt-in. |
| `opt_in_source_url`        | string | Yes (if `opt_in=1`) | URL where opt-in data is collected. |
| `opt_exempt_initials`      | string | Yes (if `opt_in=0`) | User's first and last initials for opt-in exemption. |
| `last_contact`             | string | Yes      | Date range for opt-in data. See options above. |
| `list_description`         | string | Yes      | Description of the list data or opt-in exemption reason. |

### Example Request

Headers:
- `Authorization: JWT <token>`
- `Accept: application/json`
- `Content-Type: multipart/form-data`

Form fields (multipart):
```
account=12345678
list_name=API Test Phone List
split_states=0
split_timezones=1
suppress_cell_phones=0
use_nat_dnc=1
use_state_dnc=0
file=@/path/to/phonelist.csv
list_map={"first_name":1,"last_name":2,"lead_phone":3,"aux_data1":4}
```

Example Success Response (`201`)
```json
{
  "Data": {
    "account_id": "12345678",
    "token": "<list_status_token>",
    "is_mapped_list": 1,
    "list_name": "API Test Phone List",
    "list_state": "PENDING",
    "pending_list_id": 4960,
    "split_states": 1,
    "split_timezones": 1,
    "suppress_cell_phones": 0,
    "uploaded_by": "<Your Name>",
    "uploaded_date": "2016-06-13T16:31:01.575Z",
    "use_nat_dnc": 0
  }
}
```

### Responses
- **201**: Success
- **400**: Bad Request

---

## Check Phone List Status
**GET** `https://app.peerly.com/api/phonelists/{list_status_token}/checkstatus`

API endpoint to check the current status of a phone list using the provided list token.

### Overview
The **Check Phone List Status** endpoint returns the current status of a phone list identified by the `list_status_token` provided during the list upload. The endpoint always returns a **200** response if the list is found, along with the list's status.

- If the list status is **ACTIVE**, the response includes a `list_id`, indicating the list is ready for assignment to a campaign.
- For any other status, the list is still processing and not yet ready for assignment.

#### Recommended Practice
After uploading a phone list, query this endpoint approximately every **30 seconds** until the `list_status` is **ACTIVE** and a `list_id` is returned.

### Path Parameters
| Parameter           | Type   | Required | Description |
|---------------------|--------|----------|-------------|
| `list_status_token` | string | Yes      | Phone list upload token provided when the list was uploaded. |

### Example Request

Headers:
- `Authorization: JWT <token>`
- `Accept: application/json`

No body parameters required.

### Example Success Response (`200`)
```json
{
  "Data": {
    "list_id": 123456,
    "list_state": "ACTIVE"
  }
}
```

### Responses
- **200**: Success (includes list status and `list_id` if status is ACTIVE)
- **400**: Bad Request

---

## Create Job
**POST** `https://app.peerly.com/api/1to1/jobs`

API endpoint to create a P2P SMS job.

### Body Parameters
| Parameter                   | Type            | Required | Description |
|-----------------------------|-----------------|----------|-------------|
| `account_id`                | string          | Yes      | ID of the account to create the job under. |
| `name`                      | string          | Yes      | Name for the 1to1 SMS job. |
| `status`                    | string          | No       | Status of the job. Options: `"active"` or `"paused"`. Defaults to `"active"`. |
| `templates`                 | array of objects | Yes      | Array of template messages for agents to use. Currently, only one template is allowed and will be used as the default for starting conversations. |
| `templates[].is_default`    | boolean         | No       | Indicates if the template is the default. Defaults to `false`. |
| `templates[].text`          | string          | Yes      | The template text to send to the conversation. |
| `templates[].title`         | string          | Yes      | The title of the template. |
| `templates[].advanced`      | object          | No       | An advanced template object. |
| `templates[].advanced.media`| object          | No       | Media file details for MMS. |
| `templates[].advanced.media.media_id` | string | Yes (if media is included) | Media ID. |
| `templates[].advanced.media.media_type` | string | Yes (if media is included) | Type of media. Options: `"IMAGE"`, `"VIDEO"`. |
| `templates[].advanced.media.preview_url` | string | No       | Optional URL to media preview. |
| `templates[].advanced.media.thumbnail_url` | string | No       | URL to media thumbnail. |
| `templates[].advanced.media.title` | string | No       | Title of media. |
| `did_state`                 | string          | Yes      | Two-letter state abbreviation (e.g., "NY"), `"USA"`, or `"CAN"` to provision a Caller ID. |
| `did_npa_subset`            | array of strings | No       | Array of area codes to prioritize when initializing DIDs (Caller IDs). Defaults to `[]`. |
| `questions`                 | array of objects | No       | Questions for the job. |
| `agent_ids`                 | array of strings | No       | Array of `agent_id` strings for agents assigned as responders. |
| `can_use_mms`               | boolean         | No       | Indicates if the job is MMS-enabled. Defaults to `false`. |
| `identity_id`               | string          | No       | ID of the identity to create the job under, if different from `account_id`. |
| `usecase`                   | string          | No       | Specific usecase from one of your registered campaigns. |
| `schedule_id`               | int32           | No       | ID of a specific schedule to assign to the job. |
| `start_date`                | string          | No       | First day the job is active. |
| `end_date`                  | string          | No       | Final day the job is active. |
| `ai_enabled`                | boolean         | No       | Flag to enable AI features for the job. Defaults to `false`. |
| `ai_auto_opt_out_threshold` | string          | No       | Minimum threshold for automatic opt-out. Options: `"DISABLED"`, `"LIKELY"`, `"VERY_LIKELY"`, `"EXTREMELY_LIKELY"`. Defaults to `"DISABLED"`. |

### Example Request

Headers:
- `Authorization: JWT <token>`
- `Accept: application/json`
- `Content-Type: application/json`

```json
{
  "account_id": "88889754",
  "agent_ids": [
    "MhzSZuveWPMrdkGGPKt7LYGIDKc2@88889754",
    "URpTNIBpd2Quts7NIE7RNpRv5xJ3@88889754"
  ],
  "ai_auto_opt_out_threshold": "EXTREMELY_LIKELY",
  "ai_enabled": true,
  "can_use_mms": true,
  "did_npa_subset": ["954", "754"],
  "did_state": "FL",
  "dynamic_reassignment": false,
  "end_date": "2025-06-03",
  "external_billing_id": "05231",
  "identity_id": "88889754",
  "name": "01 Job Example",
  "questions": [
    {
      "controlType": "select",
      "id": "9TyQPSg5OuTEYk55ZEGe",
      "responses": [
        {
          "id": "PR7sF6kgkY1iseeKk8A6",
          "template": "BCegZ9WKXfFGsbuqdxq8",
          "text": "Yes"
        },
        {
          "id": "2Fy5GXZ7RWuVmABoE5wd",
          "template": "3ZtbstQcB5zjFH0p4LVE",
          "text": "No"
        }
      ],
      "template": "",
      "title": "Are you able to donate?"
    },
    {
      "controlType": "number",
      "id": "fAcAXfVOM164ludYOw6E",
      "responses": [],
      "template": "5wzr14zVJvV8PeZAd8Lv",
      "title": "How much are you able to donate today?"
    },
    {
      "controlType": "text",
      "id": "wmP6NhkfnOB5x2CeeNWV",
      "responses": [],
      "template": "",
      "title": "What is your full name?"
    }
  ],
  "schedule_id": 10537189,
  "start_date": "2025-06-03",
  "templates": [
    {
      "id": "1M93TFzJYm7e5xNNFlrr",
      "is_default": true,
      "media": {
        "media_id": "08666501-a3bd-4f4a-abf6-02eebdf4b53a8",
        "media_type": "VIDEO",
        "preview_url": "https://firebasestorage.googleapis.com/v0/b/mms-transcoding-production/o/...",
        "thumbnail_url": "https://firebasestorage.googleapis.com/v0/b/mms-transcoding-production/o/...",
        "title": "Wheat - 720 x 720 - 46s - H264 - 25 fps.mp4"
      },
      "text": "Hi, {first_name}, this is {agent_first_name} from Organization. Thank you for your support! We could not continue without the backing of individuals like you. Would you be able to make a donation today?\\n\\nSTOP to stop",
      "title": "Default Template"
    },
    {
      "has_dynamic_media": false,
      "has_dynamic_media_rendered": false,
      "id": "BCegZ9WKXfFGsbuqdxq8",
      "is_default": false,
      "text": "Thank you so much for your support! You can make your pledge here:\\n\\n https://{tracked_link_1} \\n\\nHow much are you able to pledge today?",
      "title": "Able to Donate"
    },
    {
      "has_dynamic_media": false,
      "has_dynamic_media_rendered": false,
      "id": "3ZtbstQcB5zjFH0p4LVE",
      "is_default": false,
      "text": "We understand and thank you for your past support!",
      "title": "Not Able to Donate"
    },
    {
      "id": "5wzr14zVJvV8PeZAd8Lv",
      "is_default": false,
      "text": "That's amazing! And could we get your full name to update our records?",
      "title": "Name"
    }
  ],
  "tracked_links": [
    {
      "destination_url": "https://www.merriam-webster.com/dictionary/donate",
      "domain_id": "abcdeUySg5LRWktRXaTc2jwWiOoeGHNCu",
      "domain_name": "votenow.win",
      "id": 1,
      "is_deleted": false
    }
  ]
}
```

### Example Success Response (`201`)
```json
{
  "agents": [],
  "name": "Some Job Name",
  "status": "active",
  "templates": [
    { "is_default": true, "text": "Some template text to start a conversation.", "title": "Default Template" }
  ]
}
```

### Responses
- **201**: Success
- **400**: Bad Request

---

## Add Single Phone List to Job
**POST** `https://app.peerly.com/api/1to1/jobs/{id}/assignlist`

API endpoint to add a single phone list to an existing P2P SMS job.

### Note
This endpoint appends the new phone list to the job without affecting existing assigned lists.

### Path Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `id`      | string | Yes      | ID of the 1to1 SMS job. |

### Body Parameters
| Parameter  | Type  | Required | Description |
|------------|-------|----------|-------------|
| `list_id`  | int32 | Yes      | ID of the phone list to assign to the job. |

### Example Request

Headers:
- `Authorization: JWT <token>`
- `Accept: application/json`
- `Content-Type: application/json`

```json
{
  "list_id": 1235
}
```

### Example Success Response (`200`)
```json
{
  "agents": [],
  "phone_lists": [1234, 2345, 3456, 1235],
  "name": "Some Job Name",
  "status": "active",
  "templates": [
    { "is_default": true, "text": "Some template text to start a conversation.", "title": "Default Template" }
  ]
}
```

### Responses
- **200**: Success
- **400**: Bad Request

---

## Create Media
**POST** `https://app.peerly.com/api/v2/media`

API endpoint to create a new media object.

### Note
This endpoint may return a **201** response even if the media creation process fails. Check the `status` field in the response. If `status` is `"ERROR"`, the `error` field will provide additional details.

### Body Parameters
| Parameter             | Type   | Required | Description |
|-----------------------|--------|----------|-------------|
| `account_id`          | string | Yes      | The base account ID for the media file. |
| `identity_id`         | string | Yes      | The identity ID that the media will belong to. |
| `title`               | string | No       | Name of the media file. |
| `initial_file_upload` | file   | Yes      | The media file to upload. |

### Example Request

Headers:
- `Authorization: JWT <token>`
- `Accept: application/json`
- `Content-Type: multipart/form-data`

Form fields (multipart):
```
account_id=12345678
identity_id=88881234
title=Test File
initial_file_upload=@/path/to/1080-31sec-test.mp4
```

### Example Success Response (`201`)
```json
{
  "account_id": "88880335",
  "base_gcs_uri": "",
  "created_by": "<user_id>",
  "created_date": "2022-04-05T16:24:37.821827Z",
  "deleted_by": "",
  "deleted_date": "null",
  "duration_ms": 30030,
  "error": "Error encountered attempting to process this media object. Please try again or contact support.",
  "identity_id": "88880335",
  "initial_file_upload": "<file url>",
  "is_deleted": "false",
  "last_touched_by": "1",
  "last_touched_date": "2022-04-05T16:24:45.837520Z",
  "media_id": "20700112-8968-430d-9f37-cbbe52074680",
  "media_type": "VIDEO",
  "mime_type": "video/mp4",
  "preview_url": "",
  "size_bytes": 6367014,
  "status": "ERROR",
  "thumbnail_url": "",
  "title": "Media Title",
  "variants": ""
}
```

### Responses
- **201**: Success (check `status` field for `"ERROR"` if creation fails)
- **400**: Bad Request