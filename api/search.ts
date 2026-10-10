import { handleWebSearchRequest } from '../server/web-search-handler';

export const config = { runtime: 'edge' };

export default async function search(request: Request): Promise<Response> {
  return handleWebSearchRequest(request, { SERPAPI_KEY: process.env.SERPAPI_KEY });
}
