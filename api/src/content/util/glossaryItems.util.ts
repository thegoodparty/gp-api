import { GlossaryItemAugmented } from '../content.types'
import { mapToObject } from '../../shared/util/maps.util'

export const groupGlossaryItemsByAlpha = (
  items: GlossaryItemAugmented[],
): {
  [k: string]: GlossaryItemAugmented[]
} =>
  mapToObject(
    items.reduce(
      (
        itemAlphaGroups: Map<string, GlossaryItemAugmented[]>,
        item: GlossaryItemAugmented,
      ): Map<string, GlossaryItemAugmented[]> => {
        const { title } = item
        const firstLetter = title.charAt(0).toUpperCase()
        return itemAlphaGroups.set(firstLetter, [
          ...(itemAlphaGroups.get(firstLetter) || []),
          item,
        ])
      },
      new Map(),
    ),
  )

type GlossaryItemsMappedBySlug = {
  [k: string]: GlossaryItemAugmented
}

export const mapGlossaryItemsToSlug = (
  items: GlossaryItemAugmented[],
): GlossaryItemsMappedBySlug =>
  items.reduce(
    (acc, item: GlossaryItemAugmented) => ({ ...acc, [item.slug]: item }),
    {} as GlossaryItemsMappedBySlug,
  )
