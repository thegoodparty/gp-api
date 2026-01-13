import { InternalServerErrorException } from '@nestjs/common'
import {
  CandidateTestimonialAugmented,
  CandidateTestimonialRaw,
  Transformer,
} from '../content.types'
import { extractMediaFile } from '../util/extractMediaFile.util'

export const candidateTestimonialsTransformer: Transformer<
  CandidateTestimonialRaw,
  CandidateTestimonialAugmented
> = (
  testimonials: CandidateTestimonialRaw[],
): CandidateTestimonialAugmented[] => {
  return testimonials.map((testimonial) => {
    const image = extractMediaFile(testimonial.data.image)

    if (!image) {
      throw new InternalServerErrorException(
        `Media file for testimonial ${testimonial.data.name} could not be extracted`,
      )
    }
    return {
      ...testimonial.data,
      image: image,
    }
  })
}
