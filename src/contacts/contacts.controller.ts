import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ContactsService } from './contacts.service'
import { ListContactsDTO } from './schemas/listContacts.schema'

@Controller('contacts')
@UsePipes(ZodValidationPipe)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('list')
  listContacts(@Query() filterDto: ListContactsDTO) {
    return this.contactsService.findContacts(filterDto)
  }
}
