import type { StackId } from "./stacks";

export interface StarterTemplateMetadata {
  name: string;
  packageManager: string;
}

/**
 * Client-safe starter catalog. Full source files live in starter-templates.ts
 * and are only needed by the API when it materializes a selected template.
 */
export const STARTER_TEMPLATE_METADATA = {
  nextjs: { name: "nextjs-starter", packageManager: "npm" },
  nuxt: { name: "nuxt-starter", packageManager: "npm" },
  sveltekit: { name: "sveltekit-starter", packageManager: "npm" },
  astro: { name: "astro-starter", packageManager: "npm" },
  vite: { name: "vite-starter", packageManager: "npm" },
  express: { name: "express-starter", packageManager: "npm" },
  koa: { name: "koa-starter", packageManager: "npm" },
  node: { name: "node-starter", packageManager: "npm" },
  go: { name: "go-starter", packageManager: "go" },
  rust: { name: "rust-starter", packageManager: "cargo" },
  python: { name: "python-starter", packageManager: "pip" },
  flask: { name: "flask-starter", packageManager: "pip" },
  fastapi: { name: "fastapi-starter", packageManager: "pip" },
  django: { name: "django-starter", packageManager: "pip" },
  sinatra: { name: "sinatra-starter", packageManager: "bundler" },
  springboot: { name: "springboot-starter", packageManager: "maven" },
  dotnet: { name: "dotnet-starter", packageManager: "dotnet" },
} as const satisfies Partial<Record<StackId, StarterTemplateMetadata>>;

export type StarterTemplateId = keyof typeof STARTER_TEMPLATE_METADATA;

export function hasStarterTemplate(stackId: string): stackId is StarterTemplateId {
  return Object.prototype.hasOwnProperty.call(STARTER_TEMPLATE_METADATA, stackId);
}
