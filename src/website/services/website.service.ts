import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class WebsiteService extends createPrismaBase(MODELS.Website) {}
