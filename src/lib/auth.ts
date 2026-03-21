import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from './jwt';

function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * JWT 검증 + sub === targetChannelId 확인
 * 실패 시 reply에 에러 응답 전송 후 false 반환
 * 성공 시 true 반환
 */
export async function requireSelf(
  request: FastifyRequest,
  reply: FastifyReply,
  targetChannelId: string
): Promise<boolean> {
  const token = extractToken(request);
  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return false;
  }
  try {
    const decoded = verifyJwt(token);
    if (decoded.sub !== targetChannelId) {
      reply.status(403).send({ error: 'Forbidden' });
      return false;
    }
    return true;
  } catch {
    reply.status(401).send({ error: 'Invalid token' });
    return false;
  }
}
