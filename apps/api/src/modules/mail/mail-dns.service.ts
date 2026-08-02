import {
  deleteManagedDnsRecords,
  publishManagedDnsRecords,
  type ManagedDnsRecordInput,
} from "../../lib/cloudflare-dns";

function ownerTag(serverId: string): string {
  return `vibrail:mail:${serverId}`;
}

function asDnsRecord(value: unknown): ManagedDnsRecordInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.type !== "string" ||
    typeof record.name !== "string" ||
    typeof record.value !== "string"
  ) {
    return null;
  }
  return {
    type: record.type,
    name: record.name,
    content: record.value,
    ...(typeof record.priority === "number" ? { priority: record.priority } : {}),
  };
}

/** Convert step-11's persisted shape into provider-neutral DNS writes. */
export function collectMailDnsRecords(records: Record<string, unknown>): ManagedDnsRecordInput[] {
  const collected: ManagedDnsRecordInput[] = [];
  for (const key of ["a", "aaaa", "mx", "spf", "dkim", "dmarc"] as const) {
    const record = asDnsRecord(records[key]);
    if (record) collected.push(record);
  }
  const extras = Array.isArray(records.extraRecords) ? records.extraRecords : [];
  for (const value of extras) {
    const record = asDnsRecord(value);
    if (record) collected.push(record);
  }
  const seen = new Set<string>();
  return collected.filter((record) => {
    const key = `${record.type.toUpperCase()}\0${record.name.toLowerCase()}\0${record.content}\0${record.priority ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function publishMailDnsRecords(opts: {
  records: Record<string, unknown>;
  organizationId: string;
  serverId: string;
}): Promise<"published" | "skipped"> {
  return publishManagedDnsRecords({
    records: collectMailDnsRecords(opts.records),
    organizationId: opts.organizationId,
    ownerTag: ownerTag(opts.serverId),
  });
}

export async function deleteMailDnsRecords(opts: {
  domain: string;
  organizationId: string;
  serverId: string;
}): Promise<void> {
  return deleteManagedDnsRecords({
    domain: opts.domain,
    organizationId: opts.organizationId,
    ownerTag: ownerTag(opts.serverId),
  });
}
