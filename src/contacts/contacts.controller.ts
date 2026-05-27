import { Controller, Get, Param, Query, Res, UsePipes } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { FastifyReply } from 'fastify'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqOrganization } from 'src/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from 'src/organizations/decorators/UseOrganization.decorator'
import { GetPersonParamsDTO } from './schemas/getPerson.schema'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from './schemas/listContacts.schema'
import { ContactsService } from './services/contacts.service'

@Controller('contacts')
@UseOrganization()
@UsePipes(ZodValidationPipe)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async listContacts(
    @Query() filterDto: ListContactsDTO,
    @ReqOrganization() organization: Organization,
  ) {
    return this.contactsService.findContacts(filterDto, organization)
  }

  @Get('download')
  async downloadContacts(
    @Query() dto: DownloadContactsDTO,
    @ReqOrganization() organization: Organization,
    @Res() res: FastifyReply,
  ) {
    // Headers (Content-Type, Content-Disposition, Set-Cookie) are written and
    // flushed inside the service AFTER pre-flight checks pass and the
    // upstream people-api stream is in hand. That keeps a structured 4xx/5xx
    // possible if the org isn't pro or the upstream call fails, instead of
    // committing `attachment; filename="contacts.csv"` to the wire and then
    // serving a JSON error body the browser would save to disk.
    await this.contactsService.downloadContacts(dto, res, organization)
  }

  @Get('stats')
  getContactsStats(@ReqOrganization() organization: Organization) {
    return this.contactsService.getDistrictStats(organization)
  }

  @Get(':id')
  async getContact(
    @Param() params: GetPersonParamsDTO,
    @ReqOrganization() organization: Organization,
  ) {
    return this.contactsService.findPerson(params.id, organization)
  }
}
