import { getCodec, getDb } from "../core/database";
import { singleton } from "../core/singleton";
import { RelationshipStatus, toTableRelationship, type TableRelationship } from "../models/entities";
import { auditService } from "./auditService";
import { schemaDiscoveryService } from "./schemaDiscovery";

export interface ApprovedRelationship {
  id: number;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  cardinality: string;
  evidence: string;
}

interface Candidate {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  cardinality: string;
  evidence: string;
  confidence: number;
}

class RelationshipDiscoveryService {
  private approved: ApprovedRelationship[] = [];

  getApprovedRelationships(): ApprovedRelationship[] {
    return this.approved;
  }

  /**
   * Infers candidate joins between tables from matching `*_id` / primary-key column
   * names with identical types, persisting any that are not yet registered.
   */
  async discoverCandidateRelationships(): Promise<TableRelationship[]> {
    const schema = schemaDiscoveryService.getCachedSchema();
    const candidates: Candidate[] = [];
    const tableItems = Object.entries(schema);

    for (const [tblA, infoA] of tableItems) {
      for (const [tblB, infoB] of tableItems) {
        if (tblA === tblB) continue;
        for (const [colAName, colAMeta] of Object.entries(infoA.columns)) {
          for (const [colBName, colBMeta] of Object.entries(infoB.columns)) {
            const isKeyLike = colAName.includes("_id") || colBMeta.is_primary_key;
            if (colAName === colBName && isKeyLike && colAMeta.type === colBMeta.type) {
              candidates.push({
                source_table: tblA,
                source_column: colAName,
                target_table: tblB,
                target_column: colBName,
                cardinality: "many_to_one",
                evidence:
                  `Column name match '${colAName}', compatible type '${colAMeta.type}', ` +
                  `target is primary key: ${colBMeta.is_primary_key ? "True" : "False"}`,
                confidence: colBMeta.is_primary_key ? 0.95 : 0.8,
              });
            }
          }
        }
      }
    }

    const db = getDb();
    const codec = getCodec();
    const created: TableRelationship[] = [];
    for (const cand of candidates) {
      const existing = await db
        .selectFrom("table_relationships")
        .select("id")
        .where("source_table", "=", cand.source_table)
        .where("source_column", "=", cand.source_column)
        .where("target_table", "=", cand.target_table)
        .where("target_column", "=", cand.target_column)
        .executeTakeFirst();
      if (existing) continue;

      // Auto-approve the canonical synthetic contacts -> companies join; everything else awaits admin review.
      const autoApprove =
        cand.source_table === "synthetic_contacts" &&
        cand.target_table === "synthetic_companies" &&
        cand.source_column === "company_id";
      const now = new Date();
      const row = await db
        .insertInto("table_relationships")
        .values({
          source_table: cand.source_table,
          source_column: cand.source_column,
          target_table: cand.target_table,
          target_column: cand.target_column,
          cardinality: cand.cardinality,
          status: autoApprove ? RelationshipStatus.APPROVED : RelationshipStatus.PENDING,
          confidence_score: cand.confidence,
          evidence: cand.evidence,
          created_at: codec.date(now),
          reviewed_at: autoApprove ? codec.date(now) : null,
          reviewed_by: autoApprove ? "system_auto_bootstrap" : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      created.push(toTableRelationship(codec, row));
    }

    await this.loadApprovedRelationships();
    return created;
  }

  async loadApprovedRelationships(): Promise<void> {
    const rows = await getDb()
      .selectFrom("table_relationships")
      .selectAll()
      .where("status", "=", RelationshipStatus.APPROVED)
      .orderBy("id")
      .execute();
    this.approved = rows.map((r) => ({
      id: r.id,
      source_table: r.source_table,
      source_column: r.source_column,
      target_table: r.target_table,
      target_column: r.target_column,
      cardinality: r.cardinality,
      evidence: r.evidence,
    }));
  }

  async updateRelationshipStatus(
    relationshipId: number,
    newStatus: RelationshipStatus,
    reviewerEmail: string,
  ): Promise<TableRelationship | null> {
    const db = getDb();
    const codec = getCodec();
    const row = await db
      .updateTable("table_relationships")
      .set({ status: newStatus, reviewed_at: codec.date(new Date()), reviewed_by: reviewerEmail })
      .where("id", "=", relationshipId)
      .returningAll()
      .executeTakeFirst();
    if (!row) return null;

    await this.loadApprovedRelationships();
    await auditService.logEvent({
      action: "UPDATE_RELATIONSHIP_STATUS",
      resource: `relationship:${row.source_table}->${row.target_table}`,
      status: newStatus,
      details: {
        id: row.id,
        source: `${row.source_table}.${row.source_column}`,
        target: `${row.target_table}.${row.target_column}`,
        reviewed_by: reviewerEmail,
      },
    });
    return toTableRelationship(codec, row);
  }

  /** Whether a join between the two tables (in either direction) is approved, optionally on specific columns. */
  isJoinApproved(sourceTable: string, targetTable: string, joinColumns?: [string, string]): boolean {
    for (const rel of this.approved) {
      const tablesMatch =
        (rel.source_table === sourceTable && rel.target_table === targetTable) ||
        (rel.source_table === targetTable && rel.target_table === sourceTable);
      if (!tablesMatch) continue;
      if (!joinColumns) return true;
      const [col1, col2] = joinColumns;
      if (
        (rel.source_column === col1 && rel.target_column === col2) ||
        (rel.source_column === col2 && rel.target_column === col1)
      ) {
        return true;
      }
    }
    return false;
  }
}

export const relationshipService = singleton("relationshipDiscovery", () => new RelationshipDiscoveryService());
