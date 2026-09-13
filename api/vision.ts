import { visionEnvironment } from '../server/vision-env';
import { handleVisionRequest } from '../server/vision-handler';

export const config = { runtime: 'edge' };

export default function vision(request: Request): Promise<Response> {
  return handleVisionRequest(request, visionEnvironment());
}
