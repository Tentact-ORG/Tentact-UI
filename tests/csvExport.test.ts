import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createExport } from "@/app/api/export/route";
import { GET as getJob } from "@/app/api/export/[jobId]/route";
import { GET as listJobs } from "@/app/api/export/jobs/route";
import { GET as download } from "@/app/api/export/download/[token]/route";
import { getCodec, getDb } from "@/server/core/database";
import { searchRequestSchema } from "@/server/schemas/search";
import { chService } from "@/server/services/clickhouseClient";
import { applyExportLimit, exportService, sanitizeCsvCell } from "@/server/services/exportService";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

describe("CSV export", () => {
  let seed: SeedData;
  beforeEach(async () => {
    vi.restoreAllMocks();
    seed = await seedTestData();
  });

  it("neutralizes spreadsheet formula injection", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(sanitizeCsvCell("-2+3")).toBe("'-2+3");
    expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    expect(sanitizeCsvCell("\tTabPrefix")).toBe("'\tTabPrefix");
    expect(sanitizeCsvCell("Acme Corp")).toBe("Acme Corp");
    expect(sanitizeCsvCell("bob@acme.com")).toBe("bob@acme.com");
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(-5)).toBe("'-5");
  });

  it("caps or appends the export LIMIT", () => {
    expect(applyExportLimit("SELECT a FROM t ORDER BY a LIMIT 25 OFFSET 0", 500)).toBe("SELECT a FROM t ORDER BY a LIMIT 500");
    expect(applyExportLimit("SELECT a FROM t", 500)).toBe("SELECT a FROM t LIMIT 500");
  });

  it("creates and processes an export job", async () => {
    const job = await exportService.createExportJob(
      searchRequestSchema.parse({ natural_query: "Find SaaS companies in United States", search_target: "company" }),
      seed.admin.id,
      seed.admin.org_id,
      seed.admin.role,
      50,
    );
    expect(job.status).toBe("QUEUED");
    expect(job.download_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await exportService.drain();
    const updated = await exportService.getJobByToken(job.download_token!);
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.total_rows).toBeGreaterThan(0);
    const filePath = path.resolve(process.cwd(), updated!.file_path!);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it("writes CSV exactly as the Python csv module would", async () => {
    vi.spyOn(chService, "executeQuery").mockResolvedValue({
      columns: ["id", "tech", "note", "flag", "score"],
      types: [],
      rows: [
        [1001, ["AWS", "Next.js", "O'Reilly"], '=SUM(A1), "x"', true, 7367117.31],
        [1002, [], null, false, -5],
      ],
    });
    const job = await exportService.createExportJob(
      searchRequestSchema.parse({ natural_query: "SaaS companies" }),
      seed.admin.id,
      seed.admin.org_id,
      "ADMIN",
    );
    await exportService.drain();
    const done = await exportService.getJobByToken(job.download_token!);
    const content = fs.readFileSync(path.resolve(process.cwd(), done!.file_path!), "utf-8");
    // Reference output produced by Python's csv.writer with sanitize_csv_cell.
    expect(content).toBe(
      "id,tech,note,flag,score\r\n" +
        `1001,"['AWS', 'Next.js', ""O'Reilly""]","'=SUM(A1), ""x""",True,7367117.31\r\n` +
        "1002,[],,False,'-5\r\n",
    );
  });

  it("records failures on the job", async () => {
    const job = await exportService.createExportJob(
      searchRequestSchema.parse({ natural_query: "raw unapproved events" }),
      seed.member.id,
      seed.member.org_id,
      "MEMBER",
    );
    await exportService.drain();
    const failed = await exportService.getJobByToken(job.download_token!);
    expect(failed?.status).toBe("FAILED");
    expect(failed?.error_message).toContain("Export query rejected by reviewer");
  });

  it("isolates export jobs by organization", async () => {
    const created = await callRoute(createExport, {
      method: "POST",
      body: { search_request: { natural_query: "SaaS companies", search_target: "company" }, max_rows: 10 },
      headers: await authHeaders(seed.admin),
    });
    expect(created.status).toBe(200);
    expect(created.body).not.toHaveProperty("file_path");
    const jobId = created.body.id as number;

    const otherOrgJobs = await callRoute(listJobs, { headers: await authHeaders(seed.org2Member) });
    expect(otherOrgJobs.status).toBe(200);
    expect(otherOrgJobs.body.every((j: { id: number }) => j.id !== jobId)).toBe(true);

    const crossTenant = await callRoute(getJob, { headers: await authHeaders(seed.org2Member), params: { jobId: String(jobId) } });
    expect(crossTenant.status).toBe(404);
    const sameTenant = await callRoute(getJob, { headers: await authHeaders(seed.member), params: { jobId: String(jobId) } });
    expect(sameTenant.status).toBe(200);
    await exportService.drain();
  });

  it("downloads completed exports by token and enforces expiry", async () => {
    const job = await exportService.createExportJob(
      searchRequestSchema.parse({ natural_query: "SaaS companies" }),
      seed.admin.id,
      seed.admin.org_id,
      "ADMIN",
    );
    await exportService.drain();

    const ok = await callRoute(download, { params: { token: job.download_token! } });
    expect(ok.status).toBe(200);
    expect(ok.response.headers.get("content-type")).toContain("text/csv");
    expect(ok.response.headers.get("content-disposition")).toBe(`attachment; filename="leadgen_export_company_${job.id}.csv"`);
    expect(String(ok.body).split("\r\n")[0]).toContain("company_id");

    expect((await callRoute(download, { params: { token: "not-a-real-token-value" } })).status).toBe(404);
    expect((await callRoute(download, { params: { token: "../../etc/passwd" } })).status).toBe(404);

    await getDb()
      .updateTable("export_jobs")
      .set({ expires_at: getCodec().date(new Date(Date.now() - 1000)) })
      .where("id", "=", job.id)
      .execute();
    const expired = await callRoute(download, { params: { token: job.download_token! } });
    expect(expired.status).toBe(410);
    expect((await exportService.getJobByToken(job.download_token!))?.status).toBe("EXPIRED");
  });

  it("cleans up expired export files", async () => {
    const job = await exportService.createExportJob(
      searchRequestSchema.parse({ natural_query: "SaaS companies" }),
      seed.admin.id,
      seed.admin.org_id,
      "ADMIN",
    );
    await exportService.drain();
    const done = await exportService.getJobByToken(job.download_token!);
    await getDb()
      .updateTable("export_jobs")
      .set({ expires_at: getCodec().date(new Date(Date.now() - 1000)) })
      .where("id", "=", job.id)
      .execute();

    expect(await exportService.cleanupExpiredExports()).toBe(1);
    expect(fs.existsSync(path.resolve(process.cwd(), done!.file_path!))).toBe(false);
    expect((await exportService.getJobByToken(job.download_token!))?.status).toBe("EXPIRED");
  });
});
