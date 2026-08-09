"use client";

import { useEffect, useMemo, useState } from "react";
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

type Project = {
  id: string;
  name: string;
  slug: string;
  url: string;
  favicon?: string | null;
  framework?: string | null;
  updatedAt?: string;
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
    open: "Open live site",
    project: "Web project",
    close: "Close",
    like: "Like project",
    list: "Public Vibrail projects",
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
    open: "打开线上项目",
    project: "Web 项目",
    close: "关闭",
    like: "喜欢这个项目",
    list: "公开的 Vibrail 项目",
  },
} as const;

export function CollectionPage({
  initialProjects,
  initialLocale,
  dashboardLoginUrl,
}: {
  initialProjects: Project[];
  initialLocale?: LandingLocale;
  dashboardLoginUrl: string;
}) {
  const { locale, setLocale, theme, setTheme } = useLandingPreferences(initialLocale);
  const copy = text[locale];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const projects = useMemo(
    () =>
      initialProjects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())),
    [initialProjects, query],
  );

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
                onClick={() => setSelected(project)}
              >
                <div className="collection-preview">
                  <iframe
                    src={project.url}
                    title={`${project.name} preview`}
                    loading="lazy"
                    tabIndex={-1}
                    sandbox="allow-scripts allow-same-origin"
                  />
                  <div className="collection-preview-shield" />
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
                        setLiked((old) => {
                          const next = new Set(old);
                          next.has(project.id) ? next.delete(project.id) : next.add(project.id);
                          return next;
                        });
                      }}
                      aria-label={copy.like}
                    >
                      <Heart size={17} fill={liked.has(project.id) ? "currentColor" : "none"} />{" "}
                      {liked.has(project.id) ? 1 : 0}
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
            onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}
          >
            <div
              className="collection-modal"
              role="dialog"
              aria-modal="true"
              aria-label={selected.name}
            >
              <button
                className="collection-close"
                onClick={() => setSelected(null)}
                aria-label={copy.close}
              >
                <X size={21} />
              </button>
              <div className="collection-live">
                <iframe
                  src={selected.url}
                  title={selected.name}
                  sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
                />
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
                  <MessageCircle size={16} /> {copy.comments} <span>0</span>
                </div>
                <div className="collection-comment-empty">
                  <MessageCircle size={24} />
                  <p>{copy.start}</p>
                  <span>{copy.feedback}</span>
                </div>
                <div className="collection-comment-box">
                  <input
                    placeholder={copy.signIn}
                    readOnly
                    onClick={() => (window.location.href = dashboardLoginUrl)}
                  />
                  <button
                    aria-label={copy.signIn}
                    onClick={() => (window.location.href = dashboardLoginUrl)}
                  >
                    <Send size={17} />
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
