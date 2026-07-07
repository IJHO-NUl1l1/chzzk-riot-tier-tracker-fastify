// 라우트들이 공유하는 JSON Schema 조각.
//
// Fastify는 route의 schema에 선언된 내용으로 두 가지를 한다:
//  - querystring/body/params: Ajv로 컴파일된 검증기가 핸들러 진입 전에 실행되어
//    위반 시 자동으로 400을 응답한다 (핸들러의 수동 if 검증 대체)
//  - response: fast-json-stringify로 부팅 시 전용 직렬화 함수를 컴파일한다.
//    JSON.stringify보다 빠르고, 선언되지 않은 필드는 응답에서 제외된다(유출 방어).
//    단, 새 필드를 응답에 추가할 때 스키마에도 반드시 추가해야 한다 — 빠뜨리면
//    에러 없이 조용히 누락된다.
//
// Riot API 응답을 그대로 통과시키는 프록시 라우트에는 response 스키마를 걸지
// 않는다. Riot이 필드를 추가/변경할 때 조용히 잘려나가기 때문.

/** LoL/TFT 게임 타입. `!['lol','tft'].includes(...)` 수동 검증을 대체한다. */
export const gameTypeSchema = { type: 'string', enum: ['lol', 'tft'] } as const;

/** 비어 있지 않은 문자열. required와 조합해 "필수 파라미터" 검증에 쓴다. */
export const nonEmptyString = { type: 'string', minLength: 1 } as const;

/** null 허용 문자열 (DB의 nullable 컬럼 값을 주고받는 필드용). */
export const nullableString = { type: ['string', 'null'] } as const;

/** `{ error: string }` 에러 응답. response 스키마에 200을 선언하면 Fastify
 *  타입이 reply.status()를 선언된 코드로 좁히므로, 핸들러가 보내는 에러
 *  코드도 함께 선언해야 한다. */
export const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const;
