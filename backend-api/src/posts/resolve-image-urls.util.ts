import { StorageService } from '../storage/storage.service';

/**
 * Resolves every stored R2 object key in `post.images` to a fully-usable
 * public URL (Image Storage V1 spec, Response Format), without changing
 * the `images[].imageUrl` field name clients already receive.
 *
 * A standalone function (not a `PostsService` method) so it can be reused
 * by other features that present post detail built from `postDetailSelect`
 * — currently `PostsService` itself and `FavoritesService` — without either
 * duplicating this logic or depending on the other's service class.
 */
export function resolveImageUrls<
  T extends { images: { imageUrl: string; displayOrder: number }[] },
>(storageService: StorageService, post: T): T {
  return {
    ...post,
    images: post.images.map((image) => ({
      ...image,
      imageUrl: storageService.getPublicUrl(image.imageUrl),
    })),
  };
}
