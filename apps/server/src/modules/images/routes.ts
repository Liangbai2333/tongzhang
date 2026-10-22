import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { ImagesService } from './service.js';
export function registerImagesRoutes(app: FastifyInstance, service: ImagesService) {
  registerOperation(app, 'uploadImage', service.uploadImage);
  registerOperation(app, 'getImage', service.getImage);
}
