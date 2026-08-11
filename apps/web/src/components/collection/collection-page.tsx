"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Globe2,
  Heart,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { landingCopy, type LandingLocale } from "@/components/landing/landing-copy";
import { useLandingPreferences } from "@/components/landing/use-landing-preferences";
import { getFrameworkConfig } from "@/lib/frameworks";

export type Project = {
  id: string;
  name: string;
  slug: string;
  url: string;
  favicon?: string | null;
  framework?: string | null;
  previewable?: boolean;
  updatedAt?: string;
  publisher?: { name: string; image?: string | null } | null;
  likeCount?: number;
  likedByViewer?: boolean;
  commentCount?: number;
  comments?: Array<{
    id: string;
    projectId: string;
    content: string;
    createdAt: string;
    author: { name: string; image?: string | null };
  }>;
};
const text = {
  en: {
    search: "Search the collection",
    ship: "Ship your project",
    badge: "Built on Vibrail",
    title: "Things people shipped.",
    intro: "Small experiments, useful tools, and ambitious products — live on the open web.",
    noMatch: "No matching projects",
    warming: "The collection is warming up",
    retry: "Try a different search.",
    empty:
      "Public Vibrail projects appear here automatically after their first successful deployment.",
    deployed: "Deployed with Vibrail",
    comments: "Comments",
    start: "Start the conversation.",
    feedback: "Share feedback with the maker.",
    signIn: "Sign in to leave a comment",
    commentPlaceholder: "Write a comment…",
    sendComment: "Post comment",
    authRequired: "Sign in or create an account to continue.",
    failed: "Something went wrong. Please try again.",
    open: "Open live site",
    project: "Web project",
    close: "Close",
    like: "Like project",
    list: "Public Vibrail projects",
    by: "by",
    unknownPublisher: "Vibrail user",
  },
  zh: {
    search: "搜索 Collection",
    ship: "部署你的项目",
    badge: "由 Vibrail 构建",
    title: "看看大家做了什么。",
    intro: "小实验、实用工具和充满野心的产品，都在开放网络上真实运行。",
    noMatch: "没有匹配的项目",
    warming: "Collection 正在升温",
    retry: "换个关键词试试。",
    empty: "公开的 Vibrail 项目在首次成功部署后会自动出现在这里。",
    deployed: "通过 Vibrail 部署",
    comments: "评论",
    start: "来发第一条评论吧。",
    feedback: "给创作者留下你的反馈。",
    signIn: "登录后发表评论",
    commentPlaceholder: "写下你的评论…",
    sendComment: "发表评论",
    authRequired: "请先登录或注册后继续。",
    failed: "操作失败，请重试。",
    open: "打开线上项目",
    project: "Web 项目",
    close: "关闭",
    like: "喜欢这个项目",
    list: "公开的 Vibrail 项目",
    by: "发布者",
    unknownPublisher: "Vibrail 用户",
  },
} as const;

function VibrailPreviewPlaceholder() {
  return (
    <div className="collection-preview-placeholder" aria-hidden="true">
      <img src="/apple-touch-icon.png" alt="" />
      <span>Vibrail</span>
    </div>
  );
}

function CollectionPreview({
  project,
  interactive = false,
}: {
  project: Project;
  interactive?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [project.url]);

  if (project.previewable === false || failed) return <VibrailPreviewPlaceholder />;

  return (
    <>
      <iframe
        src={project.url}
        title={interactive ? project.name : `${project.name} preview`}
        loading={interactive ? "eager" : "lazy"}
        tabIndex={interactive ? undefined : -1}
        sandbox={
          interactive
            ? "allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
            : "allow-scripts allow-same-origin"
        }
        onError={() => setFailed(true)}
      />
      {!interactive && <div className="collection-preview-shield" />}
    </>
  );
}

export function CollectionPage({
  initialProjects,
  initialLocale,
  dashboardLoginUrl,
  apiUrl,
}: {
  initialProjects: Project[];
  initialLocale?: LandingLocale;
  dashboardLoginUrl: string;
  apiUrl: string;
}) {
  const { locale, setLocale, theme, setTheme } = useLandingPreferences(initialLocale);
  const copy = text[locale];
  const [query, setQuery] = useState("");
  const [allProjects, setAllProjects] = useState(initialProjects);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const continuationHandled = useRef(false);
  const selected = allProjects.find((project) => project.id === selectedId) ?? null;
  const projects = useMemo(
    () =>
      allProjects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())),
    [allProjects, query],
  );

  useEffect(() => {
    fetch(`${apiUrl}/api/collection`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        setAuthenticated(Boolean(payload.authenticated));
        setAllProjects((current) => payload.data.map((project: Project) => ({
          ...project,
          previewable: current.find((item) => item.id === project.id)?.previewable,
        })));
      })
      .catch(() => {});
  }, [apiUrl]);

  const requireLogin = (projectId?: string, intent?: "like" | "comment") => {
    const loginUrl = new URL(dashboardLoginUrl);
    const returnTo = new URL("/collection", window.location.origin);
    if (projectId && intent) {
      returnTo.searchParams.set("project", projectId);
      returnTo.searchParams.set("intent", intent);
    }
    loginUrl.searchParams.set("returnTo", `${returnTo.pathname}${returnTo.search}`);
    window.location.href = loginUrl.toString();
  };

  const toggleLike = async (projectId: string) => {
    if (!authenticated) return requireLogin(projectId, "like");
    setError("");
    const response = await fetch(`${apiUrl}/api/collection/${projectId}/like`, {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
    if (!response?.ok) {
      if (response?.status === 401) return requireLogin(projectId, "like");
      setError(copy.failed);
      return;
    }
    const result = await response.json();
    setAllProjects((current) => current.map((project) => project.id === projectId
      ? { ...project, likedByViewer: result.liked, likeCount: result.likeCount }
      : project));
  };

  const submitComment = async () => {
    if (!authenticated) return requireLogin(selected?.id, "comment");
    if (!selected || !comment.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const response = await fetch(`${apiUrl}/api/collection/${selected.id}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: comment }),
    }).catch(() => null);
    if (!response?.ok) {
      setSubmitting(false);
      if (response?.status === 401) return requireLogin(selected.id, "comment");
      setError(copy.failed);
      return;
    }
    const result = await response.json();
    setAllProjects((current) => current.map((project) => project.id === selected.id
      ? {
          ...project,
          commentCount: (project.commentCount ?? 0) + 1,
          comments: [...(project.comments ?? []), result.data],
        }
      : project));
    setComment("");
    setSubmitting(false);
  };

  useEffect(() => {
    if (continuationHandled.current || !allProjects.length) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const intent = params.get("intent");
    if (!projectId || !allProjects.some((project) => project.id === projectId)) return;
    if (intent === "comment") {
      continuationHandled.current = true;
      setSelectedId(projectId);
    } else if (intent === "like" && authenticated) {
      continuationHandled.current = true;
      void toggleLike(projectId);
    } else {
      return;
    }
    window.history.replaceState(null, "", "/collection");
  }, [allProjects, authenticated]);

  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selected]);

  return (
    <div className={`vr-site vr-theme-${theme} collection-site`} data-locale={locale}>
      <Navbar
        copy={landingCopy[locale].nav}
        locale={locale}
        theme={theme}
        onLocaleChange={setLocale}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
      <main className="collection-shell">
        <div className="collection-tools">
          <div className="collection-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.search}
              aria-label={copy.search}
            />
          </div>
          <a className="collection-ship" href={dashboardLoginUrl}>
            {copy.ship} <ArrowUpRight size={16} />
          </a>
        </div>
        <section className="collection-hero">
          <span>
            <Sparkles size={14} /> {copy.badge}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </section>

        {projects.length ? (
          <section className="collection-grid" aria-label={copy.list}>
            {projects.map((project, index) => (
              <article
                className={`collection-card card-tone-${index % 5}`}
                key={project.id}
                onClick={() => setSelectedId(project.id)}
              >
                <div className="collection-preview">
                  <CollectionPreview project={project} />
                </div>
                <div className="collection-card-body">
                  <div className="collection-title-row">
                    <span className="collection-favicon">
                      {project.favicon ? (
                        <img src={project.favicon} alt="" />
                      ) : (
                        project.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <div>
                      <h2>{project.name}</h2>
                      <p>{new URL(project.url).hostname}</p>
                      <p className="collection-publisher">
                        {copy.by} {project.publisher?.name ?? copy.unknownPublisher}
                      </p>
                    </div>
                  </div>
                  <div className="collection-card-meta">
                    <span>
                      {project.framework
                        ? getFrameworkConfig(project.framework).name
                        : copy.project}
                    </span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleLike(project.id);
                      }}
                      aria-label={copy.like}
                    >
                      <Heart size={17} fill={project.likedByViewer ? "currentColor" : "none"} />{" "}
                      {project.likeCount ?? 0}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="collection-empty">
            <Globe2 size={30} />
            <h2>{query ? copy.noMatch : copy.warming}</h2>
            <p>{query ? copy.retry : copy.empty}</p>
          </section>
        )}

        {selected && (
          <div
            className="collection-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && setSelectedId(null)}
          >
            <div
              className="collection-modal"
              role="dialog"
              aria-modal="true"
              aria-label={selected.name}
            >
              <button
                className="collection-close"
                onClick={() => setSelectedId(null)}
                aria-label={copy.close}
              >
                <X size={21} />
              </button>
              <div className="collection-live">
                <CollectionPreview project={selected} interactive />
              </div>
              <aside className="collection-comments">
                <div className="collection-project-head">
                  <span className="collection-favicon">
                    {selected.favicon ? <img src={selected.favicon} alt="" /> : selected.name[0]}
                  </span>
                  <div>
                    <strong>{selected.name}</strong>
                    <a href={selected.url} target="_blank">
                      {copy.open} <ArrowUpRight size={13} />
                    </a>
                  </div>
                </div>
                <div className="collection-about">
                  <p>{copy.deployed}</p>
                  <span>
                    {selected.framework
                      ? getFrameworkConfig(selected.framework).name
                      : copy.project}{" "}
                    · {new URL(selected.url).hostname}
                  </span>
                </div>
                <div className="collection-comment-title">
                  <MessageCircle size={16} /> {copy.comments} <span>{selected.commentCount ?? 0}</span>
                </div>
                {selected.comments?.length ? (
                  <div className="collection-comment-list">
                    {selected.comments.map((item) => (
                      <div className="collection-comment" key={item.id}>
                        <strong>{item.author.name}</strong>
                        <p>{item.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="collection-comment-empty">
                    <MessageCircle size={24} />
                    <p>{copy.start}</p>
                    <span>{copy.feedback}</span>
                  </div>
                )}
                <div className="collection-comment-box">
                  <input
                    value={comment}
                    maxLength={1000}
                    placeholder={authenticated ? copy.commentPlaceholder : copy.signIn}
                    readOnly={!authenticated}
                    onChange={(event) => setComment(event.target.value)}
                    onClick={() => !authenticated && requireLogin(selected.id, "comment")}
                    onKeyDown={(event) => event.key === "Enter" && void submitComment()}
                  />
                  <button
                    aria-label={authenticated ? copy.sendComment : copy.signIn}
                    disabled={submitting || (authenticated && !comment.trim())}
                    onClick={() => void submitComment()}
                  >
                    <Send size={17} />
                  </button>
                </div>
                {error && <p className="collection-comment-error">{error}</p>}
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
