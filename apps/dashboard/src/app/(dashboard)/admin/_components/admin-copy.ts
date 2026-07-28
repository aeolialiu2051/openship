import type { Locale } from "@/i18n";

export function adminCopy(locale: Locale) {
  const zh = locale === "zh";
  return {
    section: zh ? "系统管理" : "Administration",
    description: zh
      ? "查看实例级用户、产品使用情况和全局审计记录。"
      : "Inspect instance users, product usage, and global audit activity.",
    overview: zh ? "总览" : "Overview",
    users: zh ? "用户" : "Users",
    accessLogs: zh ? "访问日志" : "Access logs",
    activityLogs: zh ? "活动日志" : "Activity logs",
    search: zh ? "搜索用户、路径、IP…" : "Search users, paths, IPs…",
    all: zh ? "全部" : "All",
    admin: zh ? "管理员" : "Admin",
    user: zh ? "普通用户" : "User",
    verified: zh ? "已验证" : "Verified",
    unverified: zh ? "未验证" : "Unverified",
    loadFailed: zh ? "管理数据加载失败" : "Failed to load administration data",
    refresh: zh ? "刷新" : "Refresh",
    noData: zh ? "暂无数据" : "No data yet",
    previous: zh ? "上一页" : "Previous",
    next: zh ? "下一页" : "Next",
  };
}
