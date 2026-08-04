"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleGauge,
  CircleCheck,
  CloudCog,
  Code2,
  Database,
  GitBranch,
  Globe2,
  KeyRound,
  Network,
  PackageCheck,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
  Zap,
} from "lucide-react";
import { Footer } from "./footer";
import { DashboardLink } from "./dashboard-link";
import { landingCopy, type LandingLocale } from "./landing-copy";
import { Navbar } from "./navbar";
import { useLandingPreferences } from "./use-landing-preferences";

const DOCS_URL = "https://docs.vibrail.warpgateapi.com/";

const featureIcons = [Zap, Network, RotateCcw, Bot] as const;
const featureVisuals = ["terminal", "nodes", "releases", "surfaces"] as const;
const capabilityIcons = [Globe2, Database, KeyRound, CircleGauge, GitBranch, ShieldCheck] as const;

export function VibrailLanding({
  initialLocale,
  supportEmail,
  dashboardLoginUrl,
}: {
  initialLocale?: LandingLocale;
  supportEmail: string | null;
  dashboardLoginUrl: string;
}) {
  const { locale, setLocale, theme, setTheme } = useLandingPreferences(initialLocale);
  const copy = landingCopy[locale];

  return (
    <div className={`vr-site vr-theme-${theme}`} data-locale={locale}>
      <Navbar
        copy={copy.nav}
        locale={locale}
        theme={theme}
        onLocaleChange={setLocale}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      />
      <main>
        <section className="vr-hero">
          <div className="vr-hero-grid" aria-hidden="true" />
          <div className="vr-orb vr-orb-one" aria-hidden="true" />
          <div className="vr-orb vr-orb-two" aria-hidden="true" />

          <div className="vr-hero-copy">
            <div className="vr-eyebrow"><Sparkles size={14} /> {copy.hero.eyebrow}</div>
            <h1>
              {copy.hero.title}
              <span>{copy.hero.accent}</span>
            </h1>
            <p>{copy.hero.description}</p>
            <div className="vr-hero-actions">
              <DashboardLink href={dashboardLoginUrl} theme={theme} className="vr-button vr-button-primary">
                {copy.hero.primary} <ArrowRight size={17} />
              </DashboardLink>
              <a href={DOCS_URL} className="vr-button vr-button-secondary">
                {copy.hero.secondary} <ChevronRight size={17} />
              </a>
            </div>
            <div className="vr-hero-meta">
              {copy.hero.meta.map((item) => <span key={item}><Check size={14} /> {item}</span>)}
            </div>
          </div>
        </section>

        <section className="vr-prompt-section" id="prompt-deploy">
          <div className="vr-section-heading">
            <div><span>{copy.prompt.eyebrow}</span><h2>{copy.prompt.title[0]}<br />{copy.prompt.title[1]}</h2></div>
            <p>{copy.prompt.description}</p>
          </div>

          <div className="vr-agent-workspace" aria-label={copy.prompt.ariaLabel}>
            <div className="vr-workspace-topbar">
              <div className="vr-window-dots"><i /><i /><i /></div>
              <span>{copy.prompt.agentTitle}</span>
              <small>{copy.prompt.mockPreview}</small>
            </div>

            <div className="vr-workspace-body">
              <aside className="vr-workspace-sidebar">
                <div className="vr-workspace-brand"><img src="/apple-touch-icon.png" alt="" /><span>Vibrail</span></div>
                <button className="is-active"><Sparkles size={15} /> {copy.prompt.newDeployment}</button>
                <button><CloudCog size={15} /> {copy.prompt.environments}</button>
                <button><CircleGauge size={15} /> {copy.prompt.activity}</button>
                <div className="vr-sidebar-label">{copy.prompt.recent}</div>
                {copy.prompt.recentTasks.map((task, index) => (
                  <div className={`vr-sidebar-task${index === 0 ? " is-selected" : ""}`} key={task}><i /> {task}</div>
                ))}
              </aside>

              <div className="vr-workspace-main">
                <div className="vr-user-prompt">
                  {copy.prompt.userPromptBefore}<b>demo-org/northstar</b>{copy.prompt.userPromptAfter}
                </div>

                <div className="vr-agent-answer">
                  <div className="vr-agent-identity">
                    <span><Bot size={17} /></span>
                    <div><b>{copy.prompt.agentName}</b><small>{copy.prompt.completed}</small></div>
                    <em><CircleCheck size={14} /> {copy.prompt.live}</em>
                  </div>
                  <p>{copy.prompt.answer}</p>

                  <div className="vr-deploy-progress">
                    {copy.prompt.progress.map((step) => (
                      <span className="is-done" key={step}><i><Check size={11} /></i>{step}</span>
                    ))}
                  </div>

                  <div className="vr-deploy-result">
                    <div className="vr-result-head">
                      <div><span className="vr-result-icon"><PackageCheck size={18} /></span><div><b>northstar-api</b><small>{copy.prompt.productionRelease}</small></div></div>
                      <span className="vr-result-status"><i /> {copy.prompt.healthy}</span>
                    </div>
                    <a href="#prompt-deploy" aria-label={copy.prompt.urlLabel}>https://northstar-api.demo.vibrail.app</a>
                    <div className="vr-result-grid">
                      <div><span>{copy.prompt.resultLabels[0]}</span><b>vps-sin-02</b><small>{copy.prompt.resultDetails[0]}</small></div>
                      <div><span>{copy.prompt.resultLabels[1]}</span><b>demo-org/northstar</b><small>{copy.prompt.resultDetails[1]}</small></div>
                      <div><span>{copy.prompt.resultLabels[2]}</span><b>API + PostgreSQL</b><small>{copy.prompt.resultDetails[2]}</small></div>
                      <div><span>{copy.prompt.resultLabels[3]}</span><b>200 OK</b><small>{copy.prompt.resultDetails[3]}</small></div>
                    </div>
                  </div>
                </div>

                <div className="vr-prompt-composer">
                  <span>{copy.prompt.composer}</span>
                  <button aria-label={copy.prompt.sendLabel}><ArrowRight size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="vr-cli-section" id="cli-deploy">
          <div className="vr-section-heading">
            <div><span>{copy.cli.eyebrow}</span><h2>{copy.cli.title[0]}<br />{copy.cli.title[1]}</h2></div>
            <p>{copy.cli.description}</p>
          </div>

          <div className="vr-console-wrap" aria-label={copy.cli.ariaLabel}>
            <div className="vr-console-glow" aria-hidden="true" />
            <div className="vr-console">
              <div className="vr-console-topbar">
                <div className="vr-window-dots"><i /><i /><i /></div>
                <div className="vr-console-tabs"><span className="is-active">{copy.cli.tabs[0]}</span><span>{copy.cli.tabs[1]}</span><span>{copy.cli.tabs[2]}</span></div>
                <span className="vr-status"><i /> {copy.cli.live}</span>
              </div>
              <div className="vr-console-body">
                <div className="vr-command"><span>$</span> vibrail deploy</div>
                <div className="vr-log"><span>01</span><b>{copy.cli.logs[0]}</b><em>Next.js · bun</em></div>
                <div className="vr-log"><span>02</span><b>{copy.cli.logs[1]}</b><em>sha-8d3a92f</em></div>
                <div className="vr-log"><span>03</span><b>{copy.cli.logs[2]}</b><em>ap-southeast-1</em></div>
                <div className="vr-log"><span>04</span><b>{copy.cli.logs[3]}</b><em>2 / 2 {copy.cli.healthy}</em></div>
                <div className="vr-log vr-log-success"><span><Check size={13} /></span><b>{copy.cli.logs[4]}</b><em>42.6s</em></div>
                <div className="vr-release-card">
                  <div><span>vibrail-web</span><strong>{copy.cli.environment}</strong></div>
                  <p>vibrail.warpgateapi.com</p>
                  <div className="vr-release-flow"><i /><i /><i /><i /><i /></div>
                </div>
              </div>
              <div className="vr-console-stats">
                <span><b>200</b> {copy.cli.stats[0]}</span><span><b>38ms</b> {copy.cli.stats[1]}</span><span><b>2/2</b> {copy.cli.stats[2]}</span><span><b>v37</b> {copy.cli.stats[3]}</span>
              </div>
            </div>
          </div>

          <div className="vr-surface-row">
            <span>{copy.cli.surfaces}</span>
            <div><TerminalSquare size={16} /> CLI</div>
            <div><CloudCog size={16} /> {copy.cli.dashboard}</div>
            <div><Bot size={16} /> MCP</div>
          </div>
        </section>

        <section className="vr-metrics" aria-label={copy.metricsLabel}>
          {copy.metrics.map(([value, label]) => <div key={value}><strong>{value}</strong><span>{label}</span></div>)}
        </section>

        <section className="vr-section" id="platform">
          <div className="vr-section-heading">
            <div><span>{copy.platform.eyebrow}</span><h2>{copy.platform.title[0]}<br />{copy.platform.title[1]}</h2></div>
            <p>{copy.platform.description}</p>
          </div>

          <div className="vr-feature-grid">
            {copy.platform.features.map(([title, description], index) => {
              const Icon = featureIcons[index];
              const visual = featureVisuals[index];
              return (
                <article className="vr-feature-card" key={title}>
                  <div className="vr-card-number">0{index + 1}</div>
                  <div className="vr-card-icon"><Icon size={19} /></div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <div className={`vr-card-visual vr-card-visual-${visual}`} aria-hidden="true">
                    {visual === "terminal" && <><code>$ vibrail deploy</code><span>✓ {copy.platform.productionLive}</span></>}
                    {visual === "nodes" && <><i /><i /><i /><b>V</b></>}
                    {visual === "releases" && <><span>v35</span><span>v36</span><span className="active">v37</span></>}
                    {visual === "surfaces" && <><TerminalSquare /><CloudCog /><Bot /></>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="vr-architecture" id="workflow">
          <div className="vr-section-heading vr-section-heading-light">
            <div><span>{copy.workflow.eyebrow}</span><h2>{copy.workflow.title[0]}<br />{copy.workflow.title[1]}</h2></div>
            <p>{copy.workflow.description}</p>
          </div>

          <div className="vr-flow">
            <article><span>01</span><Code2 /><h3>{copy.workflow.steps[0][0]}</h3><p>{copy.workflow.steps[0][1]}</p></article>
            <div className="vr-flow-line"><i /></div>
            <article><span>02</span><Boxes /><h3>{copy.workflow.steps[1][0]}</h3><p>{copy.workflow.steps[1][1]}</p></article>
            <div className="vr-flow-line"><i /></div>
            <article><span>03</span><Workflow /><h3>{copy.workflow.steps[2][0]}</h3><p>{copy.workflow.steps[2][1]}</p></article>
          </div>

          <div className="vr-infra-panel">
            <div className="vr-infra-copy">
              <span>{copy.workflow.infraEyebrow}</span>
              <h3>{copy.workflow.infraTitle[0]}<br />{copy.workflow.infraTitle[1]}</h3>
              <p>{copy.workflow.infraDescription}</p>
              <a href={DOCS_URL}>{copy.workflow.explore} <ArrowRight size={16} /></a>
            </div>
            <div className="vr-infra-map" aria-hidden="true">
              <div className="vr-map-core"><img src="/apple-touch-icon.png" alt="" className="vr-brand-logo" /><b>Vibrail</b><small>{copy.workflow.controlPlane}</small></div>
              <div className="vr-map-node vr-map-node-agent"><Bot /><span>{copy.workflow.codingAgent}</span></div>
              <div className="vr-map-node vr-map-node-a"><CloudCog /><span>{copy.workflow.cloud}</span></div>
              <div className="vr-map-node vr-map-node-b"><ServerCog /><span>{copy.workflow.yourVps}</span></div>
              <svg viewBox="0 0 500 300" preserveAspectRatio="none"><path d="M250 150 C190 80 135 75 78 72"/><path d="M250 150 C325 80 390 82 435 74"/><path className="vr-agent-path" d="M250 252 C250 216 250 188 250 150"/></svg>
            </div>
          </div>
        </section>

        <section className="vr-section vr-capability-section" id="operations">
          <div className="vr-section-heading">
            <div><span>{copy.operations.eyebrow}</span><h2>{copy.operations.title[0]}<br />{copy.operations.title[1]}</h2></div>
            <p>{copy.operations.description}</p>
          </div>
          <div className="vr-capability-grid">
            {copy.operations.capabilities.map(([title, description], index) => {
              const Icon = capabilityIcons[index];
              return <article key={title}><Icon size={19} /><div><h3>{title}</h3><p>{description}</p></div><ChevronRight size={16} /></article>;
            })}
          </div>
        </section>

        <section className="vr-final-cta">
          <div>
            <span>{copy.cta.eyebrow}</span>
            <h2>{copy.cta.title}</h2>
          </div>
          <div>
            <DashboardLink href={dashboardLoginUrl} theme={theme} className="vr-button vr-button-primary">{copy.cta.dashboard} <ArrowRight size={17} /></DashboardLink>
            <a href={DOCS_URL} className="vr-button vr-button-secondary">{copy.cta.secondary}</a>
          </div>
        </section>
      </main>
      <Footer copy={copy.footer} supportEmail={supportEmail} dashboardLoginUrl={dashboardLoginUrl} theme={theme} />
    </div>
  );
}
