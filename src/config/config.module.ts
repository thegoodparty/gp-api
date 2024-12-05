import { ConfigModule as NestConfigModule } from '@nestjs/config'
import customConfig from './custom'

export const ConfigModule = NestConfigModule.forRoot({
  isGlobal: true,
  // we can load any number of extra config files here, e.g. load: [customConfig, someConfig, otherConfig, ...]
  load: [customConfig],
})
