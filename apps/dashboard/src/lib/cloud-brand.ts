import type { Locale } from "@/i18n";

export interface CloudBrandCopy {
  displayName: string;
  connectTitle: string;
  connectionRequired: string;
  connectCta: string;
  waiting: string;
  maybeLater: string;
  waitlistTitle: string;
  waitlistDescription: string;
  waitlistDone: string;
  waitlistLabel: string;
  waitlistNotify: string;
  waitlistGenericError: string;
  waitlistNetworkError: string;
  done: string;
  close: string;
}

const copies: Record<Locale, CloudBrandCopy> = {
  en: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud is coming soon",
    connectionRequired: "This feature requires Vibrail Cloud, which is not available yet.",
    connectCta: "Join the Vibrail Cloud waitlist",
    waiting: "Submitting…",
    maybeLater: "Maybe later",
    waitlistTitle: "Vibrail Cloud is coming soon",
    waitlistDescription: "We're building fast, scalable managed infrastructure with one-click deploys and nothing for you to operate.",
    waitlistDone: "Thank you — we'll email you when Vibrail Cloud launches.",
    waitlistLabel: "Get notified when it launches",
    waitlistNotify: "Notify me",
    waitlistGenericError: "Something went wrong. Try again.",
    waitlistNetworkError: "Couldn't reach the waitlist. Try again.",
    done: "Done",
    close: "Close",
  },
  zh: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud 即将推出",
    connectionRequired: "此功能需要尚未推出的 Vibrail Cloud。",
    connectCta: "加入 Vibrail Cloud 等候名单",
    waiting: "正在提交……",
    maybeLater: "稍后再说",
    waitlistTitle: "Vibrail Cloud 即将推出",
    waitlistDescription: "我们正在打造快速、可扩展的托管基础设施，支持一键部署，无需自行运维。",
    waitlistDone: "感谢关注——Vibrail Cloud 推出时我们会通过邮件通知你。",
    waitlistLabel: "推出时通知我",
    waitlistNotify: "通知我",
    waitlistGenericError: "出现错误，请重试。",
    waitlistNetworkError: "无法连接等候名单服务，请重试。",
    done: "完成",
    close: "关闭",
  },
  ja: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud は近日公開予定です",
    connectionRequired: "この機能には、まだ提供開始されていない Vibrail Cloud が必要です。",
    connectCta: "Vibrail Cloud の順番待ちリストに登録",
    waiting: "送信中…",
    maybeLater: "後で",
    waitlistTitle: "Vibrail Cloud は近日公開予定です",
    waitlistDescription: "ワンクリックでデプロイでき、運用不要の高速でスケーラブルなマネージド基盤を構築しています。",
    waitlistDone: "ありがとうございます。Vibrail Cloud の提供開始時にメールでお知らせします。",
    waitlistLabel: "公開時に通知を受け取る",
    waitlistNotify: "通知を受け取る",
    waitlistGenericError: "エラーが発生しました。もう一度お試しください。",
    waitlistNetworkError: "順番待ちリストに接続できませんでした。もう一度お試しください。",
    done: "完了",
    close: "閉じる",
  },
  de: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud ist bald verfügbar",
    connectionRequired: "Diese Funktion benötigt Vibrail Cloud, das noch nicht verfügbar ist.",
    connectCta: "Zur Vibrail-Cloud-Warteliste",
    waiting: "Wird gesendet…",
    maybeLater: "Vielleicht später",
    waitlistTitle: "Vibrail Cloud ist bald verfügbar",
    waitlistDescription: "Wir entwickeln eine schnelle, skalierbare Managed-Infrastruktur mit Ein-Klick-Deployments ohne eigenen Betriebsaufwand.",
    waitlistDone: "Danke — wir informieren dich per E-Mail, sobald Vibrail Cloud startet.",
    waitlistLabel: "Zum Start benachrichtigen",
    waitlistNotify: "Benachrichtigen",
    waitlistGenericError: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
    waitlistNetworkError: "Die Warteliste ist nicht erreichbar. Bitte erneut versuchen.",
    done: "Fertig",
    close: "Schließen",
  },
  es: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud estará disponible próximamente",
    connectionRequired: "Esta función requiere Vibrail Cloud, que todavía no está disponible.",
    connectCta: "Unirse a la lista de espera",
    waiting: "Enviando…",
    maybeLater: "Quizá más tarde",
    waitlistTitle: "Vibrail Cloud estará disponible próximamente",
    waitlistDescription: "Estamos creando una infraestructura gestionada rápida y escalable con despliegues en un clic y sin tareas de operación.",
    waitlistDone: "Gracias; te enviaremos un correo cuando se lance Vibrail Cloud.",
    waitlistLabel: "Avísame cuando se lance",
    waitlistNotify: "Avisarme",
    waitlistGenericError: "Algo salió mal. Inténtalo de nuevo.",
    waitlistNetworkError: "No se pudo acceder a la lista de espera. Inténtalo de nuevo.",
    done: "Listo",
    close: "Cerrar",
  },
  fr: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud arrive bientôt",
    connectionRequired: "Cette fonctionnalité nécessite Vibrail Cloud, qui n'est pas encore disponible.",
    connectCta: "Rejoindre la liste d'attente",
    waiting: "Envoi…",
    maybeLater: "Plus tard",
    waitlistTitle: "Vibrail Cloud arrive bientôt",
    waitlistDescription: "Nous développons une infrastructure managée rapide et évolutive, avec des déploiements en un clic et aucune exploitation à gérer.",
    waitlistDone: "Merci — nous vous enverrons un e-mail au lancement de Vibrail Cloud.",
    waitlistLabel: "Me prévenir au lancement",
    waitlistNotify: "Me prévenir",
    waitlistGenericError: "Une erreur s'est produite. Réessayez.",
    waitlistNetworkError: "Impossible de joindre la liste d'attente. Réessayez.",
    done: "Terminé",
    close: "Fermer",
  },
  pt: {
    displayName: "Vibrail Cloud",
    connectTitle: "O Vibrail Cloud estará disponível em breve",
    connectionRequired: "Este recurso requer o Vibrail Cloud, que ainda não está disponível.",
    connectCta: "Entrar na lista de espera",
    waiting: "Enviando…",
    maybeLater: "Talvez depois",
    waitlistTitle: "O Vibrail Cloud estará disponível em breve",
    waitlistDescription: "Estamos criando uma infraestrutura gerenciada rápida e escalável, com implantação em um clique e sem nada para você operar.",
    waitlistDone: "Obrigado — enviaremos um e-mail quando o Vibrail Cloud for lançado.",
    waitlistLabel: "Avise-me no lançamento",
    waitlistNotify: "Avisar-me",
    waitlistGenericError: "Algo deu errado. Tente novamente.",
    waitlistNetworkError: "Não foi possível acessar a lista de espera. Tente novamente.",
    done: "Concluído",
    close: "Fechar",
  },
  tr: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud yakında kullanıma açılacak",
    connectionRequired: "Bu özellik henüz kullanıma açılmamış Vibrail Cloud'u gerektirir.",
    connectCta: "Bekleme listesine katıl",
    waiting: "Gönderiliyor…",
    maybeLater: "Belki sonra",
    waitlistTitle: "Vibrail Cloud yakında kullanıma açılacak",
    waitlistDescription: "Tek tıkla dağıtım sunan, hızlı ve ölçeklenebilir yönetilen bir altyapı geliştiriyoruz.",
    waitlistDone: "Teşekkürler — Vibrail Cloud kullanıma açıldığında size e-posta göndereceğiz.",
    waitlistLabel: "Kullanıma açıldığında bildir",
    waitlistNotify: "Bana bildir",
    waitlistGenericError: "Bir sorun oluştu. Tekrar deneyin.",
    waitlistNetworkError: "Bekleme listesine ulaşılamadı. Tekrar deneyin.",
    done: "Bitti",
    close: "Kapat",
  },
  ar: {
    displayName: "Vibrail Cloud",
    connectTitle: "Vibrail Cloud قادم قريبًا",
    connectionRequired: "تتطلب هذه الميزة Vibrail Cloud، وهو غير متاح بعد.",
    connectCta: "الانضمام إلى قائمة الانتظار",
    waiting: "جارٍ الإرسال…",
    maybeLater: "ربما لاحقًا",
    waitlistTitle: "Vibrail Cloud قادم قريبًا",
    waitlistDescription: "نعمل على بنية تحتية مُدارة سريعة وقابلة للتوسع، مع نشر بنقرة واحدة ودون أعباء تشغيلية عليك.",
    waitlistDone: "شكرًا لك — سنرسل إليك بريدًا عند إطلاق Vibrail Cloud.",
    waitlistLabel: "أبلغني عند الإطلاق",
    waitlistNotify: "أبلغني",
    waitlistGenericError: "حدث خطأ. حاول مرة أخرى.",
    waitlistNetworkError: "تعذّر الوصول إلى قائمة الانتظار. حاول مرة أخرى.",
    done: "تم",
    close: "إغلاق",
  },
};

export function cloudBrandCopy(locale: Locale): CloudBrandCopy {
  return copies[locale] ?? copies.en;
}
