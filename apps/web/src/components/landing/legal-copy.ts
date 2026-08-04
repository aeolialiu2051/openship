export type LegalDocument = "privacy" | "terms";

export const legalCopy = {
  en: {
    common: {
      legal: "Legal",
      lastUpdated: "Last updated August 4, 2026",
      contents: "Contents",
      contact: "Questions about this document? Contact us at",
    },
    privacy: {
      title: "Privacy Policy",
      description:
        "This policy explains what information Vibrail collects and how we use, protect, retain, and share it when providing our deployment platform.",
      sections: [
        ["Information we collect", "We may collect account details such as your name and email address; authentication and session data; IP address and device information; project, repository, server, domain, deployment, billing, support, audit, and usage metadata; and any information you choose to provide to us."],
        ["How we use information", "We use information to provide and secure the service, authenticate users, process deployments, operate connected infrastructure, deliver notifications, provide support, administer billing, prevent abuse, troubleshoot issues, analyze performance, and improve Vibrail."],
        ["Cookies and local storage", "We use cookies and similar browser storage for sessions, security, language, theme, and interface preferences. Disabling required cookies may prevent authentication or other parts of the service from working correctly."],
        ["Connected services", "When you connect source control providers, servers, infrastructure providers, payment processors, email services, or other integrations, we exchange only the information needed to provide the requested feature. Those providers process information under their own terms and privacy policies."],
        ["Data security", "We use reasonable technical and organizational safeguards, including encrypted transport, access controls, credential protection, isolation, rate limiting, and audit logging. No system is completely secure, so you remain responsible for protecting your credentials and connected infrastructure."],
        ["Retention and deletion", "We retain information for as long as needed to operate the service, meet legal and security obligations, resolve disputes, and enforce agreements. Deleted data may remain temporarily in backups, logs, or systems with scheduled cleanup before being removed or anonymized."],
        ["Your choices and rights", "You may review or update account information and delete projects through the product where those controls are available. You may also contact us to request access, correction, export, or deletion of personal information, subject to applicable law and legitimate retention requirements."],
        ["Policy updates", "We may update this policy as Vibrail, our providers, or legal requirements change. We will publish the revised policy with a new effective date and provide additional notice when required."],
      ],
    },
    terms: {
      title: "Terms of Service",
      description:
        "These terms govern your access to and use of Vibrail. By creating an account or using the service, you agree to these terms.",
      sections: [
        ["The service", "Vibrail provides software deployment, hosting, infrastructure connection, automation, observability, and related management tools. Features may change over time, and some capabilities may be offered as previews or depend on third-party services."],
        ["Accounts and credentials", "You must provide accurate account information and keep passwords, tokens, SSH credentials, API keys, and other access methods secure. You are responsible for activity performed through your account and for promptly reporting suspected unauthorized access."],
        ["Your content and infrastructure", "You retain responsibility for the code, data, domains, servers, credentials, and other materials you submit or connect. You confirm that you have the rights and permissions needed for Vibrail to process them and perform the deployment actions you request."],
        ["Acceptable use", "You may not use Vibrail for unlawful, infringing, deceptive, abusive, malicious, or harmful activity. This includes distributing malware, phishing, attacking systems, evading limits, interfering with the service, mining without authorization, or deploying content that violates third-party rights."],
        ["Plans, fees, and limits", "Paid features, prices, usage limits, renewal terms, and refund rules are described at purchase or in your order. You are responsible for applicable taxes and for third-party infrastructure, bandwidth, domain, or provider charges associated with your use."],
        ["Availability and changes", "We work to keep Vibrail reliable, but the service is provided on an as-available basis and may occasionally be interrupted. We may change, suspend, or discontinue features and may restrict access when necessary for security, legal compliance, maintenance, or enforcement of these terms."],
        ["Disclaimers and liability", "To the extent permitted by law, Vibrail is provided without warranties of uninterrupted operation, error-free results, or fitness for a particular purpose. We are not responsible for losses caused by your code, configuration, connected infrastructure, third-party services, credential compromise, or events beyond our reasonable control."],
        ["Termination and updates", "You may stop using the service at any time. We may suspend or terminate access for material violations, security risk, non-payment, or legal requirements. We may update these terms and will publish the revised version with a new effective date; continued use after the effective date means you accept the updated terms."],
      ],
    },
  },
  zh: {
    common: {
      legal: "法律信息",
      lastUpdated: "更新于 2026 年 8 月 4 日",
      contents: "目录",
      contact: "如对本文档有疑问，请联系",
    },
    privacy: {
      title: "隐私政策",
      description: "本政策说明 Vibrail 在提供部署平台服务时会收集哪些信息，以及我们如何使用、保护、保留和共享这些信息。",
      sections: [
        ["我们收集的信息", "我们可能收集姓名、邮箱等账号信息；身份验证和会话数据；IP 地址和设备信息；项目、代码仓库、服务器、域名、部署、账单、客服、审计及使用元数据；以及你主动向我们提供的信息。"],
        ["信息使用方式", "我们会使用这些信息来提供和保护服务、验证用户身份、执行部署、操作已连接的基础设施、发送通知、提供客服、处理计费、防止滥用、排查故障、分析性能并改进 Vibrail。"],
        ["Cookie 与本地存储", "我们使用 Cookie 和类似的浏览器存储来保存会话、安全状态、语言、主题和界面偏好。禁用必要的 Cookie 可能导致身份验证或部分服务无法正常工作。"],
        ["已连接的第三方服务", "当你连接代码托管平台、服务器、基础设施供应商、支付处理商、邮件服务或其他集成时，我们只交换实现所请求功能所必需的信息。相关供应商会依据其自身条款和隐私政策处理信息。"],
        ["数据安全", "我们采用合理的技术和组织措施保护数据，包括加密传输、访问控制、凭据保护、隔离、频率限制和审计日志。任何系统都无法保证绝对安全，你仍需负责保护自己的凭据和已连接基础设施。"],
        ["数据保留与删除", "我们会在运营服务、履行法律与安全义务、解决争议和执行协议所需的期限内保留信息。已删除的数据可能在备份、日志或定期清理的系统中短期留存，之后会被删除或匿名化。"],
        ["你的选择与权利", "在产品提供相应功能时，你可以查看或更新账号信息并删除项目。你也可以联系我们，申请访问、更正、导出或删除个人信息，但需遵守适用法律和正当的数据保留要求。"],
        ["政策更新", "随着 Vibrail、我们的供应商或法律要求发生变化，我们可能更新本政策。修订后的政策会标注新的生效日期，并在法律要求时提供额外通知。"],
      ],
    },
    terms: {
      title: "服务条款",
      description: "本条款适用于你对 Vibrail 的访问和使用。创建账号或使用服务，即表示你同意受本条款约束。",
      sections: [
        ["服务内容", "Vibrail 提供软件部署、托管、基础设施连接、自动化、可观测性及相关管理工具。功能可能随时间调整，部分能力可能以预览形式提供或依赖第三方服务。"],
        ["账号与凭据", "你需要提供准确的账号信息，并妥善保管密码、Token、SSH 凭据、API 密钥及其他访问方式。你应对通过账号进行的活动负责，并及时报告疑似未经授权的访问。"],
        ["你的内容与基础设施", "你应对提交或连接的代码、数据、域名、服务器、凭据及其他材料负责，并确认已取得 Vibrail 处理这些材料和执行你所请求部署操作所需的权利与许可。"],
        ["可接受使用", "你不得将 Vibrail 用于违法、侵权、欺骗、滥用、恶意或有害活动，包括传播恶意软件、网络钓鱼、攻击系统、绕过限制、干扰服务、未经授权的挖矿，或部署侵犯第三方权利的内容。"],
        ["套餐、费用与限制", "付费功能、价格、使用限制、续费条款和退款规则以购买页面或订单为准。你需承担适用税费，以及使用过程中产生的第三方基础设施、带宽、域名或供应商费用。"],
        ["可用性与变更", "我们会努力保持 Vibrail 稳定可靠，但服务按可用状态提供，可能偶尔中断。出于安全、合规、维护或执行本条款的需要，我们可能变更、暂停或停止部分功能，并可能限制访问。"],
        ["免责声明与责任限制", "在法律允许的范围内，Vibrail 不保证服务永不中断、结果完全无误或适合特定用途。对于因你的代码、配置、已连接基础设施、第三方服务、凭据泄露或超出我们合理控制范围的事件造成的损失，我们不承担责任。"],
        ["终止与条款更新", "你可以随时停止使用服务。对于重大违规、安全风险、未付款或法律要求，我们可能暂停或终止访问。我们可能更新本条款，并会公布带有新生效日期的修订版本；在生效日期后继续使用服务，即表示你接受更新后的条款。"],
      ],
    },
  },
} as const;
