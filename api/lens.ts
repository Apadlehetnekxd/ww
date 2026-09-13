import { handleLensRequest } from '../server/lens-handler';

export const config = { runtime: 'edge' };

export default async function lens(request: Request): Promise<Response> {
  return handleLensRequest(request, { SERPAPI_KEY: process.env.SERPAPI_KEY });
}
