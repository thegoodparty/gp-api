import { Injectable } from '@nestjs/common';
import { svgUploader } from 'src/shared/util/svgUploader.util';
import crypto from 'crypto';

function md5(data: string) {
  return crypto.createHash('md5').update(data).digest('hex');
}

@Injectable()
export class TopIssuesService {

  async create(name: string, icon?: string | null): Promise<object> {
    // Create a new top issue, and hold the newly created id in a variable
    const id = '';

    const iconUrl = icon
      ? await svgUploader(
        `topissue-icon-${id}-${md5(icon)}.svg`,
        'top-issue-icons',
        icon,
      )
    : null;

  }
}
