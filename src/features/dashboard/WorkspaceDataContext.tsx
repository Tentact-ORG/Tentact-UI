"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { buildFilterFields, isProspectFilters, type FilterField } from "./prospecting/prospect.filters";
import { summariseProspects, type ProspectSummary } from "./prospecting/prospect.matching";
import { sampleProspectRepository, type ProspectRepository } from "./prospecting/prospect.repository";
import {
  DEFAULT_ENRICHMENT,
  type EnrichmentOptions,
  type Prospect,
  type ProspectList,
  type SavedSearch,
} from "./prospecting/prospect.types";
import { useProspectSearch, type ProspectSearchController } from "./prospecting/useProspectSearch";

/**
 * State shared by every dashboard page. It lives in the dashboard layout, so it
 * survives client-side navigation between pages:
 *
 * - the prospect data and the live search (filters, results, summary);
 * - what the visitor creates themselves (saved searches, lists, enrichment
 *   preferences), kept per account in the browser until a backend exists;
 * - a status message announced to screen readers after actions.
 */
interface WorkspaceData {
  repository: ProspectRepository;
  prospects: readonly Prospect[];
  fields: readonly FilterField[];
  /** Summary of the whole workspace, independent of filters. */
  overall: ProspectSummary;
  search: ProspectSearchController;
  savedSearches: SavedSearch[];
  setSavedSearches: Dispatch<SetStateAction<SavedSearch[]>>;
  lists: ProspectList[];
  setLists: Dispatch<SetStateAction<ProspectList[]>>;
  enrichment: EnrichmentOptions;
  setEnrichment: Dispatch<SetStateAction<EnrichmentOptions>>;
  /** False until the browser's stored values have been applied. */
  hydrated: boolean;
  status: string;
  announce: (message: string) => void;
}

const WorkspaceDataContext = createContext<WorkspaceData | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSavedSearchList(value: unknown): value is SavedSearch[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.createdAt === "string" &&
        isProspectFilters(item.filters),
    )
  );
}

function isProspectListList(value: unknown): value is ProspectList[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.createdAt === "string" &&
        Array.isArray(item.prospectIds) &&
        item.prospectIds.every((id) => typeof id === "string"),
    )
  );
}

function isEnrichmentOptions(value: unknown): value is EnrichmentOptions {
  return isRecord(value) && (Object.keys(DEFAULT_ENRICHMENT) as (keyof EnrichmentOptions)[]).every((key) => typeof value[key] === "boolean");
}

interface WorkspaceDataProviderProps {
  /** Separates one account's browser-stored data from another's on a shared machine. */
  storageKey: string;
  children: ReactNode;
}

export function WorkspaceDataProvider({ storageKey, children }: WorkspaceDataProviderProps) {
  const repository = sampleProspectRepository;
  const prospects = useMemo(() => repository.all(), [repository]);
  const fields = useMemo(() => buildFilterFields(prospects), [prospects]);
  const overall = useMemo(() => summariseProspects(prospects), [prospects]);
  const search = useProspectSearch(prospects);
  const [status, setStatus] = useState("");

  const prefix = `tentact:${storageKey}`;
  const [savedSearches, setSavedSearches, searchesHydrated] = useLocalStorageState<SavedSearch[]>(
    `${prefix}:saved-searches`,
    [],
    isSavedSearchList,
  );
  const [lists, setLists, listsHydrated] = useLocalStorageState<ProspectList[]>(`${prefix}:lists`, [], isProspectListList);
  const [enrichment, setEnrichment, enrichmentHydrated] = useLocalStorageState<EnrichmentOptions>(
    `${prefix}:enrichment`,
    DEFAULT_ENRICHMENT,
    isEnrichmentOptions,
  );

  const value = useMemo<WorkspaceData>(
    () => ({
      repository,
      prospects,
      fields,
      overall,
      search,
      savedSearches,
      setSavedSearches,
      lists,
      setLists,
      enrichment,
      setEnrichment,
      hydrated: searchesHydrated && listsHydrated && enrichmentHydrated,
      status,
      announce: setStatus,
    }),
    [
      repository,
      prospects,
      fields,
      overall,
      search,
      savedSearches,
      setSavedSearches,
      lists,
      setLists,
      enrichment,
      setEnrichment,
      searchesHydrated,
      listsHydrated,
      enrichmentHydrated,
      status,
    ],
  );

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}

export function useWorkspaceData(): WorkspaceData {
  const context = useContext(WorkspaceDataContext);
  if (!context) throw new Error("useWorkspaceData must be used inside WorkspaceDataProvider.");
  return context;
}

/** Unique enough for browser-local records; swap for server ids when a backend exists. */
export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
