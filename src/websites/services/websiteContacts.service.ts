import { Injectable } from '@nestjs/common'
import { createPrismaBase } from 'src/prisma/util/prisma.util'
import { MODELS } from 'src/prisma/util/prisma.util'
import { ContactFormSchema } from '../schemas/ContactForm.schema'

@Injectable()
export class WebsiteContactsService extends createPrismaBase(
  MODELS.WebsiteContact,
) {
  create(websiteId: number, body: ContactFormSchema) {
    return this.model.create({
      data: {
        ...body,
        websiteId,
      },
    })
  }
}
