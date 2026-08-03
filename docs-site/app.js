const DASHBOARD_URL = 'https://vibrail.warpgateapi.com'
const API_URL = `${DASHBOARD_URL}/api/proxy/api`
const MCP_URL = `${API_URL}/mcp`

const sectionsByLocale = {
  zh: [
    {
      title: '开始使用',
      links: [
        ['文档总览', '/docs'],
        ['快速开始', '/docs/quickstart'],
        ['核心概念', '/docs/concepts'],
      ],
    },
    {
      title: '部署应用',
      links: [
        ['从 GitHub 部署', '/docs/deploy/github'],
        ['部署本地文件夹', '/docs/deploy/folder'],
        ['连接自己的服务器', '/docs/deploy/server'],
      ],
    },
    {
      title: '项目与运维',
      links: [
        ['项目配置', '/docs/projects'],
        ['域名与 HTTPS', '/docs/domains'],
        ['日志与故障排查', '/docs/logs'],
      ],
    },
    {
      title: '开发者',
      links: [
        ['REST API', '/docs/api'],
        ['MCP', '/docs/mcp'],
        ['CLI', '/docs/cli'],
        ['常见问题', '/docs/faq'],
      ],
    },
  ],
  en: [
    {
      title: 'Get started',
      links: [
        ['Documentation', '/docs'],
        ['Quickstart', '/docs/quickstart'],
        ['Core concepts', '/docs/concepts'],
      ],
    },
    {
      title: 'Deploy',
      links: [
        ['Deploy from GitHub', '/docs/deploy/github'],
        ['Deploy a local folder', '/docs/deploy/folder'],
        ['Connect your server', '/docs/deploy/server'],
      ],
    },
    {
      title: 'Projects & operations',
      links: [
        ['Project configuration', '/docs/projects'],
        ['Domains & HTTPS', '/docs/domains'],
        ['Logs & troubleshooting', '/docs/logs'],
      ],
    },
    {
      title: 'Developers',
      links: [
        ['REST API', '/docs/api'],
        ['MCP', '/docs/mcp'],
        ['CLI', '/docs/cli'],
        ['FAQ', '/docs/faq'],
      ],
    },
  ],
}

const ui = {
  zh: {
    nav: ['文档', '部署', 'CLI', 'API', 'MCP', '常见问题'],
    search: '搜索或提问…',
    searchLabel: '搜索文档',
    searchPlaceholder: '搜索文档…',
    theme: '切换主题',
    console: '控制台',
    menu: '打开菜单',
    toc: '本页目录',
    select: '↑↓ 选择',
    open: '↵ 打开',
    noResults: '没有找到相关文档',
    copy: '复制',
    copied: '已复制',
    support: '没有找到答案？请前往',
    supportLink: 'Vibrail 控制台',
    supportEnd: '查看运行状态或联系支持。',
    switchLanguage: 'Switch to English',
    language: 'EN',
  },
  en: {
    nav: ['Docs', 'Deploy', 'CLI', 'API', 'MCP', 'FAQ'],
    search: 'Search or ask…',
    searchLabel: 'Search documentation',
    searchPlaceholder: 'Search documentation…',
    theme: 'Toggle theme',
    console: 'Console',
    menu: 'Open menu',
    toc: 'On this page',
    select: '↑↓ Select',
    open: '↵ Open',
    noResults: 'No matching documentation found',
    copy: 'Copy',
    copied: 'Copied',
    support: 'Still need help? Open the',
    supportLink: 'Vibrail Console',
    supportEnd: 'to inspect your deployment or contact support.',
    switchLanguage: '切换到中文',
    language: '中文',
  },
}

let currentLocale = ['zh', 'en'].includes(localStorage.vibrailDocsLanguage) ? localStorage.vibrailDocsLanguage : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const routeHref = (path) => (path.startsWith('http') ? path : `#${path}`)
const cards = (items) => `<div class="doc-grid">${items.map(([title, desc, path]) => `<a class="doc-card" href="${routeHref(path)}"${path.startsWith('http') ? ' target="_blank" rel="noreferrer"' : ''}><strong>${title}<span>→</span></strong><span>${desc}</span></a>`).join('')}</div>`
const table = (headers, rows, className = '') => `<div class="table-wrap ${className}"><table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${item}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const numberedRows = (rows) => rows.map((row, index) => [index + 1, ...row])

function highlightCode(value) {
  const pattern = /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|import|from|return|true|false|null|curl|export|codex)\b)/g
  let output = ''
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    output += escapeHtml(value.slice(cursor, match.index))
    const token = match[0]
    let className = 'token-keyword'
    if (token.startsWith('//') || token.startsWith('#')) className = 'token-comment'
    else if (/^["'`]/.test(token)) className = 'token-string'
    else if (/^\d/.test(token)) className = 'token-number'
    output += `<span class="${className}">${escapeHtml(token)}</span>`
    cursor = match.index + token.length
  }
  return output + escapeHtml(value.slice(cursor))
}

const code = (title, value) => `<div class="code-block"><div class="code-title"><span class="code-language-dot"></span>${title}</div><button class="copy-code" data-copy="${encodeURIComponent(value)}">${ui[currentLocale].copy}</button><pre><code>${highlightCode(value)}</code></pre></div>`

const apiGroupsZh = [
  ['<code>/api/health</code>', '存活检查与部署环境信息', '全部模式；公开'],
  ['<code>/api/auth</code>', '登录、会话、OAuth 与组织身份', '全部模式'],
  ['<code>/api/projects</code>', '项目、环境变量、源码、资源和日志', '全部模式'],
  ['<code>/api/projects/:id/services</code>', '项目服务、容器、日志与启停', '全部模式'],
  ['<code>/api/projects/:id/app-settings</code>', '应用级设置', '全部模式'],
  ['<code>/api/projects/:id/app-connection</code>', '应用外部连接', '全部模式'],
  ['<code>/api/projects/:id/connections</code>', '项目数据库与服务连接', '全部模式'],
  ['<code>/api/apps</code>', '应用目录、安装和自定义应用', '全部模式'],
  ['<code>/api/deployments</code>', '构建、发布、日志、取消和回滚', '全部模式'],
  ['<code>/api/domains</code>', '域名、DNS、主域名与证书', '全部模式'],
  ['<code>/api/domain-settings</code>', '域名提供商与 DNS 设置', '全部模式'],
  ['<code>/api/github</code>', 'GitHub 连接、仓库、分支与 Webhook', '全部模式'],
  ['<code>/api/webhooks</code>', 'GitHub、计费和备份 Webhook 入口', '全部模式；部分公开'],
  ['<code>/api/analytics</code>', '流量、地域、部署和资源使用统计', '全部模式'],
  ['<code>/api/settings</code>', '工作区、构建和部署默认设置', '全部模式'],
  ['<code>/api/tokens</code>', '个人访问令牌与 MCP 客户端授权', '全部模式'],
  ['<code>/api/permissions</code>', '团队、角色、邀请和资源授权', '全部模式'],
  ['<code>/api/notifications</code>', '通知渠道、订阅、默认值和投递记录', '全部模式'],
  ['<code>/api/audit</code>', '组织审计日志', '全部模式'],
  ['<code>/api/billing</code>', '套餐、订阅、用量、充值和结算', '全部模式；实现随模式变化'],
  ['<code>/api/images</code>', '构建与服务镜像目录', '全部模式'],
  ['<code>/api/mcp</code>', 'MCP Streamable HTTP JSON-RPC 端点', '全部模式'],
  ['<code>/api/projects/:projectId/backup-policies</code>', '项目备份策略', '全部模式'],
  ['<code>/api/backup-policies</code>', '备份策略更新、删除和立即运行', '全部模式'],
  ['<code>/api/backup-runs</code>', '备份任务、进度流和保留保护', '全部模式'],
  ['<code>/api/backup-restores</code>', '备份恢复、取消和进度流', '全部模式'],
  ['<code>/api/backup-destinations</code>', '备份目标、凭据和连通性检查', '全部模式'],
  ['<code>/api/updates</code>', '应用、项目和实例更新状态', '全部模式'],
  ['<code>/api/jobs</code>', '定时任务、触发器、运行记录和输出流', '全部模式'],
  ['<code>/api/operations</code>', '长时间资源操作及其状态', '全部模式'],
  ['<code>/api/notices</code>', '平台状态公告', '全部模式；读取公开'],
  ['<code>/api/services/terminal</code>', '运行中服务的终端票据与 WebSocket', '全部模式'],
  ['<code>/api/cloud</code>', '云账户、工作区、边缘路由和数据交换', '全部模式；实现随模式变化'],
  ['<code>/api/system</code>', '服务器、安装、隧道、文件和实例管理', '自托管；托管模式仅服务器子集'],
  ['<code>/api/migration</code>', 'Docker 扫描、迁移和接管', '自托管；用户服务器模式提供扫描子集'],
  ['<code>/api/terminal</code>', '受管服务器 SSH 终端', '自托管或启用用户服务器'],
  ['<code>/api/mail</code>', '邮件服务器安装、域名、邮箱和 Webmail', '启用用户服务器时'],
  ['<code>/api/admin</code>', '平台管理操作', '内部管理员'],
  ['<code>/api/telemetry</code>', '平台遥测接收', '内部接口'],
]

const apiGroupsEn = [
  ['<code>/api/health</code>', 'Liveness and deployment environment information', 'All modes; public'],
  ['<code>/api/auth</code>', 'Login, sessions, OAuth, and organization identity', 'All modes'],
  ['<code>/api/projects</code>', 'Projects, environment, source, resources, and logs', 'All modes'],
  ['<code>/api/projects/:id/services</code>', 'Project services, containers, logs, and lifecycle', 'All modes'],
  ['<code>/api/projects/:id/app-settings</code>', 'Application-level settings', 'All modes'],
  ['<code>/api/projects/:id/app-connection</code>', 'External application connections', 'All modes'],
  ['<code>/api/projects/:id/connections</code>', 'Project database and service connections', 'All modes'],
  ['<code>/api/apps</code>', 'Application catalog, installs, and custom apps', 'All modes'],
  ['<code>/api/deployments</code>', 'Builds, releases, logs, cancellation, and rollback', 'All modes'],
  ['<code>/api/domains</code>', 'Domains, DNS, primary domains, and certificates', 'All modes'],
  ['<code>/api/domain-settings</code>', 'Domain provider and DNS settings', 'All modes'],
  ['<code>/api/github</code>', 'GitHub connections, repositories, branches, and webhooks', 'All modes'],
  ['<code>/api/webhooks</code>', 'GitHub, billing, and backup webhook ingress', 'All modes; partly public'],
  ['<code>/api/analytics</code>', 'Traffic, geo, deployment, and resource analytics', 'All modes'],
  ['<code>/api/settings</code>', 'Workspace, build, and deployment defaults', 'All modes'],
  ['<code>/api/tokens</code>', 'Personal access tokens and MCP client grants', 'All modes'],
  ['<code>/api/permissions</code>', 'Teams, roles, invitations, and resource grants', 'All modes'],
  ['<code>/api/notifications</code>', 'Channels, subscriptions, defaults, and deliveries', 'All modes'],
  ['<code>/api/audit</code>', 'Organization audit log', 'All modes'],
  ['<code>/api/billing</code>', 'Plans, subscriptions, usage, top-ups, and checkout', 'All modes; mode-specific'],
  ['<code>/api/images</code>', 'Build and service image catalog', 'All modes'],
  ['<code>/api/mcp</code>', 'MCP Streamable HTTP JSON-RPC endpoint', 'All modes'],
  ['<code>/api/projects/:projectId/backup-policies</code>', 'Project backup policies', 'All modes'],
  ['<code>/api/backup-policies</code>', 'Update, delete, and run backup policies', 'All modes'],
  ['<code>/api/backup-runs</code>', 'Backup runs, progress streams, and protection', 'All modes'],
  ['<code>/api/backup-restores</code>', 'Restore preparation, execution, cancellation, and streams', 'All modes'],
  ['<code>/api/backup-destinations</code>', 'Backup targets, credentials, and preflight checks', 'All modes'],
  ['<code>/api/updates</code>', 'Application, project, and instance update status', 'All modes'],
  ['<code>/api/jobs</code>', 'Scheduled jobs, triggers, runs, and output streams', 'All modes'],
  ['<code>/api/operations</code>', 'Long-running resource operations and status', 'All modes'],
  ['<code>/api/notices</code>', 'Platform status notices', 'All modes; public reads'],
  ['<code>/api/services/terminal</code>', 'Service terminal tickets and WebSocket access', 'All modes'],
  ['<code>/api/cloud</code>', 'Cloud accounts, workspaces, edge routing, and data exchange', 'All modes; mode-specific'],
  ['<code>/api/system</code>', 'Servers, installs, tunnels, files, and instance management', 'Self-hosted; server subset in hosted mode'],
  ['<code>/api/migration</code>', 'Docker scanning, migration, and adoption', 'Self-hosted; scan subset with user servers'],
  ['<code>/api/terminal</code>', 'Managed-server SSH terminal', 'Self-hosted or user-server mode'],
  ['<code>/api/mail</code>', 'Mail server setup, domains, mailboxes, and webmail', 'When user servers are enabled'],
  ['<code>/api/admin</code>', 'Platform administration operations', 'Internal administrators'],
  ['<code>/api/telemetry</code>', 'Platform telemetry ingestion', 'Internal'],
]

const mcpToolsData = `
analytics|get_analytics|GET /api/analytics|read|Analytics%20summary%20for%20the%20org%20(or%20%3FprojectId%3D)%3A%20requests%2C%20traffic%20overview.
analytics|get_analytics_container|GET /api/analytics/container|read|Container-level%20metrics%20for%20a%20project's%20runtime.
analytics|get_analytics_dashboard|GET /api/analytics/dashboard|read|Dashboard%20analytics%20rollup%20(headline%20metrics).
analytics|get_analytics_deployments|GET /api/analytics/deployments|read|Deployment%20statistics%20(frequency%2C%20success%20rate%2C%20durations).
analytics|get_analytics_overview|GET /api/analytics/overview|read|Analytics%20overview%20(traffic%2C%20status%20codes%2C%20top%20paths).
analytics|get_analytics_periods|GET /api/analytics/periods|read|Available%20analytics%20time%20periods.
analytics|get_analytics_usage|GET /api/analytics/usage|read|Resource%20usage%20(CPU%2Fmemory%2Fbandwidth)%20for%20the%20org%20or%20a%20project.
apps|post_apps|POST /api/apps|write|Install%20an%20app%20from%20the%20catalog%20as%20a%20project%20(or%20return%20a%20flow%20route%20for%20wizard%20apps).
apps|get_apps_catalog|GET /api/apps/catalog|read|List%20the%20one-click%20app%20catalog%20(Convex%2C%20WordPress%2C%20mail%2C%20%E2%80%A6).
apps|get_apps_catalog_by_id|GET /api/apps/catalog/:id|read|Get%20one%20app's%20full%20template%20(services%2C%20config%2C%20endpoints)%20by%20id.
apps|get_apps_custom|GET /api/apps/custom|read|List%20this%20org's%20custom%20(user-uploaded%2C%20unverified)%20apps.
apps|post_apps_custom|POST /api/apps/custom|write|Add%20a%20custom%20app%20from%20an%20uploaded%20JSON%20definition%20(stored%20per-org%2C%20unverified).
apps|delete_apps_custom_by_appId|DELETE /api/apps/custom/:appId|destructive|Remove%20a%20custom%20app%20from%20this%20org's%20catalog.
apps|get_projects_by_id_app_connection|GET /api/projects/:id/app-connection|read|Get%20an%20installed%20app's%20resolved%20connection%20details%20(URLs%20%2B%20generated%20keys).
apps|get_projects_by_id_app_settings|GET /api/projects/:id/app-settings|read|Get%20an%20installed%20app's%20curated%20settings%20schema%20%2B%20current%20values.
apps|patch_projects_by_id_app_settings|PATCH /api/projects/:id/app-settings|write|Update%20an%20installed%20app's%20curated%20settings%20(safe%20env%20merge).
backups|get_backup_restores_by_restoreId|GET /api/backup-restores/:restoreId|read|Get%20one%20backup%20restore's%20status.
backups|get_backup_runs_by_runId|GET /api/backup-runs/:runId|read|Get%20one%20backup%20run's%20details%2Fstatus.
backups|get_projects_by_projectId_backup_policies|GET /api/projects/:projectId/backup-policies|read|List%20a%20project's%20backup%20policies%20(schedules%2Fretention).
backups|get_projects_by_projectId_backup_runs|GET /api/projects/:projectId/backup-runs|read|List%20a%20project's%20backup%20runs%20(history%2C%20status).
cloud-local|get_cloud_status|GET /api/cloud/status|read|Vibrail%20Cloud%20connection%20status%20for%20this%20instance.
cloud-local|get_cloud_workspaces|GET /api/cloud/workspaces|read|List%20the%20org's%20Vibrail%20Cloud%20(Oblien)%20workspaces.
deployments|get_deployments|GET /api/deployments|read|List%20deployments%20in%20the%20org%20(optionally%20filter%20with%20query.projectId).
deployments|post_deployments|POST /api/deployments|write|Git-based%20deploy%20%E2%80%94%20redeploy%20an%20already-linked%20project%20from%20its%20git%20source.%20To%20deploy%20a%20LOCAL%20FOLDER%20instead%2C%20use%20the%20folder-upload%20flow%3A%20projects%20folder%2Fsession%20%E2%86%92%20(upload)%20%E2%86%92%20folder%2Fscan%20%E2%86%92%20projects%2Fensure%20%E2%86%92%20deployments%2Fbuild%2Faccess.
deployments|get_deployments_by_id|GET /api/deployments/:id|read|Get%20a%20deployment%20by%20id%20%E2%80%94%20status%2C%20urls%2C%20timing%2C%20error%20summary.
deployments|post_deployments_by_id_build_respond|POST /api/deployments/:id/build/respond|write|Respond%20to%20a%20build%20gate%2Fprompt%20for%20this%20deployment%20(e.g.%20approve%20a%20step).
deployments|post_deployments_by_id_cancel|POST /api/deployments/:id/cancel|write|Cancel%20an%20in-progress%20deployment.
deployments|get_deployments_by_id_info|GET /api/deployments/:id/info|read|Get%20container%20info%20for%20this%20deployment.
deployments|post_deployments_by_id_keep|POST /api/deployments/:id/keep|write|Keep%20a%20partial-failure%20deployment%20awaiting%20a%20decision%20(accept%20the%20succeeded%20services).
deployments|get_deployments_by_id_logs|GET /api/deployments/:id/logs|read|Fetch%20a%20deployment's%20build%2Fruntime%20logs.
deployments|post_deployments_by_id_redeploy|POST /api/deployments/:id/redeploy|write|Re-run%20the%20latest%20deployment%20for%20this%20project.
deployments|post_deployments_by_id_reject|POST /api/deployments/:id/reject|write|Reject%20a%20partial-failure%20deployment%20awaiting%20a%20decision%20(roll%20back%20the%20changed%20services).
deployments|post_deployments_by_id_restart|POST /api/deployments/:id/restart|write|Restart%20the%20running%20container(s)%20for%20this%20deployment.
deployments|post_deployments_by_id_rollback|POST /api/deployments/:id/rollback|write|Roll%20back%20to%20this%20deployment's%20artifact%2Fcommit.
deployments|get_deployments_by_id_usage|GET /api/deployments/:id/usage|read|Get%20container%20CPU%2Fmemory%20usage%20for%20this%20deployment.
deployments|post_deployments_build_access|POST /api/deployments/build/access|write|Deploy%20%E2%80%94%20the%20wizard%20'Deploy'%20action.%20Starts%20the%20build%20%2B%20deployment.%20For%20a%20folder-upload%20deploy%20pass%20projectId%20(from%20projects%2Fensure)%20and%20uploadSessionId%20(from%20folder%2Fsession).%20Wizard%20settings%20(envVars%2C%20publicEndpoints%2C%20buildStrategy%2C%20runtimeMode%2C%20cloudResourceTier)%20are%20optional.%20Returns%20%7B%20success%2C%20deployment_id%2C%20project_id%20%7D.%20Do%20NOT%20set%20deployTarget%3A'cloud'%20on%20a%20self-hosted%20instance%20%E2%80%94%20it%20triggers%20promote-to-cloud%3B%20leave%20it%20unset%20and%20the%20upload%20session%20mode%20decides.
deployments|post_deployments_prepare|POST /api/deployments/prepare|write|Detect%20stack%2Fbuild%20config%20for%20a%20git%20repo%20or%20local%20path%20before%20deploying.
domains|get_domains|GET /api/domains|read|List%20domains%20for%20the%20org%20%2F%20project.
domains|post_domains|POST /api/domains|write|Add%20a%20domain%20(free%20subdomain%20or%20custom).
domains|post_domains_by_id_primary|POST /api/domains/:id/primary|write|Set%20this%20domain%20as%20the%20project's%20primary%20domain.
domains|get_domains_by_id_records|GET /api/domains/:id/records|read|Get%20the%20DNS%20records%20for%20a%20domain.
domains|post_domains_by_id_verify|POST /api/domains/:id/verify|write|Verify%20a%20domain's%20ownership%20%2F%20DNS.
domains|post_domains_preview|POST /api/domains/preview|read|Preview%20the%20DNS%20records%20a%20domain%20will%20need%2C%20before%20adding%20it.
github|get_github_home|GET /api/github/home|read|GitHub%20home%3A%20connection%20state%2C%20accounts%2C%20and%20repos%20in%20one%20call.
github|get_github_orgs_by_org_repos|GET /api/github/orgs/:org/repos|read|List%20repositories%20in%20a%20GitHub%20org%2Faccount.
github|get_github_repos|GET /api/github/repos|read|List%20the%20connected%20account's%20GitHub%20repositories.
github|get_github_repos_by_owner_by_repo|GET /api/github/repos/:owner/:repo|read|Get%20a%20GitHub%20repository's%20metadata.
github|get_github_repos_by_owner_by_repo_branches|GET /api/github/repos/:owner/:repo/branches|read|List%20a%20repository's%20branches.
github|get_github_repos_by_owner_by_repo_file|GET /api/github/repos/:owner/:repo/file|read|Read%20a%20single%20file's%20contents%20from%20a%20repo%20(to%20detect%20stack%20%2F%20read%20config).
github|get_github_repos_by_owner_by_repo_files|GET /api/github/repos/:owner/:repo/files|read|List%20files%2Fdirs%20at%20a%20path%20in%20a%20repo%20(query%3A%20path%2C%20ref).
github|get_github_repos_by_owner_by_repo_webhooks|GET /api/github/repos/:owner/:repo/webhooks|read|List%20a%20repo's%20webhooks%20(to%20check%20push%20auto-deploy%20wiring).
github|get_github_status|GET /api/github/status|read|GitHub%20connection%20status%20for%20the%20org.
jobs|get_jobs|GET /api/jobs|read|List%20system%20%2B%20custom%20jobs%20with%20cron%2C%20next%20run%2C%20and%20recent%20run%20history.
jobs|post_jobs|POST /api/jobs|write|Create%20a%20custom%20job%20that%20runs%20a%20command%20on%20one%20or%20more%20servers%20(cron%20%2F%20one-time%20%2F%20manual)%2C%20with%20retry%2C%20env%2C%20secrets%2C%20dependencies%2C%20triggers%2C%20and%20notifications.
jobs|delete_jobs_by_key|DELETE /api/jobs/:key|destructive|Delete%20a%20custom%20job%20(system%20jobs%20can't%20be%20deleted).
jobs|get_jobs_by_key|GET /api/jobs/:key|read|Get%20one%20job's%20config%2C%20schedule%2C%20and%20recent%20runs.
jobs|patch_jobs_by_key|PATCH /api/jobs/:key|write|Update%20a%20job's%20schedule%2Fenabled%20(any%20job)%20or%20full%20config%20(custom%20jobs).
jobs|post_jobs_by_key_run|POST /api/jobs/:key/run|write|Run%20a%20job%20immediately%20(custom%20jobs%20stream%20live%3B%20returns%20a%20runId).
jobs|get_jobs_by_key_runs|GET /api/jobs/:key/runs|read|List%20a%20job's%20run%20history.
jobs|get_jobs_backup_schedules|GET /api/jobs/backup-schedules|read|List%20scheduled%20backup%20policies%20(read-only)%2C%20surfaced%20alongside%20jobs.
jobs|get_jobs_runs_by_runId|GET /api/jobs/runs/:runId|read|Get%20one%20job%20run%20incl.%20captured%20output.
jobs|get_jobs_runs_by_runId_stream|GET /api/jobs/runs/:runId/stream|read|Stream%20a%20job%20run's%20live%20output%20(SSE).
jobs|get_jobs_trigger_events|GET /api/jobs/trigger-events|read|List%20the%20events%20a%20job%20can%20be%20triggered%20on.
notifications|get_notifications_categories|GET /api/notifications/categories|read|List%20notification%20categories%20(the%20registry%20of%20event%20types).
notifications|get_notifications_channels|GET /api/notifications/channels|read|List%20the%20caller's%20notification%20channels%20(email%2C%20webhook%2C%20etc.).
notifications|post_notifications_channels|POST /api/notifications/channels|write|Create%20a%20notification%20channel.
notifications|delete_notifications_channels_by_id|DELETE /api/notifications/channels/:id|destructive|Delete%20a%20notification%20channel.
notifications|patch_notifications_channels_by_id|PATCH /api/notifications/channels/:id|write|Update%20a%20notification%20channel.
notifications|post_notifications_channels_by_id_test|POST /api/notifications/channels/:id/test|write|Send%20a%20test%20delivery%20to%20a%20channel%3B%20marks%20it%20verified%20on%20success.
notifications|get_notifications_defaults|GET /api/notifications/defaults|read|List%20org%20default%20notification%20settings.
notifications|get_notifications_deliveries|GET /api/notifications/deliveries|read|List%20notification%20deliveries%20(the%20in-app%20alert%20feed).
notifications|post_notifications_deliveries_by_id_seen|POST /api/notifications/deliveries/:id/seen|write|Mark%20a%20notification%20delivery%20as%20seen.
notifications|get_notifications_deliveries_unseen_count|GET /api/notifications/deliveries/unseen-count|read|Count%20unseen%20notifications.
notifications|get_notifications_subscriptions|GET /api/notifications/subscriptions|read|List%20the%20caller's%20notification%20subscriptions.
notifications|put_notifications_subscriptions|PUT /api/notifications/subscriptions|write|Create%20or%20update%20a%20notification%20subscription.
notifications|delete_notifications_subscriptions_by_id|DELETE /api/notifications/subscriptions/:id|destructive|Delete%20a%20notification%20subscription.
operations|get_operations_by_id|GET /api/operations/:id|read|Get%20the%20durable%20status%20and%20progress%20of%20a%20background%20operation.
operations|get_operations_active|GET /api/operations/active|read|Find%20the%20active%20background%20operation%20for%20a%20resource.
projects|get_projects|GET /api/projects|read|List%20projects%20in%20the%20org.
projects|post_projects|POST /api/projects|write|Create%20a%20project%20from%20a%20git%20or%20local%20source%20(build%20config%20baked%20into%20the%20project).%20For%20a%20folder-upload%20deploy%20use%20projects%2Fensure%20instead%20(it%20accepts%20the%20folder%2Fscan%20config%20and%20gitProvider%3A'upload').
projects|get_projects_by_id|GET /api/projects/:id|read|Get%20a%20project%20by%20id%20%E2%80%94%20config%2C%20source%2C%20routes%2C%20status.
projects|patch_projects_by_id|PATCH /api/projects/:id|write|Update%20a%20project's%20configuration%20(build%20config%2C%20source%2C%20options).
projects|post_projects_by_id_auto_deploy|POST /api/projects/:id/auto-deploy|write|Enable%2Fdisable%20auto-deploy%20on%20push.
projects|post_projects_by_id_branch|POST /api/projects/:id/branch|write|Set%20the%20project's%20deploy%20branch.
projects|get_projects_by_id_branches|GET /api/projects/:id/branches|read|List%20the%20linked%20repository's%20branches.
projects|get_projects_by_id_commit_status|GET /api/projects/:id/commit-status|read|Compare%20the%20deployed%20commit%20against%20the%20remote%20HEAD.
projects|get_projects_by_id_connections|GET /api/projects/:id/connections|read|List%20the%20database%2Fapp%20connections%20wired%20into%20this%20project.
projects|post_projects_by_id_connections|POST /api/projects/:id/connections|write|Connect%20a%20database%20app%20into%20this%20project%20(inject%20its%20connection%20URL%20as%20a%20secret%20env).
projects|delete_projects_by_id_connections_by_linkId|DELETE /api/projects/:id/connections/:linkId|destructive|Remove%20a%20database%2Fapp%20connection%20and%20its%20injected%20env%20var.
projects|post_projects_by_id_connections_bundle|POST /api/projects/:id/connections/bundle|write|Wire%20several%20outputs%20from%20one%20source%20app%20into%20this%20project%20atomically%20(all-or-nothing).
projects|get_projects_by_id_deletion_preview|GET /api/projects/:id/deletion-preview|read|Preview%20what%20deleting%20this%20project%20would%20remove%20(read-only).
projects|get_projects_by_id_deployments|GET /api/projects/:id/deployments|read|List%20a%20project's%20deployments%20(history%2C%20statuses).
projects|post_projects_by_id_disable|POST /api/projects/:id/disable|write|Disable%20a%20project%20(pause%20deploys%20%2F%20take%20offline).
projects|post_projects_by_id_enable|POST /api/projects/:id/enable|write|Enable%20a%20project%20(allow%20deploys%20%2F%20bring%20online).
projects|get_projects_by_id_env|GET /api/projects/:id/env|read|List%20a%20project's%20environment%20variables%20(secret%20values%20masked).
projects|patch_projects_by_id_env|PATCH /api/projects/:id/env|write|Merge%20env%20var%20changes%20(upserts%20%2B%20deletes)%3B%20untouched%20vars%20are%20preserved.
projects|get_projects_by_id_environments|GET /api/projects/:id/environments|read|List%20a%20project's%20environments%20(production%20%2F%20previews).
projects|post_projects_by_id_environments|POST /api/projects/:id/environments|write|Create%20a%20project%20environment%20(e.g.%20a%20preview).
projects|get_projects_by_id_git|GET /api/projects/:id/git|read|Get%20the%20project's%20linked%20git%20repository%20info.
projects|post_projects_by_id_git_link|POST /api/projects/:id/git/link|write|Link%20a%20git%20repository%20to%20the%20project.
projects|get_projects_by_id_incoming_webhooks|GET /api/projects/:id/incoming-webhooks|read|List%20a%20project's%20incoming%20webhooks%20(dynamic%20trigger%20URLs).
projects|post_projects_by_id_incoming_webhooks|POST /api/projects/:id/incoming-webhooks|write|Create%20an%20incoming%20webhook%20that%20fires%20a%20deploy%20or%20job%20when%20its%20URL%20is%20called.
projects|delete_projects_by_id_incoming_webhooks_by_hookId|DELETE /api/projects/:id/incoming-webhooks/:hookId|destructive|Delete%20an%20incoming%20webhook.
projects|patch_projects_by_id_incoming_webhooks_by_hookId|PATCH /api/projects/:id/incoming-webhooks/:hookId|write|Update%20an%20incoming%20webhook%20(name%2Fenabled%2Faction%2Fauth).
projects|get_projects_by_id_incoming_webhooks_by_hookId_deliveries|GET /api/projects/:id/incoming-webhooks/:hookId/deliveries|read|List%20one%20incoming%20webhook's%20recent%20deliveries%20(paginated).
projects|post_projects_by_id_incoming_webhooks_by_hookId_rotate|POST /api/projects/:id/incoming-webhooks/:hookId/rotate|write|Rotate%20an%20incoming%20webhook's%20token%20%2F%20HMAC%20secret.
projects|get_projects_by_id_info|GET /api/projects/:id/info|read|Get%20a%20project's%20detailed%20info%20(runtime%2C%20build%2C%20source).
projects|get_projects_by_id_logs|GET /api/projects/:id/logs|read|Fetch%20the%20project's%20runtime%20logs%20(non-streaming).
projects|post_projects_by_id_options|POST /api/projects/:id/options|write|Set%20build%2Fdeploy%20options%20for%20a%20project.
projects|post_projects_by_id_output_check|POST /api/projects/:id/output-check|read|Live%20static-output%20check%20for%20the%20project's%20active%20deployment%20(advisory%3B%20static%20apps).
projects|post_projects_by_id_port_check|POST /api/projects/:id/port-check|read|Live%20port-reachability%20check%20for%20the%20project's%20active%20deployment%20(advisory).
projects|get_projects_by_id_resources|GET /api/projects/:id/resources|read|Get%20the%20project's%20CPU%2FRAM%2Fdisk%20resource%20config.
projects|patch_projects_by_id_resources|PATCH /api/projects/:id/resources|write|Update%20the%20project's%20CPU%2FRAM%2Fdisk%2C%20sleep%20mode%2C%20or%20port.
projects|post_projects_by_id_routing_retry|POST /api/projects/:id/routing/retry|write|Retry%20syncing%20the%20project's%20free%20.vibrail.warpgateapi.com%20edge%20route%20(no%20rebuild)%3B%20clears%20the%20routing%20'Action%20Required'%20warning%20on%20success.
projects|get_projects_by_id_server_logs_recent|GET /api/projects/:id/server-logs/recent|read|Fetch%20recent%20HTTP%20request%20logs%20for%20the%20project.
projects|post_projects_by_id_sleep_mode|POST /api/projects/:id/sleep-mode|write|Set%20the%20project's%20sleep%20mode%20(auto_sleep%20%2F%20always_on).
projects|get_projects_by_id_webhook_deliveries|GET /api/projects/:id/webhook-deliveries|read|List%20a%20project's%20webhook%20delivery%20feed%20%E2%80%94%20GitHub%20pushes%20%2B%20custom%20hooks%20(paginated).
projects|post_projects_ensure|POST /api/projects/ensure|write|Folder-upload%20deploy%20%E2%80%94%20STEP%203%2F4.%20Create%20or%20update%20the%20project%20that%20carries%20the%20build%20config%20%E2%80%94%20deployments%2Fbuild%2Faccess%20reads%20config%20from%20the%20PROJECT%20ROW%2C%20not%20the%20upload%20session%2C%20so%20this%20must%20run%20first.%20Map%20the%20folder%2Fscan%20fields%20in%20(framework%20%3D%20the%20scan's%20stack%20id)%20and%20set%20gitProvider%3A'upload'.%20Pass%20projectId%20to%20update%20an%20existing%20project.%20Returns%20the%20project%20id%20for%20STEP%204.
projects|post_projects_folder_scan_by_sessionId|POST /api/projects/folder/scan/:sessionId|write|Folder-upload%20deploy%20%E2%80%94%20STEP%202%2F4.%20Run%20AFTER%20the%20tarball%20is%20uploaded.%20Detects%20the%20uploaded%20source's%20framework%2Fbuild%20config%20(stack%2C%20packageManager%2C%20install%2Fbuild%2Fstart%20commands%2C%20outputDirectory%2C%20productionPaths%2C%20port).%20Body%20may%20be%20empty%20(%7B%7D).%20Feed%20the%20result%20into%20projects%2Fensure%20(STEP%203).
projects|post_projects_folder_session|POST /api/projects/folder/session|write|Folder-upload%20deploy%20%E2%80%94%20STEP%201%2F4.%20Opens%20an%20upload%20session%20for%20a%20local%20source%20folder%20and%20returns%20%60upload%60%20%3D%20%7B%20url%2C%20method%2C%20headers%20%7D.%20NEXT%2C%20upload%20the%20gzipped%20tarball%20yourself%3A%20POST%20it%20to%20%60upload.url%60%20with%20the%20returned%20headers%20and%20Content-Type%3A%20application%2Fgzip.%20That%20byte%20upload%20is%20NOT%20an%20MCP%20tool%20(raw%20binary%20can't%20cross%20JSON-RPC)%20%E2%80%94%20use%20an%20HTTP%20client.%20Then%20call%20folder%2Fscan.%20Sequence%3A%20session%20%E2%86%92%20(out-of-band%20tarball%20upload)%20%E2%86%92%20folder%2Fscan%20%E2%86%92%20projects%2Fensure%20%E2%86%92%20deployments%2Fbuild%2Faccess.
services|get_projects_by_id_services|GET /api/projects/:id/services|read|List%20a%20project's%20services%20(compose%20services%20%2F%20monorepo%20sub-apps).
services|post_projects_by_id_services|POST /api/projects/:id/services|write|Add%20a%20service%20to%20a%20project.
services|get_projects_by_id_services_by_serviceId|GET /api/projects/:id/services/:serviceId|read|Get%20one%20service%20by%20id.
services|patch_projects_by_id_services_by_serviceId|PATCH /api/projects/:id/services/:serviceId|write|Update%20a%20service's%20configuration.
services|post_projects_by_id_services_by_serviceId_drift_accept|POST /api/projects/:id/services/:serviceId/drift/accept|write|Accept%20upstream%20docker-compose%20changes%20for%20this%20service.
services|post_projects_by_id_services_by_serviceId_drift_keep|POST /api/projects/:id/services/:serviceId/drift/keep|write|Keep%20local%20edits%20over%20upstream%20docker-compose%20changes%20for%20this%20service.
services|get_projects_by_id_services_by_serviceId_env|GET /api/projects/:id/services/:serviceId/env|read|List%20a%20service's%20environment%20variables.
services|put_projects_by_id_services_by_serviceId_env|PUT /api/projects/:id/services/:serviceId/env|write|Replace%20a%20service's%20environment%20variables.
services|get_projects_by_id_services_by_serviceId_logs|GET /api/projects/:id/services/:serviceId/logs|read|Fetch%20a%20service's%20runtime%20logs%20(non-streaming).
services|post_projects_by_id_services_by_serviceId_restart|POST /api/projects/:id/services/:serviceId/restart|write|Restart%20this%20service's%20container.
services|post_projects_by_id_services_by_serviceId_start|POST /api/projects/:id/services/:serviceId/start|write|Start%20this%20service's%20container.
services|post_projects_by_id_services_by_serviceId_stop|POST /api/projects/:id/services/:serviceId/stop|write|Stop%20this%20service's%20container.
services|get_projects_by_id_services_by_serviceId_volume_sizes|GET /api/projects/:id/services/:serviceId/volume-sizes|read|Measure%20the%20on-disk%20size%20(du)%20of%20each%20of%20a%20service's%20volumes.
services|get_projects_by_id_services_containers|GET /api/projects/:id/services/containers|read|List%20the%20running%20containers%20for%20a%20project's%20services.
services|post_projects_by_id_services_sync|POST /api/projects/:id/services/sync|write|Sync%20services%20from%20the%20project's%20docker-compose%20file%20into%20the%20service%20table.
settings|get_settings|GET /api/settings|read|Get%20the%20org's%20workspace%20settings%20(build%20mode%2C%20deploy%20defaults%2C%20preferences).
settings|patch_settings_build_mode|PATCH /api/settings/build-mode|write|Set%20the%20default%20build%20mode%20(server%20%2F%20local).
settings|patch_settings_clone_strategy_preference|PATCH /api/settings/clone-strategy-preference|write|Set%20the%20default%20clone%20strategy%20(api-host%20%2F%20server).
settings|patch_settings_deploy_defaults|PATCH /api/settings/deploy-defaults|write|Set%2Fclear%20the%20default%20deploy%20target%20(local%2Fserver%2Fcloud)%20and%20server.
settings|patch_settings_forward_git|PATCH /api/settings/forward-git|write|Enable%2Fdisable%20forwarding%20your%20local%20git%20identity%20(gh%20CLI)%20to%20remote%20build%20servers%20during%20a%20server%20clone.
settings|patch_settings_route_strategy|PATCH /api/settings/route-strategy|write|Set%20the%20default%20edge%E2%86%92app%20route%20strategy%20(auto%20%2F%20loopback-port%20%2F%20container-ip).
settings|patch_settings_transfer|PATCH /api/settings/transfer|write|Set%20the%20default%20volume-transfer%20mode%20(auto%2Fstream%2Fdirect%2Frsync)%20and%20compression%20(auto%2Fzstd%2Fgzip%2Fnone)%20for%20migrations.
settings|get_settings_webhook_deliveries|GET /api/settings/webhook-deliveries|read|List%20the%20org's%20webhook%20delivery%20feed%2C%20including%20pushes%20forwarded%20to%20Cloud%20or%20from%20unmanaged%20repos%20(paginated).
system|get_system_servers|GET /api/system/servers|read|List%20the%20current%20organization's%20servers%20so%20a%20server%20id%20can%20be%20selected%20for%20inspection.
system|get_system_servers_by_id|GET /api/system/servers/:id|read|Get%20one%20server's%20non-secret%20connection%20details.
system|get_system_servers_by_id_docker_overview|GET /api/system/servers/:id/docker/overview|read|Inspect%20a%20server%20and%20its%20live%20Docker%20workloads.%20Returns%20the%20server%20summary%2C%20running%20Vibrail%20projects%20correlated%20from%20trusted%20project%20records%2C%20all%20Docker%20containers%20with%20state%2Fhealth%2Fresource%20metrics%2C%20and%20aggregate%20counts.
updates|get_updates|GET /api/updates|read|List%20update%20statuses%20for%20the%20org%20(apps%2C%20projects%2C%20self-app%2C%20webmail).%20%3Fbehind%3D1%20filters%20to%20those%20with%20an%20update%20available.
updates|post_updates_by_projectId_apply|POST /api/updates/:projectId/apply|write|Apply%20the%20available%20update%20to%20a%20project%2Fapp%20(force-pulls%20image%20tags%2C%20redeploys%2C%20pre-deploy%20backup).
updates|post_updates_scan|POST /api/updates/scan|write|Trigger%20a%20fresh%20update%20scan%20across%20the%20org's%20projects%2Fapps.
`

const mcpCategoryLabels = {
  zh: { analytics: '分析', apps: '应用', backups: '备份', 'cloud-local': '云连接', deployments: '部署', domains: '域名', github: 'GitHub', jobs: '任务', notifications: '通知', operations: '后台操作', projects: '项目', services: '服务', settings: '设置', system: '服务器', updates: '更新' },
  en: { analytics: 'Analytics', apps: 'Apps', backups: 'Backups', 'cloud-local': 'Cloud', deployments: 'Deployments', domains: 'Domains', github: 'GitHub', jobs: 'Jobs', notifications: 'Notifications', operations: 'Operations', projects: 'Projects', services: 'Services', settings: 'Settings', system: 'Servers', updates: 'Updates' },
}

const mcpKindLabels = {
  zh: { read: '只读', write: '写入', destructive: '危险写入' },
  en: { read: 'Read only', write: 'Write', destructive: 'Destructive' },
}

const mcpPurposeActionsZh = { get: '获取', post: '执行', patch: '更新', put: '替换', delete: '删除' }
const mcpPurposeTokensZh = {
  accept: '接受上游变更', access: '部署访问', active: '当前活动项', analytics: '分析数据', app: '应用', appId: '应用 ID', apply: '应用更新', apps: '应用', auto: '自动', backup: '备份', branch: '分支', branches: '分支列表', build: '构建', bundle: '批量连接', by: '指定', cancel: '取消', catalog: '应用目录', categories: '通知类别', channels: '通知渠道', check: '检查', clone: '克隆', cloud: '云端', commit: '提交状态', connection: '应用连接', connections: '项目连接', container: '容器信息', containers: '容器列表', count: '数量', custom: '自定义应用', dashboard: '仪表盘汇总', defaults: '默认设置', deletion: '删除预览', deliveries: '投递记录', deploy: '部署', deployments: '部署记录', disable: '停用', docker: 'Docker', domains: '域名', drift: '配置漂移', enable: '启用', ensure: '确保项目存在', env: '环境变量', environments: '项目环境', events: '触发事件', file: '文件内容', files: '文件列表', folder: '文件夹上传', forward: '转发', git: 'Git 配置', github: 'GitHub', home: '首页汇总', hookId: 'Webhook ID', id: 'ID', incoming: '入站', info: '详细信息', jobs: '任务', keep: '保留成功部分', key: '任务 Key', link: '关联', linkId: '连接 ID', logs: '日志', mode: '模式', notifications: '通知', operations: '后台操作', options: '部署选项', org: '组织', orgs: '组织', output: '输出', overview: '概览', owner: '仓库所有者', periods: '时间周期', policies: '策略', port: '端口', preference: '偏好', prepare: '部署预检查', preview: '预览', primary: '设为主域名', projectId: '项目 ID', projects: '项目', recent: '最近记录', records: 'DNS 记录', redeploy: '重新部署', reject: '拒绝并回滚', repo: '仓库', repos: '仓库列表', resources: '资源配置', respond: '响应交互提示', restart: '重启', restoreId: '恢复任务 ID', restores: '恢复任务', retry: '重试', rollback: '回滚', rotate: '轮换密钥', route: '路由', routing: '路由同步', run: '立即运行', runId: '运行 ID', runs: '运行记录', scan: '扫描', schedules: '计划任务', seen: '标记已读', server: '服务器', servers: '服务器', serviceId: '服务 ID', services: '服务', session: '上传会话', sessionId: '会话 ID', settings: '设置', sizes: '大小', sleep: '休眠', start: '启动', status: '状态', stop: '停止', strategy: '策略', stream: '实时流', subscriptions: '订阅', sync: '同步', system: '系统', test: '测试', transfer: '传输', trigger: '触发器', unseen: '未读', updates: '更新', usage: '资源用量', verify: '验证', volume: '数据卷', webhook: 'Webhook', webhooks: 'Webhook', workspaces: '云工作区',
}

const mcpPurposeZh = (name) => {
  const [action, ...tokens] = name.split('_')
  return `${mcpPurposeActionsZh[action] || '操作'}：${tokens.map((token) => mcpPurposeTokensZh[token] || token).join(' / ')}`
}

const mcpToolRows = (locale) => mcpToolsData.trim().split('\n').map((line) => {
  const [category, name, route, kind, encodedDescription] = line.split('|')
  const purpose = locale === 'zh' ? mcpPurposeZh(name) : decodeURIComponent(encodedDescription)
  const tool = `<code class="mcp-tool-name">${name}</code><span class="mcp-tool-route">${route}</span>`
  const description = `<span class="mcp-tool-purpose">${purpose}</span><span class="mcp-kind mcp-kind-${kind}">${mcpKindLabels[locale][kind]}</span>`
  return [mcpCategoryLabels[locale][category] || category, tool, description]
})


const pagesZh = {
  '/docs': {
    nav: 'docs',
    eyebrow: '文档',
    title: '文档总览',
    lead: '从代码到线上服务：使用 Vibrail 部署应用、连接自己的服务器，并通过 API 与 MCP 自动化整个工作流。',
    body: `<p>Vibrail 是面向开发者的应用部署与运维平台。你可以从 GitHub 仓库或本地文件夹发布项目，将它运行在 Vibrail Cloud、自己的 Linux 服务器或本机环境中。</p><h2 id="start">快速开始</h2><p>创建项目时，只需要选择代码来源、运行位置和部署配置。Vibrail 会完成构建、启动、路由与后续版本管理。</p>${cards([
      ['部署第一个项目', '通过控制台完成一次从 GitHub 到公网地址的部署。', '/docs/quickstart'],
      ['使用 Vibrail CLI', '从终端登录、部署项目、管理自托管实例并接入 CI。', '/docs/cli'],
      ['打开 Vibrail 控制台', '创建项目、查看构建日志并管理运行中的服务。', DASHBOARD_URL],
    ])}<h2 id="deploy">选择部署方式</h2><p>Vibrail 对 GitHub 与本地文件夹使用同一套构建流水线，并允许你自由选择运行目标。</p>${cards([
      ['从 GitHub 部署', '连接仓库，支持私有仓库与 push 自动部署。', '/docs/deploy/github'],
      ['部署本地文件夹', '无需 Git，直接上传当前目录并发布。', '/docs/deploy/folder'],
      ['连接自己的服务器', '通过 SSH 把 VPS、独立服务器或家用主机接入 Vibrail。', '/docs/deploy/server'],
      ['域名与 HTTPS', '为项目绑定域名并配置自动 HTTPS。', '/docs/domains'],
    ])}<h2 id="automation">自动化接口</h2><p>REST API 和 MCP 共用相同的项目、部署与权限模型。</p>${cards([
      ['REST API', '使用 Bearer Token 调用项目与部署接口。', '/docs/api'],
      ['MCP', '让 Codex、Claude、Cursor 等 AI 客户端安全操作 Vibrail。', '/docs/mcp'],
      ['常见问题', '查看部署、域名、鉴权和运行时问题。', '/docs/faq'],
    ])}`,
  },
  '/docs/quickstart': {
    nav: 'docs',
    eyebrow: '开始使用',
    title: '快速开始',
    lead: '通过 GitHub 仓库创建项目，并在几分钟内获得第一个可访问的部署地址。',
    body: `<ol class="steps"><li><strong>登录控制台</strong>访问 <a href="${DASHBOARD_URL}" target="_blank" rel="noreferrer">vibrail.warpgateapi.com</a>，完成登录并选择组织。</li><li><strong>创建项目</strong>点击新建项目，选择 GitHub 仓库或本地文件夹作为代码来源。</li><li><strong>选择运行位置</strong>使用 Vibrail Cloud，或选择已连接的自有服务器。</li><li><strong>确认构建配置</strong>检查框架、包管理器、构建命令、启动命令和端口。</li><li><strong>开始部署</strong>提交后实时查看构建日志，成功后打开项目地址。</li></ol><h2 id="verify">验证部署</h2><p>Web 服务必须监听 <code>0.0.0.0</code> 和平台提供的端口。项目页面会展示部署状态与运行日志。</p><div class="callout warning"><strong>不要把密钥提交到仓库</strong><p>数据库连接、API Key 和密码应添加到项目环境变量中。</p></div>${cards([
      ['环境变量与项目配置', '配置构建命令、启动命令、端口和敏感变量。', '/docs/projects'],
      ['日志与故障排查', '构建失败或服务无法访问时从这里开始。', '/docs/logs'],
    ])}`,
  },
  '/docs/cli': {
    nav: 'cli',
    eyebrow: '命令行工具',
    title: 'Vibrail CLI',
    lead: '从终端部署应用、管理多个 Vibrail 实例，并安装和运维自托管控制面。',
    body: `<h2 id="install">安装</h2><p>npm 包需要 Node.js 22 或更高版本。服务器安装脚本可以安装所需运行时和最新 CLI。</p>${code(
      'Terminal',
      `npm install --global @vibrail/cli
vibrail --version

# 无需全局安装，直接运行最新版
npx --yes @vibrail/cli@latest --help

# 新服务器安装
curl -fsSL https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.sh | sh`,
    )}<p>使用 <code>vibrail update --check</code> 检查新版本，使用 <code>vibrail update</code> 完成升级。</p><h2 id="login">登录与上下文</h2><p>每个上下文保存一个 Vibrail 实例的 API 地址、控制台地址和登录令牌。浏览器登录是推荐方式。</p>${code(
      'Terminal',
      `# Vibrail Cloud
vibrail login

# 自托管实例
vibrail login \\
  --context production \\
  --api-url https://ops.example.com/api/proxy \\
  --dashboard-url https://ops.example.com

vibrail context list
vibrail context use production
vibrail status`,
    )}<div class="callout warning"><strong>保护登录令牌</strong><p>登录信息保存在 <code>~/.vibrail/config.json</code>。不要提交或打印该文件；CI 中应使用受保护的 Secret。</p></div><h2 id="deploy">部署项目</h2><p>首次使用时将目录关联到项目，之后即可直接部署。Git 仓库默认使用当前分支；非 Git 目录会自动走文件夹上传流程。</p>${code(
      'Terminal',
      `cd my-app
vibrail init
vibrail deploy --watch

# 非交互关联
vibrail init --project proj_example --yes

# 部署本地文件夹到指定服务器
vibrail deploy --name my-app --server-id srv_example --watch`,
    )}<h3 id="deploy-options">常用部署选项</h3>${table(
      ['命令', '用途'],
      [
        ['<code>vibrail deploy --env preview --watch</code>', '创建预览环境部署'],
        ['<code>vibrail deploy --branch main --commit &lt;sha&gt; --watch</code>', '部署指定分支与提交'],
        ['<code>vibrail deploy --smart-route --watch</code>', '只重建发生变化的服务'],
        ['<code>vibrail deploy --service-ids api,worker --watch</code>', '只部署指定服务'],
        ['<code>vibrail deploy --refresh --watch</code>', '应用最新环境变量，不重新构建'],
      ],
    )}<h2 id="inspect">日志与部署操作</h2>${code(
      'Terminal',
      `vibrail deployment list
vibrail deployment get <deployment-id>
vibrail logs <deployment-id> --follow
vibrail deployment redeploy <deployment-id>
vibrail deployment rollback <deployment-id>`,
    )}<p><code>vibrail logs</code> 不传部署 ID 时，会使用当前关联项目的最新部署。</p><h2 id="config">声明式项目配置</h2><p>Vibrail 默认自动检测应用。需要明确覆盖构建命令、启动命令、端口或服务设置时，可创建 <code>vibrail.json</code>。</p>${code(
      'Terminal',
      `vibrail config init
vibrail config validate`,
    )}<h2 id="automation">JSON 与自动化</h2><p>全局 <code>--json</code> 必须放在子命令之前。没有专用 CLI 命令的接口可以通过 <code>vibrail api</code> 调用。</p>${code(
      'Terminal',
      `vibrail --json status
vibrail --json project list
vibrail --json deployment get <deployment-id>
vibrail api /projects
vibrail api -X POST /some/route --data '{"key":"value"}'`,
    )}<h2 id="self-host">自托管实例</h2><p>首次运行裸命令 <code>vibrail</code> 会打开安装向导；完成安装后再次运行会进入交互式控制面板。无交互服务器可以直接使用 <code>up</code>。</p>${code(
      'Terminal',
      `vibrail up --public-url https://ops.example.com
vibrail status
vibrail open

# 常用生命周期命令
vibrail stop
vibrail update
vibrail doctor`,
    )}<p>Linux 且 Docker 可用时，<code>up</code> 默认安装已发布的 Docker Compose 栈；其他环境运行捆绑的轻量服务。使用 <code>--compose</code> 或 <code>--bare</code> 可明确选择。</p><div class="callout warning"><strong>卸载会删除本机数据</strong><p><code>vibrail uninstall</code> 会在确认后删除本机服务和状态，但不会停止已经部署到其他服务器的应用。使用 <code>--keep-data</code> 可保留本地数据库、证书和配置目录。</p></div><h2 id="commands">命令索引</h2>${table(
      ['范围', '命令'],
      [
        ['安装与生命周期', '<code>up</code>、<code>stop</code>、<code>uninstall</code>、<code>install</code>、<code>update</code>、<code>open</code>、<code>status</code>、<code>doctor</code>'],
        ['登录与项目', '<code>login</code>、<code>logout</code>、<code>context</code>、<code>token</code>、<code>init</code>、<code>config</code>'],
        ['部署与资源', '<code>deploy</code>、<code>deployment</code>、<code>logs</code>、<code>project</code>、<code>service</code>、<code>domain</code>'],
        ['自托管基础设施', '<code>server</code>、<code>system</code>、<code>mail</code>、<code>backup</code>、<code>reset-admin-password</code>'],
        ['高级接口', '<code>api</code>'],
      ],
    )}<h2 id="troubleshooting">排错</h2><p>依次运行 <code>vibrail --version</code>、<code>vibrail context list</code>、<code>vibrail status</code> 和 <code>vibrail doctor</code>。使用 <code>vibrail &lt;command&gt; --help</code> 查看当前已安装版本的权威参数说明。</p>`,
  },
  '/docs/concepts': {
    nav: 'docs',
    eyebrow: '开始使用',
    title: '核心概念',
    lead: '理解项目、服务、部署、运行目标和域名之间的关系。',
    body: `<h2 id="project">项目</h2><p>项目是 Vibrail 的主要管理单元，包含代码来源、环境变量、运行配置、域名和部署历史。</p><h2 id="service">服务</h2><p>单体应用通常只有一个服务；Docker Compose 项目可以同时包含 Web、Worker、数据库和队列。</p><h2 id="deployment">部署</h2><p>每次构建和发布都会生成部署记录，包含源码版本、日志、状态与可回滚版本。</p><h2 id="target">运行目标</h2>${table(
      ['目标', '适用场景', '管理方式'],
      [
        ['Vibrail Cloud', '希望免维护基础设施', 'Vibrail 托管运行环境'],
        ['自有服务器', 'VPS、独立主机或家用服务器', '通过 SSH 连接'],
        ['本机', '本地测试与桌面工作流', '本机 Vibrail 实例'],
      ],
    )}<h2 id="domain">域名</h2><p>域名把外部请求路由到项目服务，支持平台子域名、自定义域名和 HTTPS。</p>`,
  },
  '/docs/deploy/github': {
    nav: 'deploy',
    eyebrow: '部署应用',
    title: '从 GitHub 部署',
    lead: '连接仓库、选择分支，并在每次 push 后自动构建和发布。',
    body: `<ol class="steps"><li><strong>连接 GitHub</strong>在设置中连接 Vibrail GitHub App，私有仓库需要对应账号或组织授权。</li><li><strong>选择仓库与分支</strong>可选 monorepo 子目录。</li><li><strong>检查构建计划</strong>确认安装、构建、启动命令和端口。</li><li><strong>选择目标并部署</strong>使用 Vibrail Cloud 或自有服务器。</li></ol><h2 id="auto">自动部署</h2><p>启用后，目标分支收到 push 会触发新部署，无需手动维护每个仓库的 webhook。</p><h2 id="private">私有仓库</h2><p>推荐使用 Vibrail GitHub App 的短期安装令牌，也可以配置只读 clone token 或服务器 SSH 凭据。</p><div class="callout"><strong>最小权限</strong><p>只授权需要部署的仓库，并优先使用只读、短期凭据。</p></div>`,
  },
  '/docs/deploy/folder': {
    nav: 'deploy',
    eyebrow: '部署应用',
    title: '部署本地文件夹',
    lead: '无需创建 Git 仓库，直接将本地源代码上传到 Vibrail 的构建流水线。',
    body: `<h2 id="dashboard">通过控制台</h2><ol class="steps"><li><strong>创建文件夹项目</strong>选择“本地文件夹”作为代码来源。</li><li><strong>选择源代码</strong>Vibrail 会打包文件并扫描技术栈。</li><li><strong>确认配置</strong>检查构建命令、启动命令、端口和运行目标。</li><li><strong>部署</strong>上传后启动构建并查看日志。</li></ol><h2 id="cli">通过 CLI</h2><p>在非 Git 目录中运行 <code>deploy</code>，CLI 会自动打包并上传当前文件夹。</p>${code('Terminal', `vibrail login
cd my-folder
vibrail deploy --name my-app --watch`)}<p>更多选项见 <a href="#/docs/cli">CLI 使用指南</a>。</p>`,
  },
  '/docs/deploy/server': {
    nav: 'deploy',
    eyebrow: '部署应用',
    title: '连接自己的服务器',
    lead: '通过 SSH 将 Linux 服务器加入 Vibrail，同时保留对基础设施和数据的控制权。',
    body: `<h2 id="requirements">服务器要求</h2><ul class="feature-list"><li>可通过 SSH 访问的 Linux 主机。</li><li>拥有安装或运行 Docker 所需的权限。</li><li>公网部署需开放 HTTP/HTTPS 端口。</li><li>自定义域名应解析到服务器公网 IP。</li></ul><h2 id="connect">连接步骤</h2><ol class="steps"><li><strong>添加服务器</strong>填写主机、SSH 端口和用户。</li><li><strong>配置凭据</strong>使用专用 SSH Key。</li><li><strong>运行检测</strong>检查 Docker、磁盘、端口、代理和运行环境。</li><li><strong>选择部署目标</strong>在项目中选择该服务器。</li></ol><h2 id="proxy">反向代理</h2><p>Vibrail 会复用明确配置且兼容的 Traefik，或创建自己的共享边缘代理，不会擅自接管无法确认的现有代理。</p><div class="callout warning"><strong>保护 Docker Socket</strong><p>Docker 控制权限等同于服务器高权限，只应在受信任的主机与网络中运行。</p></div>`,
  },
  '/docs/projects': {
    nav: 'docs',
    eyebrow: '项目与运维',
    title: '项目配置',
    lead: '管理环境变量、构建与启动命令、端口和多服务项目。',
    body: `<h2 id="environment">环境变量</h2><p>在项目设置中添加普通变量和敏感变量。修改后需要重新部署或刷新运行环境。</p><h2 id="commands">构建与启动命令</h2>${table(
      ['配置', '用途', '示例'],
      [
        ['Install', '安装依赖', '<code>npm ci</code>'],
        ['Build', '生成生产构建', '<code>npm run build</code>'],
        ['Start', '启动服务', '<code>npm run start</code>'],
        ['Port', '应用监听端口', '<code>3000</code>'],
      ],
    )}<h2 id="network">监听地址</h2><p>容器内 Web 应用应监听 <code>0.0.0.0</code>，优先读取平台注入的 <code>PORT</code>。</p><h2 id="compose">Docker Compose</h2><p>Compose 项目会把多个服务作为一个协调部署管理，并为服务创建私有网络。</p>`,
  },
  '/docs/domains': {
    nav: 'docs',
    eyebrow: '项目与运维',
    title: '域名与 HTTPS',
    lead: '为部署绑定平台域名或自定义域名，并让 Vibrail 配置路由和 TLS。',
    body: `<ol class="steps"><li><strong>选择已部署项目</strong>项目至少需要一次成功部署。</li><li><strong>添加域名</strong>输入域名并选择公开服务。</li><li><strong>配置 DNS</strong>按照预览创建 A、AAAA 或 CNAME 记录。</li><li><strong>验证并启用</strong>Vibrail 会更新路由并申请证书。</li></ol><h2 id="dns">DNS 生效</h2><p>更新可能需要几分钟到数小时。验证失败时检查记录值、代理状态、TTL 和服务器 IP。</p><h2 id="https">HTTPS</h2><p>证书签发需要域名正确解析且 80/443 端口可达。</p>`,
  },
  '/docs/logs': {
    nav: 'docs',
    eyebrow: '项目与运维',
    title: '日志与故障排查',
    lead: '从构建日志、运行日志、请求日志和服务状态快速定位问题。',
    body: `<h2 id="build">构建失败</h2><ul class="feature-list"><li>检查依赖与 lockfile 是否匹配。</li><li>确认 monorepo 根目录和构建目录。</li><li>补齐构建阶段需要的环境变量。</li><li>确认工具链版本。</li></ul><h2 id="runtime">部署成功但无法访问</h2><ul class="feature-list"><li>应用进程是否持续运行。</li><li>是否监听 <code>0.0.0.0</code> 和正确端口。</li><li>健康检查是否成功。</li><li>DNS、防火墙和 Traefik 路由是否一致。</li></ul><div class="callout"><strong>提交支持信息</strong><p>提供部署 ID 和必要日志片段，始终删除 Token、密码和环境变量值。</p></div>`,
  },
  '/docs/api': {
    nav: 'api',
    eyebrow: '开发者',
    title: 'REST API',
    lead: 'Vibrail 控制台使用同一套 HTTP API，外部集成可通过个人访问令牌调用。',
    body: `<h2 id="base-url">Base URL</h2><p>托管 API Base URL 为 <code>${API_URL}</code>；自托管实例使用自己的域名加 <code>/api</code>。</p><h2 id="auth">鉴权</h2><p>在 Settings → Tokens 中创建个人访问令牌，并作为 Bearer Token 发送。</p>${code('HTTP', 'Authorization: Bearer YOUR_TOKEN')}<h2 id="example">请求示例</h2>${code(
      'Terminal',
      `curl ${API_URL}/projects \\
  -H "Authorization: Bearer $VIBRAIL_TOKEN" \\
  -H "X-Organization-Id: $VIBRAIL_ORG_ID"`,
    )}<h2 id="resources">完整路由组</h2><p>以下清单根据当前 API 服务实际挂载的路由整理。一个路由组通常包含多个 GET、POST、PATCH、PUT、DELETE、SSE 或 WebSocket 端点。</p>${table(
      ['序号', '路径', '功能', '可用范围'],
      numberedRows(apiGroupsZh),
      'api-routes-table',
    )}<div class="callout"><strong>部署模式会影响可用接口</strong><p>托管、自托管和启用用户服务器的实例会挂载不同的系统、迁移、终端、邮件、云端与计费实现。调用前应根据实例模式检查接口是否可用。</p></div><h2 id="errors">错误与限流</h2><p>集成应处理 <code>401</code>、<code>403</code>、<code>404</code>、<code>429</code> 和临时 <code>5xx</code>。</p>`,
  },
  '/docs/mcp': {
    nav: 'mcp',
    eyebrow: '开发者',
    title: 'MCP',
    lead: '将 Codex、Claude、Cursor、ChatGPT 等 AI 客户端连接到 Vibrail，并使用受限权限操作项目。',
    body: `<h2 id="endpoint">端点</h2><p>Vibrail 提供符合 OAuth 2.1 的 Streamable HTTP MCP 端点：</p>${code('URL', MCP_URL)}<h2 id="codex">连接 Codex</h2>${code('Terminal', `codex mcp add vibrail --url ${MCP_URL}\ncodex mcp login vibrail`)}<h2 id="oauth">OAuth 授权</h2><ol class="steps"><li><strong>添加服务器</strong>客户端使用 MCP URL 连接。</li><li><strong>在浏览器中确认</strong>选择权限和允许访问的资源。</li><li><strong>开始使用</strong>客户端只会看到授权范围内的工具，可在 Settings → MCP 撤销。</li></ol><h2 id="token">静态令牌</h2><p>不支持 OAuth 的客户端可以使用个人访问令牌。</p>${code(
      'JSON',
      `{
  "mcpServers": {
    "vibrail": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`,
    )}<h2 id="tools">全部 MCP 工具</h2><p>当前代码中共有 <strong>149 个</strong>通过显式白名单开放的 MCP 工具。实际的 <code>tools/list</code> 会根据用户角色、组织权限、资源授权和令牌是否只读进一步过滤。</p>${table(
      ['序号', '分类', '工具', '功能'],
      numberedRows(mcpToolRows('zh')),
      'mcp-tools-table',
    )}<div class="callout warning"><strong>使用最小权限</strong><p>只读令牌只会看到可读取的工具；受限成员只会看到其资源授权允许的工具。危险写入工具可能删除资源或产生难以撤销的影响，调用前应再次确认目标。</p></div>`,
  },
  '/docs/faq': {
    nav: 'faq',
    eyebrow: '支持',
    title: '常见问题',
    lead: '关于代码来源、服务器、端口、域名、API 与 MCP 的高频问题。',
    body: `<h2 id="stacks">可以部署哪些技术栈？</h2><p>支持自动检测的栈、Dockerfile、Docker Compose 和自定义命令，覆盖常见 Node.js、Python、Go、Rust、PHP、Java、Kotlin、.NET、Ruby 与 Elixir 项目。</p><h2 id="github">代码必须放在 GitHub 吗？</h2><p>不需要，可以从 GitHub 部署或直接上传本地文件夹。</p><h2 id="dockerfile">必须写 Dockerfile 和 Docker Compose 吗？</h2><p><strong>强烈推荐使用 Dockerfile；包含多个服务时，优先使用 Docker Compose。</strong> 这样可以明确固定运行环境、依赖、构建过程、启动方式、端口、健康检查和服务关系，使本地、Vibrail Cloud 与自有服务器使用完全一致的部署配置，也更容易排查问题、迁移和回滚。</p><div class="callout"><strong>推荐的生产部署方式</strong><p>单服务项目使用 Dockerfile；Web、Worker、数据库、缓存等多服务项目使用 Docker Compose，并为每个自建镜像配置 Dockerfile。</p></div><h2 id="port">为什么部署成功但页面打不开？</h2><p>确认监听 <code>0.0.0.0</code> 和正确端口，并检查进程、DNS、防火墙和路由日志。</p><h2 id="server">可以部署到自己的服务器吗？</h2><p>可以，通过 SSH 连接 Linux 服务器后选择它作为运行目标。</p><h2 id="api-token">API 和 MCP 使用同一种令牌吗？</h2><p>静态 MCP 鉴权可以使用个人访问令牌；支持 OAuth 的客户端建议使用浏览器授权。</p>`,
  },
}
const pagesEn = {
  '/docs': {
    nav: 'docs',
    eyebrow: 'Documentation',
    title: 'Documentation overview',
    lead: 'Go from source code to a live service with Vibrail, then automate deployments and operations through the API or MCP.',
    body: `<p>Vibrail is an application deployment and operations platform. Deploy from GitHub or a local folder to Vibrail Cloud, your own Linux server, or your local machine.</p><h2 id="start">Get started</h2><p>Choose a source, runtime target, and build settings. Vibrail handles builds, process lifecycle, routing, and deployment history.</p>${cards([
      ['Deploy your first project', 'Walk through a GitHub deployment from the console.', '/docs/quickstart'],
      ['Use the Vibrail CLI', 'Sign in, deploy, operate self-hosted instances, and automate CI from the terminal.', '/docs/cli'],
      ['Open the Vibrail Console', 'Create projects, watch builds, and manage services.', DASHBOARD_URL],
    ])}<h2 id="deploy">Choose a deployment path</h2>${cards([
      ['Deploy from GitHub', 'Connect a repository with private-repo and push-deploy support.', '/docs/deploy/github'],
      ['Deploy a local folder', 'Upload source without creating a Git repository.', '/docs/deploy/folder'],
      ['Connect your server', 'Add a VPS, dedicated host, or homelab machine over SSH.', '/docs/deploy/server'],
      ['Domains and HTTPS', 'Attach a domain and configure secure routing.', '/docs/domains'],
    ])}<h2 id="automation">Automate Vibrail</h2>${cards([
      ['REST API', 'Use bearer tokens to integrate with projects and deployments.', '/docs/api'],
      ['MCP', 'Give AI clients scoped access to Vibrail.', '/docs/mcp'],
      ['FAQ', 'Find answers for deployment, networking, and authentication.', '/docs/faq'],
    ])}`,
  },
  '/docs/quickstart': {
    nav: 'docs',
    eyebrow: 'Get started',
    title: 'Quickstart',
    lead: 'Create a project from GitHub and get your first deployment URL in a few minutes.',
    body: `<ol class="steps"><li><strong>Sign in</strong>Open <a href="${DASHBOARD_URL}" target="_blank" rel="noreferrer">vibrail.warpgateapi.com</a> and select an organization.</li><li><strong>Create a project</strong>Choose a GitHub repository or local folder.</li><li><strong>Choose where it runs</strong>Use Vibrail Cloud or a connected server.</li><li><strong>Review the build plan</strong>Confirm the framework, commands, and port.</li><li><strong>Deploy</strong>Watch the logs and open the generated URL.</li></ol><h2 id="verify">Verify the service</h2><p>Web applications must listen on <code>0.0.0.0</code> and the platform-provided port.</p><div class="callout warning"><strong>Keep secrets out of Git</strong><p>Add database URLs, API keys, and passwords as project environment variables.</p></div>${cards([
      ['Project configuration', 'Set commands, ports, and environment variables.', '/docs/projects'],
      ['Logs and troubleshooting', 'Start here when a build fails or a service is unreachable.', '/docs/logs'],
    ])}`,
  },
  '/docs/cli': {
    nav: 'cli',
    eyebrow: 'Command line',
    title: 'Vibrail CLI',
    lead: 'Deploy applications, switch between Vibrail instances, and install or operate a self-hosted control plane from your terminal.',
    body: `<h2 id="install">Install</h2><p>The npm package requires Node.js 22 or newer. The server installer can set up the required runtime and latest CLI.</p>${code(
      'Terminal',
      `npm install --global @vibrail/cli
vibrail --version

# Run the latest release without a global install
npx --yes @vibrail/cli@latest --help

# Install on a new server
curl -fsSL https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.sh | sh`,
    )}<p>Use <code>vibrail update --check</code> to check for a release and <code>vibrail update</code> to upgrade.</p><h2 id="login">Login and contexts</h2><p>Each context stores the API endpoint, dashboard endpoint, and login token for one Vibrail instance. Browser login is recommended.</p>${code(
      'Terminal',
      `# Vibrail Cloud
vibrail login

# Self-hosted instance
vibrail login \\
  --context production \\
  --api-url https://ops.example.com/api/proxy \\
  --dashboard-url https://ops.example.com

vibrail context list
vibrail context use production
vibrail status`,
    )}<div class="callout warning"><strong>Protect login tokens</strong><p>Login state is stored in <code>~/.vibrail/config.json</code>. Never commit or print that file; use a protected secret in CI.</p></div><h2 id="deploy">Deploy a project</h2><p>Link a directory once, then deploy from its root. Git repositories use the current branch by default; non-Git directories automatically use folder upload.</p>${code(
      'Terminal',
      `cd my-app
vibrail init
vibrail deploy --watch

# Non-interactive linking
vibrail init --project proj_example --yes

# Deploy a local folder to a selected server
vibrail deploy --name my-app --server-id srv_example --watch`,
    )}<h3 id="deploy-options">Common deploy options</h3>${table(
      ['Command', 'Purpose'],
      [
        ['<code>vibrail deploy --env preview --watch</code>', 'Create a preview deployment'],
        ['<code>vibrail deploy --branch main --commit &lt;sha&gt; --watch</code>', 'Deploy a specific branch and commit'],
        ['<code>vibrail deploy --smart-route --watch</code>', 'Rebuild only changed services'],
        ['<code>vibrail deploy --service-ids api,worker --watch</code>', 'Deploy selected services'],
        ['<code>vibrail deploy --refresh --watch</code>', 'Apply current environment without rebuilding'],
      ],
    )}<h2 id="inspect">Logs and deployment operations</h2>${code(
      'Terminal',
      `vibrail deployment list
vibrail deployment get <deployment-id>
vibrail logs <deployment-id> --follow
vibrail deployment redeploy <deployment-id>
vibrail deployment rollback <deployment-id>`,
    )}<p>Without a deployment ID, <code>vibrail logs</code> uses the latest deployment for the linked project.</p><h2 id="config">Declarative project configuration</h2><p>Vibrail auto-detects applications by default. Create <code>vibrail.json</code> when you need to override build, start, port, or service settings.</p>${code(
      'Terminal',
      `vibrail config init
vibrail config validate`,
    )}<h2 id="automation">JSON and automation</h2><p>The global <code>--json</code> option must appear before the command. Use <code>vibrail api</code> when an API operation has no dedicated command.</p>${code(
      'Terminal',
      `vibrail --json status
vibrail --json project list
vibrail --json deployment get <deployment-id>
vibrail api /projects
vibrail api -X POST /some/route --data '{"key":"value"}'`,
    )}<h2 id="self-host">Self-hosted instances</h2><p>Run bare <code>vibrail</code> for guided setup. After installation, the same command opens the interactive control panel. Headless servers can use <code>up</code> directly.</p>${code(
      'Terminal',
      `vibrail up --public-url https://ops.example.com
vibrail status
vibrail open

# Common lifecycle commands
vibrail stop
vibrail update
vibrail doctor`,
    )}<p>On Linux with Docker, <code>up</code> defaults to the published Docker Compose stack. Other environments run the bundled lightweight service. Use <code>--compose</code> or <code>--bare</code> to select explicitly.</p><div class="callout warning"><strong>Uninstall removes local data</strong><p><code>vibrail uninstall</code> removes the local service and state after confirmation, but leaves applications deployed to other servers running. Use <code>--keep-data</code> to retain the database, certificates, and configuration directory.</p></div><h2 id="commands">Command index</h2>${table(
      ['Area', 'Commands'],
      [
        ['Install and lifecycle', '<code>up</code>, <code>stop</code>, <code>uninstall</code>, <code>install</code>, <code>update</code>, <code>open</code>, <code>status</code>, <code>doctor</code>'],
        ['Authentication and setup', '<code>login</code>, <code>logout</code>, <code>context</code>, <code>token</code>, <code>init</code>, <code>config</code>'],
        ['Deployments and resources', '<code>deploy</code>, <code>deployment</code>, <code>logs</code>, <code>project</code>, <code>service</code>, <code>domain</code>'],
        ['Self-hosted infrastructure', '<code>server</code>, <code>system</code>, <code>mail</code>, <code>backup</code>, <code>reset-admin-password</code>'],
        ['Advanced access', '<code>api</code>'],
      ],
    )}<h2 id="troubleshooting">Troubleshooting</h2><p>Run <code>vibrail --version</code>, <code>vibrail context list</code>, <code>vibrail status</code>, and <code>vibrail doctor</code> in order. Use <code>vibrail &lt;command&gt; --help</code> for the authoritative options shipped by your installed version.</p>`,
  },
  '/docs/concepts': {
    nav: 'docs',
    eyebrow: 'Get started',
    title: 'Core concepts',
    lead: 'How projects, services, deployments, runtime targets, and domains fit together.',
    body: `<h2 id="project">Project</h2><p>The main Vibrail unit containing source, environment, runtime configuration, domains, and deployment history.</p><h2 id="service">Service</h2><p>A project may contain one service or several coordinated Docker Compose services.</p><h2 id="deployment">Deployment</h2><p>Each build and release creates a record with source version, logs, status, and rollback information.</p><h2 id="target">Runtime target</h2>${table(
      ['Target', 'Best for', 'Managed through'],
      [
        ['Vibrail Cloud', 'No-infrastructure operations', 'Managed Vibrail runtime'],
        ['Your server', 'VPS, dedicated, private, or homelab hosts', 'SSH connection'],
        ['Local machine', 'Local and desktop workflows', 'Local Vibrail instance'],
      ],
    )}<h2 id="domain">Domain</h2><p>A domain routes traffic to a public service. Vibrail supports platform hostnames and custom domains with HTTPS.</p>`,
  },
  '/docs/deploy/github': {
    nav: 'deploy',
    eyebrow: 'Deploy',
    title: 'Deploy from GitHub',
    lead: 'Connect a repository, select a branch, and automatically deploy new pushes.',
    body: `<ol class="steps"><li><strong>Connect GitHub</strong>Install the Vibrail GitHub App for the repository owner.</li><li><strong>Select repository and branch</strong>Optionally choose a monorepo subdirectory.</li><li><strong>Review the build plan</strong>Confirm install, build, start, and port settings.</li><li><strong>Choose a target and deploy</strong>Run on Vibrail Cloud or your server.</li></ol><h2 id="auto">Automatic deployments</h2><p>Pushes to the target branch can create a deployment automatically without a manually managed webhook.</p><h2 id="private">Private repositories</h2><p>Prefer short-lived GitHub App tokens. Read-only project tokens and server SSH credentials are also supported.</p><div class="callout"><strong>Least privilege</strong><p>Grant only the repositories Vibrail needs to deploy.</p></div>`,
  },
  '/docs/deploy/folder': {
    nav: 'deploy',
    eyebrow: 'Deploy',
    title: 'Deploy a local folder',
    lead: 'Upload local source directly into the Vibrail build pipeline without creating a Git repository.',
    body: `<h2 id="dashboard">From the console</h2><ol class="steps"><li><strong>Create a folder project</strong>Select Local folder as the source.</li><li><strong>Choose the source</strong>Vibrail packages the folder and scans the stack.</li><li><strong>Review settings</strong>Confirm commands, port, and runtime target.</li><li><strong>Deploy</strong>Upload, build, and follow the logs.</li></ol><h2 id="cli">From the CLI</h2><p>Run <code>deploy</code> outside a Git repository and the CLI automatically packages and uploads the current folder.</p>${code('Terminal', `vibrail login
cd my-folder
vibrail deploy --name my-app --watch`)}<p>See the <a href="#/docs/cli">CLI guide</a> for more options.</p>`,
  },
  '/docs/deploy/server': {
    nav: 'deploy',
    eyebrow: 'Deploy',
    title: 'Connect your server',
    lead: 'Add a Linux server over SSH while keeping control of infrastructure and data.',
    body: `<h2 id="requirements">Requirements</h2><ul class="feature-list"><li>A Linux host reachable over SSH.</li><li>Permission to install or operate Docker.</li><li>Reachable HTTP/HTTPS ports for public services.</li><li>DNS pointing at the server for custom domains.</li></ul><h2 id="connect">Connection steps</h2><ol class="steps"><li><strong>Add the server</strong>Enter the host, SSH port, and user.</li><li><strong>Add credentials</strong>Use a dedicated SSH key.</li><li><strong>Run checks</strong>Vibrail checks Docker, disk, ports, and proxy settings.</li><li><strong>Select it on a project</strong>The server becomes a deployment target.</li></ol><h2 id="proxy">Reverse proxy behavior</h2><p>Vibrail can reuse an explicitly configured compatible Traefik instance or create its managed edge. It does not silently take over an ambiguous proxy.</p><div class="callout warning"><strong>Protect the Docker socket</strong><p>Docker control is equivalent to high privilege on the host.</p></div>`,
  },
  '/docs/projects': {
    nav: 'docs',
    eyebrow: 'Projects & operations',
    title: 'Project configuration',
    lead: 'Manage environment variables, commands, ports, and multi-service applications.',
    body: `<h2 id="environment">Environment variables</h2><p>Add ordinary and secret values in project settings. Redeploy or refresh the runtime after changes.</p><h2 id="commands">Build and start settings</h2>${table(
      ['Setting', 'Purpose', 'Example'],
      [
        ['Install', 'Install dependencies', '<code>npm ci</code>'],
        ['Build', 'Create a production build', '<code>npm run build</code>'],
        ['Start', 'Start the service', '<code>npm run start</code>'],
        ['Port', 'Listening port', '<code>3000</code>'],
      ],
    )}<h2 id="network">Listening address</h2><p>Listen on <code>0.0.0.0</code> and prefer the injected <code>PORT</code> value.</p><h2 id="compose">Docker Compose</h2><p>Compose services deploy together on a private network. Add public routes only where needed.</p>`,
  },
  '/docs/domains': {
    nav: 'docs',
    eyebrow: 'Projects & operations',
    title: 'Domains and HTTPS',
    lead: 'Attach a platform hostname or custom domain and let Vibrail configure routing and TLS.',
    body: `<ol class="steps"><li><strong>Select a deployed project</strong>The project needs a successful deployment.</li><li><strong>Add a domain</strong>Choose the public service.</li><li><strong>Configure DNS</strong>Create the displayed A, AAAA, or CNAME record.</li><li><strong>Verify and enable</strong>Vibrail updates the route and requests a certificate.</li></ol><h2 id="dns">DNS propagation</h2><p>Changes may take minutes or hours. Check the record value, proxy mode, TTL, and server IP.</p><h2 id="https">HTTPS</h2><p>Certificate issuance requires correct DNS and reachable ports 80/443.</p>`,
  },
  '/docs/logs': {
    nav: 'docs',
    eyebrow: 'Projects & operations',
    title: 'Logs and troubleshooting',
    lead: 'Use build logs, runtime logs, request logs, and service state to locate failures.',
    body: `<h2 id="build">Build failures</h2><ul class="feature-list"><li>Check dependency and lockfile consistency.</li><li>Confirm the monorepo root and build directory.</li><li>Add environment variables needed during build.</li><li>Confirm toolchain versions.</li></ul><h2 id="runtime">Deployed but unreachable</h2><ul class="feature-list"><li>Make sure the process stays running.</li><li>Listen on <code>0.0.0.0</code> and the configured port.</li><li>Verify health checks.</li><li>Check DNS, firewall, and proxy routes.</li></ul><div class="callout"><strong>Sharing logs safely</strong><p>Include the deployment ID and relevant excerpt, but remove tokens and secrets.</p></div>`,
  },
  '/docs/api': {
    nav: 'api',
    eyebrow: 'Developers',
    title: 'REST API',
    lead: 'The Vibrail console uses the same HTTP API; integrations authenticate with personal access tokens.',
    body: `<h2 id="base-url">Base URL</h2><p>The hosted API starts at <code>${API_URL}</code>. A self-hosted instance uses its own origin plus <code>/api</code>.</p><h2 id="auth">Authentication</h2><p>Create a token in Settings → Tokens and send it as a bearer credential.</p>${code('HTTP', 'Authorization: Bearer YOUR_TOKEN')}<h2 id="example">Example</h2>${code(
      'Terminal',
      `curl ${API_URL}/projects \\
  -H "Authorization: Bearer $VIBRAIL_TOKEN" \\
  -H "X-Organization-Id: $VIBRAIL_ORG_ID"`,
    )}<h2 id="resources">Complete route groups</h2><p>This list is generated from the route groups currently mounted by the API service. Each group usually contains multiple GET, POST, PATCH, PUT, DELETE, SSE, or WebSocket endpoints.</p>${table(
      ['No.', 'Path', 'Purpose', 'Availability'],
      numberedRows(apiGroupsEn),
      'api-routes-table',
    )}<div class="callout"><strong>Deployment mode changes availability</strong><p>Hosted, self-hosted, and user-server-enabled instances mount different system, migration, terminal, mail, cloud, and billing implementations. Check the instance mode before relying on a route.</p></div><h2 id="errors">Errors and rate limits</h2><p>Handle <code>401</code>, <code>403</code>, <code>404</code>, <code>429</code>, and temporary <code>5xx</code> responses.</p>`,
  },
  '/docs/mcp': {
    nav: 'mcp',
    eyebrow: 'Developers',
    title: 'MCP',
    lead: 'Connect Codex, Claude, Cursor, ChatGPT, and other AI clients to Vibrail with scoped permissions.',
    body: `<h2 id="endpoint">Endpoint</h2><p>Vibrail exposes an OAuth 2.1 compatible Streamable HTTP MCP endpoint:</p>${code('URL', MCP_URL)}<h2 id="codex">Connect Codex</h2>${code('Terminal', `codex mcp add vibrail --url ${MCP_URL}\ncodex mcp login vibrail`)}<h2 id="oauth">OAuth authorization</h2><ol class="steps"><li><strong>Add the server</strong>The client connects to the MCP URL.</li><li><strong>Approve in the browser</strong>Choose permissions and resources.</li><li><strong>Use the tools</strong>The client only sees tools in scope and can be revoked under Settings → MCP.</li></ol><h2 id="token">Static token</h2><p>Clients without OAuth support can use a personal access token.</p>${code(
      'JSON',
      `{
  "mcpServers": {
    "vibrail": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`,
    )}<h2 id="tools">All MCP tools</h2><p>The current codebase exposes <strong>149 tools</strong> through an explicit MCP allowlist. The actual <code>tools/list</code> response is filtered by role, organization permissions, resource grants, and whether the token is read-only.</p>${table(
      ['No.', 'Category', 'Tool', 'Purpose'],
      numberedRows(mcpToolRows('en')),
      'mcp-tools-table',
    )}<div class="callout warning"><strong>Use least privilege</strong><p>Read-only tokens only see readable tools, and restricted members only see tools allowed by their resource grants. Destructive tools may delete resources or cause effects that are difficult to reverse; confirm the target before calling them.</p></div>`,
  },
  '/docs/faq': {
    nav: 'faq',
    eyebrow: 'Support',
    title: 'Frequently asked questions',
    lead: 'Common questions about source code, servers, ports, domains, API, and MCP.',
    body: `<h2 id="stacks">What can Vibrail deploy?</h2><p>Detected stacks, Dockerfiles, Docker Compose, and projects with custom commands, including common Node.js, Python, Go, Rust, PHP, Java, Kotlin, .NET, Ruby, and Elixir applications.</p><h2 id="github">Does my code need to be on GitHub?</h2><p>No. Deploy from GitHub or upload a local folder.</p><h2 id="dockerfile">Do I need a Dockerfile and Docker Compose?</h2><p><strong>We strongly recommend using a Dockerfile, and Docker Compose for applications with multiple services.</strong> This makes the runtime, dependencies, build process, start command, ports, health checks, and service relationships explicit and reproducible across local development, Vibrail Cloud, and your own servers.</p><div class="callout"><strong>Recommended production setup</strong><p>Use a Dockerfile for a single-service project. Use Docker Compose for Web, worker, database, cache, and other multi-service applications, with a Dockerfile for each custom image.</p></div><h2 id="port">Why is a successful deployment unreachable?</h2><p>Confirm the service listens on <code>0.0.0.0</code> and the correct port, stays running, and has valid DNS, firewall, and proxy routing.</p><h2 id="server">Can I deploy to my own server?</h2><p>Yes. Connect a Linux host over SSH and select it as the runtime target.</p><h2 id="api-token">Do API and MCP share credentials?</h2><p>Static MCP authentication can use a personal access token. OAuth-capable clients should use browser approval.</p>`,
  },
}
const pagesByLocale = { zh: pagesZh, en: pagesEn }

const sidebar = document.querySelector('#sidebar-nav')
const article = document.querySelector('#article')
const toc = document.querySelector('#toc-nav')
const modal = document.querySelector('#search-modal')
const input = document.querySelector('#search-input')
const results = document.querySelector('#search-results')
let activeSearchIndex = 0
let visibleSearchPages = []

function currentPath() {
  return location.hash.slice(1).split('?')[0].split('::')[0] || '/docs'
}

function renderChrome() {
  const labels = ui[currentLocale]
  document.documentElement.lang = currentLocale === 'zh' ? 'zh-CN' : 'en'
  document.querySelector('meta[name="description"]').content = currentLocale === 'zh' ? 'Vibrail 文档 — 部署应用、管理服务器，并通过 API 与 MCP 自动化工作流。' : 'Vibrail documentation for deployments, servers, API, and MCP automation.'
  document.querySelectorAll('.topnav a').forEach((link, index) => {
    link.textContent = labels.nav[index]
  })
  document.querySelector('#search-trigger b').textContent = labels.search
  document.querySelector('#search-trigger').ariaLabel = labels.searchLabel
  document.querySelector('#language-toggle').textContent = labels.language
  document.querySelector('#language-toggle').ariaLabel = labels.switchLanguage
  document.querySelector('#theme-toggle').ariaLabel = labels.theme
  document.querySelector('.console-button').firstChild.textContent = `${labels.console} `
  document.querySelector('#menu-button').ariaLabel = labels.menu
  document.querySelector('#toc-title').textContent = labels.toc
  input.placeholder = labels.searchPlaceholder
  document.querySelector('#search-select').textContent = labels.select
  document.querySelector('#search-open').textContent = labels.open
}

function renderSidebar(path) {
  sidebar.innerHTML = sectionsByLocale[currentLocale].map((section) => `<section class="sidebar-group"><h3>${section.title}</h3>${section.links.map(([label, link]) => `<a href="#${link}" class="${path === link ? 'active' : ''}">${label}</a>`).join('')}</section>`).join('')
}

function renderPage() {
  renderChrome()
  const path = currentPath()
  const pages = pagesByLocale[currentLocale]
  const page = pages[path] || pages['/docs']
  renderSidebar(pages[path] ? path : '/docs')
  document.querySelectorAll('.topnav a').forEach((link) => link.classList.toggle('active', link.dataset.nav === page.nav))
  document.title = `${page.title} · Vibrail Docs`
  article.innerHTML = `<div class="eyebrow">${page.eyebrow}</div><h1>${page.title}</h1><p class="lead">${page.lead}</p>${page.body}<p class="support">${ui[currentLocale].support} <a href="${DASHBOARD_URL}" target="_blank" rel="noreferrer">${ui[currentLocale].supportLink}</a> ${ui[currentLocale].supportEnd}</p>`
  const headings = [...article.querySelectorAll('h2[id], h3[id]')]
  toc.innerHTML = headings.map((heading) => `<a href="#${path}::${heading.id}">${heading.textContent}</a>`).join('')
  const anchor = location.hash.split('::')[1]
  if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView())
  else scrollTo({ top: 0 })
  document.querySelector('#sidebar').classList.remove('open')
}

function pageSearchText(page) {
  const holder = document.createElement('div')
  holder.innerHTML = page.body
  return `${page.title} ${page.lead} ${holder.textContent}`.toLowerCase()
}

function renderSearch() {
  const query = input.value.trim().toLowerCase()
  visibleSearchPages = Object.entries(pagesByLocale[currentLocale])
    .filter(([, page]) => !query || pageSearchText(page).includes(query))
    .slice(0, 12)
  activeSearchIndex = Math.min(activeSearchIndex, Math.max(visibleSearchPages.length - 1, 0))
  results.innerHTML = visibleSearchPages.length ? visibleSearchPages.map(([path, page], index) => `<a class="search-result${index === activeSearchIndex ? ' active' : ''}" href="#${path}"><strong>${page.title}</strong><span>${page.lead}</span></a>`).join('') : `<div class="search-empty">${ui[currentLocale].noResults}</div>`
}

function openSearch() {
  modal.classList.add('open')
  modal.setAttribute('aria-hidden', 'false')
  input.value = ''
  activeSearchIndex = 0
  renderSearch()
  requestAnimationFrame(() => input.focus())
}
function closeSearch() {
  modal.classList.remove('open')
  modal.setAttribute('aria-hidden', 'true')
}

document.querySelector('#search-trigger').addEventListener('click', openSearch)
document.querySelector('.search-backdrop').addEventListener('click', closeSearch)
input.addEventListener('input', () => {
  activeSearchIndex = 0
  renderSearch()
})
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
    return
  }
  if (!modal.classList.contains('open')) return
  if (event.key === 'Escape') closeSearch()
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeSearchIndex = Math.min(activeSearchIndex + 1, visibleSearchPages.length - 1)
    renderSearch()
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeSearchIndex = Math.max(activeSearchIndex - 1, 0)
    renderSearch()
  }
  if (event.key === 'Enter' && visibleSearchPages[activeSearchIndex]) {
    location.hash = visibleSearchPages[activeSearchIndex][0]
    closeSearch()
  }
})
results.addEventListener('click', closeSearch)

document.querySelector('#language-toggle').addEventListener('click', () => {
  currentLocale = currentLocale === 'zh' ? 'en' : 'zh'
  localStorage.vibrailDocsLanguage = currentLocale
  renderPage()
})

const savedTheme = localStorage.vibrailDocsTheme
if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark')
document.querySelector('#theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark')
  localStorage.vibrailDocsTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
})

document.querySelector('#menu-button').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'))
article.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-code')
  if (!button) return
  await navigator.clipboard.writeText(decodeURIComponent(button.dataset.copy))
  button.textContent = ui[currentLocale].copied
  setTimeout(() => {
    button.textContent = ui[currentLocale].copy
  }, 1200)
})

addEventListener('hashchange', renderPage)
if (!location.hash) location.hash = '/docs'
renderPage()
