import { ImageRaw, ImageClean } from "../content.types";

export function extractMediaFile(img: ImageRaw | null): ImageClean {
  if (!img?.fields?.file?.url) {
    return { url: '', alt: '', size: null };
  }

  const { url, details } = img.fields.file;
  return {
    url,
    alt: img.fields.title || '',
    size: details?.image || null,
  };
}