import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
export interface ImagesService {
  uploadImage: Handler<'uploadImage'>;
  getImage: Handler<'getImage'>;
}
export function createImagesService(): ImagesService {
  return {
    uploadImage: notReady('uploadImage'),
    getImage: notReady('getImage'),
  };
}
