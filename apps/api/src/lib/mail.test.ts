import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  instanceSettingsGet: vi.fn(),
  instanceSend: vi.fn(),
  envSend: vi.fn(),
  cloudSendInvitation: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("../config/env", () => ({
  get env() {
    return h.env;
  },
}));

vi.mock("@repo/db", () => ({
  repos: {
    instanceSettings: { get: h.instanceSettingsGet },
  },
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: h.createTransport },
}));

vi.mock("./encryption", () => ({ decrypt: () => "decrypted-instance-password" }));

vi.mock("./cloud/client", () => ({
  cloudClient: () => ({ sendInvitation: h.cloudSendInvitation }),
}));

async function loadMail() {
  vi.resetModules();
  return import("./mail");
}

beforeEach(() => {
  h.env = {
    CLOUD_MODE: false,
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    SMTP_FROM: "Vibrail <support@example.com>",
  };
  h.instanceSettingsGet.mockReset();
  h.instanceSend.mockReset();
  h.envSend.mockReset();
  h.cloudSendInvitation.mockReset();
  h.createTransport.mockReset();
  h.createTransport.mockImplementation((config: { host?: string }) => ({
    sendMail: config.host === "instance.smtp.example" ? h.instanceSend : h.envSend,
  }));
});

describe("system mail trust boundary", () => {
  it("uses only operator environment SMTP in Cloud mode", async () => {
    h.env = {
      ...h.env,
      CLOUD_MODE: true,
      SMTP_HOST: "platform.smtp.example",
      SMTP_PORT: 465,
      SMTP_USER: "platform-user",
      SMTP_PASS: "platform-pass",
    };
    h.envSend.mockResolvedValue({ messageId: "cloud-message" });

    const { sendMail } = await loadMail();
    await sendMail({
      to: "new-user@example.com",
      subject: "Verification code",
      html: "<p>123456</p>",
    });

    expect(h.instanceSettingsGet).not.toHaveBeenCalled();
    expect(h.createTransport).toHaveBeenCalledTimes(1);
    expect(h.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "platform.smtp.example" }),
    );
    expect(h.envSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Vibrail <support@example.com>",
        to: "new-user@example.com",
      }),
    );
  });

  it("fails loudly when Cloud platform SMTP is missing", async () => {
    h.env = { ...h.env, CLOUD_MODE: true };

    const { sendMail, canSendMail } = await loadMail();

    await expect(
      sendMail({ to: "new-user@example.com", subject: "Code", html: "123456" }),
    ).rejects.toThrow("Cloud platform SMTP is not configured");
    await expect(canSendMail()).resolves.toBe(false);
    expect(h.instanceSettingsGet).not.toHaveBeenCalled();
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it("keeps self-hosted system SMTP separate and falls back only to env SMTP", async () => {
    h.env = {
      ...h.env,
      SMTP_HOST: "fallback.smtp.example",
      SMTP_PORT: 587,
      SMTP_USER: "fallback-user",
      SMTP_PASS: "fallback-pass",
    };
    h.instanceSettingsGet.mockResolvedValue({
      smtpHost: "instance.smtp.example",
      smtpPort: 465,
      smtpUser: "instance-user",
      smtpPasswordEncrypted: "sealed",
      smtpFrom: "Instance <system@instance.example>",
    });
    h.instanceSend.mockRejectedValue(new Error("instance SMTP unavailable"));
    h.envSend.mockResolvedValue({ messageId: "fallback-message" });

    const { sendMail } = await loadMail();
    await sendMail({ to: "owner@example.com", subject: "Alert", html: "<p>Alert</p>" });

    expect(h.instanceSettingsGet).toHaveBeenCalledTimes(1);
    expect(h.createTransport).toHaveBeenCalledTimes(2);
    expect(h.instanceSend).toHaveBeenCalledTimes(1);
    expect(h.envSend).toHaveBeenCalledTimes(1);
  });
});
