// lib/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

const SECRET: string = JWT_SECRET;

export function generateChzzkJwt(
  channelId: string,
  channelName: string,
  expiresIn: string = '24h'
): string {
  const payload = {
    sub: channelId,
    channel_name: channelName,
    type: 'chzzk',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, SECRET, {
    expiresIn: expiresIn as any,
    algorithm: 'HS256',
  });
}

export function generateRiotJwt(
  puuid: string,
  gameName: string,
  tagLine: string,
  expiresIn: string = '24h'
): string {
  const payload = {
    sub: puuid,
    game_name: gameName,
    tag_line: tagLine,
    type: 'riot',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, SECRET, {
    expiresIn: expiresIn as any,
    algorithm: 'HS256',
  });
}

export function verifyJwt(token: string): {
  sub: string;
  channel_name?: string;
  game_name?: string;
  tag_line?: string;
  type: 'chzzk' | 'riot';
  iat: number;
  exp: number;
} {
  try {
    return jwt.verify(token, SECRET) as any;
  } catch {
    throw new Error('유효하지 않은 JWT 토큰입니다.');
  }
}

export function isJwtValid(token: string): boolean {
  try {
    const decoded = verifyJwt(token);
    return Date.now() < decoded.exp * 1000;
  } catch {
    return false;
  }
}
