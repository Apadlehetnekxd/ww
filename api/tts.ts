import { visionEnvironment } from '../server/vision-env';
import { handleTtsRequest } from '../server/tts-handler';

export const config = { runtime: 'edge' };

export default function tts(request: Request): Promise<Response> {
  return handleTtsRequest(request, visionEnvironment());
}
