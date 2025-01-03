import {
  CandidateTestimonalRaw,
  CandidateTestimonialAugmented,
  Transformer,
} from '../content.types'
import { extractMediaFile } from '../util/extractMediaFile.util'
import { InternalServerErrorException } from '@nestjs/common'

export const candidateTestimonialsTransformer: Transformer<
  CandidateTestimonalRaw,
  CandidateTestimonialAugmented
> = (
  testimonials: CandidateTestimonalRaw[],
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
