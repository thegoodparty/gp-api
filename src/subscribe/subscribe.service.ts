import { Injectable } from '@nestjs/common'
import { SubscribeEmailSchema } from './subscribeEmail.schema'

@Injectable()
export class SubscribeService {
  async subscribeEmail(body: SubscribeEmailSchema) {
    const {
      email,
      uri,
      name,
      formId,
      pageName,
      firstName,
      lastName,
      additionalFields,
    } = body

    let { phone } = body

    const id = formId || '5d84452a-01df-422b-9734-580148677d2c'

    const crmFields = [
      { name: 'email', value: email.toLowerCase(), objectTypeId: '0-1' },
    ]
    if (name) {
      crmFields.push({ name: 'full_name', value: name, objectTypeId: '0-1' })
    }
    if (firstName) {
      crmFields.push({
        name: 'firstname',
        value: firstName,
        objectTypeId: '0-1',
      })
    }
    if (lastName) {
      crmFields.push({
        name: 'lastName',
        value: lastName,
        objectTypeId: '0-1',
      })
    }
    if (phone) {
      // Strip phone to digits only
      phone = phone.replace(/\D/g, '')
      if (phone.length === 10) {
        phone = `+1${phone}`
      } else if (phone.length === 11 && phone[0] === '1') {
        phone = `+${phone}`
      }
      crmFields.push({
        name: 'phone',
        value: phone,
        objectTypeId: '0-1',
      })
    }

    if (additionalFields) {
      const fields = JSON.parse(additionalFields)
      for (const field of fields) {
        crmFields.push(field)
      }
    }
    const page = pageName || 'homePage'

    // TODO: Write hubspot service including submitForm function
    // await helper submitForm(id, crmFields, page, uri)

    return
  }
}
