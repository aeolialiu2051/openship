interface KVNamespace {
  get(key: string, type: "json"): Promise<unknown | null>;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ExportedHandler<Env> {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
}
