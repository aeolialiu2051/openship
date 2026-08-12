import { NextResponse } from "next/server";
import { resolveCollectionPreviewUrl } from "@/lib/collection-preview";

type PreviewInput = { id: string; url: string; framework?: string | null };
const MAX_PROJECTS = 60;
const CONCURRENCY = 6;

function isPreviewInput(value: unknown): value is PreviewInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.url === "string";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { projects?: unknown } | null;
  if (!Array.isArray(body?.projects)) {
    return NextResponse.json({ error: "Invalid preview request" }, { status: 400 });
  }
  const projects = body.projects.filter(isPreviewInput).slice(0, MAX_PROJECTS);
  const results: Record<string, string | null> = {};
  let cursor = 0;

  async function worker() {
    while (cursor < projects.length) {
      const project = projects[cursor++];
      results[project.id] = await resolveCollectionPreviewUrl(project);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, projects.length) }, () => worker()),
  );
  return NextResponse.json(
    { data: results },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
