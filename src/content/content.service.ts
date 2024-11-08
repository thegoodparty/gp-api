import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateContentDto } from './dto/create-content.dto'
import { UpdateContentDto } from './dto/update-content.dto'
import { ContentfulService } from '../contentful/contentful.service'

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private contentfulService: ContentfulService,
  ) {}
  create(createContentDto: CreateContentDto) {
    console.log(`createContentDto =>`, createContentDto)
    return 'This action adds a new content'
  }

  findAll() {
    return this.prisma.content.findMany()
  }

  findOne(id: number) {
    return `This action returns a #${id} content`
  }

  update(id: number, updateContentDto: UpdateContentDto) {
    console.log(`updateContentDto =>`, updateContentDto)
    return `This action updates a #${id} content`
  }

  remove(id: number) {
    return `This action removes a #${id} content`
  }

  async syncContent(seed?: boolean) {
    return await this.contentfulService.getSync(seed)
  }
}
