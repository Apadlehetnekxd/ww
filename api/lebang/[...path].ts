import { handleLebangRequest } from '../../server/lebang-handler';

export const config = { runtime: 'edge' };

export default async function lebang(request: Request): Promise<Response> {
  return handleLebangRequest(request, { LEBANG_API_KEY: process.env.LEBANG_API_KEY });
}
