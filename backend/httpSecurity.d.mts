export const MAX_JSON_BODY_BYTES: number;
export class HttpRequestError extends Error {
  status: number;
  constructor(status: number, message: string);
}
export function resolveCorsOrigin(originHeader?: string | null, extraOriginsCsv?: string): string | null;
export function resolveSafeStaticFile(
  distDir: string,
  rawPathname?: string
): { ok: true; filePath: string } | { ok: false; status: number; error: string };
export function readBoundedJsonBody(req: NodeJS.ReadableStream, maxBytes?: number): Promise<unknown>;
