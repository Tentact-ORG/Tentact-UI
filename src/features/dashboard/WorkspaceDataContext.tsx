"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { DEFAULT_EXPORT_FIELDS, EXPORT_FIELDS } from "@/lib/exportFields";
import { ApiError, dashboardApi, errorText, type ProspectListRecord, type SavedSearchRecord } from "./api/dashboard.api";
import { buildFilterFields, isProspectFilters, type Facets, type FilterField } from "./prospecting/prospect.filters";
import { createCountryNames, facetKeys, toSearchRequest } from "./prospecting/prospect.query";
import {
  EMPTY_FILTERS,
  type Prospect,
  type ProspectFilters,
  type ProspectList,
  type SavedSearch,
} from "./prospecting/prospect.types";
import { useProspectSearch, type ProspectSearchController } from "./prospecting/useProspectSearch";

/**
 * State shared by every dashboard page. It lives in the dashboard layout, so it
 * survives client-side navigation between pages:
 *
 * - the filter options discovered in the lead warehouse and the live search;
 * - the organization's saved searches and prospect lists (server-side);
 * - the export field choice (also set from the Enrich tab), kept per account in this browser;
 * - a status message announced to screen readers after actions.
 */
interface WorkspaceData {
  fields: readonly FilterField[];
  /** True once the filter options have loaded (or failed to). */
  fieldsReady: boolean;
  fieldsError: string | null;
  search: ProspectSearchController;
  savedSearches: SavedSearch[];
  lists: ProspectList[];
  /** True once saved searches and lists have loaded. */
  hydrated: boolean;
  saveSearch: (name: string, filters: ProspectFilters) => Promise<void>;
  deleteSavedSearch: (id: string) => Promise<void>;
  createList: (name: string, prospects: readonly Prospect[]) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  /** Field keys chosen in the export checklist (see src/lib/exportFields.ts), remembered in this browser. */
  exportFields: readonly string[];
  setExportFields: Dispatch<SetStateAction<readonly string[]>>;
  /** The signed-in user's role (ADMIN, AUDITOR or MEMBER). */
  role: string;
  status: string;
  announce: (message: string) => void;
}

const WorkspaceDataContext = createContext<WorkspaceData | null>(null);

function toSavedSearch(record: SavedSearchRecord): SavedSearch {
  const filters = isProspectFilters(record.ui_state) ? record.ui_state : { ...EMPTY_FILTERS, query: record.natural_query ?? "" };
  return { id: String(record.id), name: record.name, createdAt: record.created_at, filters };
}

function toProspectList(record: ProspectListRecord<Prospect>): ProspectList {
  return { id: String(record.id), name: record.name, createdAt: record.created_at, prospects: record.prospects };
}

interface WorkspaceDataProviderProps {
  /** Separates one account's browser-stored preferences from another's on a shared machine. */
  storageKey: string;
  role: string;
  children: ReactNode;
}

export function WorkspaceDataProvider({ storageKey, role, children }: WorkspaceDataProviderProps) {
  const [facets, setFacets] = useState<Facets>({});
  const [fieldsReady, setFieldsReady] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [lists, setLists] = useState<ProspectList[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("");

  const countries = useMemo(() => createCountryNames(facets["new_combined_data.COUNTRY_CODE_PER"]?.values ?? []), [facets]);
  const fields = useMemo(() => buildFilterFields(facets, countries), [facets, countries]);
  const search = useProspectSearch(countries);

  const [exportFields, setExportFields] = useLocalStorageState<readonly string[]>(
    `tentact:${storageKey}:export-fields`,
    DEFAULT_EXPORT_FIELDS,
    (value): value is readonly string[] => Array.isArray(value) && value.length > 0 && value.every((key) => EXPORT_FIELDS.some((field) => field.key === key)),
  );

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .columnValues(facetKeys())
      .then((loaded) => {
        if (!cancelled) setFacets(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFieldsError(errorText(error, "Filter options couldn't be loaded."));
      })
      .finally(() => {
        if (!cancelled) setFieldsReady(true);
      });

    Promise.all([dashboardApi.listSavedSearches(), dashboardApi.listLists<Prospect>()])
      .then(([searches, savedLists]) => {
        if (cancelled) return;
        setSavedSearches(searches.map(toSavedSearch));
        setLists(savedLists.map(toProspectList));
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(errorText(error, "Saved searches and lists couldn't be loaded."));
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSearch = useCallback(
    async (name: string, filters: ProspectFilters) => {
      const created = await dashboardApi.saveSearch({
        name,
        search_request: toSearchRequest(filters, 1, countries),
        ui_state: filters as unknown as Record<string, unknown>,
      });
      setSavedSearches((current) => [{ id: String(created.id), name: created.name, createdAt: created.created_at, filters }, ...current]);
    },
    [countries],
  );

  // Deletes remove the item at once (so a slow request can't invite repeat clicks) and restore it only on a real failure.
  const deleteSavedSearch = useCallback(async (id: string) => {
    let removed: { item: SavedSearch; index: number } | null = null;
    setSavedSearches((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index !== -1) removed = { item: current[index], index };
      return current.filter((item) => item.id !== id);
    });
    try {
      await dashboardApi.deleteSavedSearch(id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return; // already gone
      const restore = removed as { item: SavedSearch; index: number } | null;
      if (restore) setSavedSearches((current) => (current.some((item) => item.id === id) ? current : [...current.slice(0, restore.index), restore.item, ...current.slice(restore.index)]));
      throw error;
    }
  }, []);

  const createList = useCallback(async (name: string, prospects: readonly Prospect[]) => {
    const created = await dashboardApi.createList<Prospect>(name, prospects);
    setLists((current) => [toProspectList(created), ...current]);
  }, []);

  const deleteList = useCallback(async (id: string) => {
    let removed: { item: ProspectList; index: number } | null = null;
    setLists((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index !== -1) removed = { item: current[index], index };
      return current.filter((item) => item.id !== id);
    });
    try {
      await dashboardApi.deleteList(id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return; // already gone
      const restore = removed as { item: ProspectList; index: number } | null;
      if (restore) setLists((current) => (current.some((item) => item.id === id) ? current : [...current.slice(0, restore.index), restore.item, ...current.slice(restore.index)]));
      throw error;
    }
  }, []);

  const value = useMemo<WorkspaceData>(
    () => ({
      fields,
      fieldsReady,
      fieldsError,
      search,
      savedSearches,
      lists,
      hydrated,
      saveSearch,
      deleteSavedSearch,
      createList,
      deleteList,
      exportFields,
      setExportFields,
      role,
      status,
      announce: setStatus,
    }),
    [fields, fieldsReady, fieldsError, search, savedSearches, lists, hydrated, saveSearch, deleteSavedSearch, createList, deleteList, exportFields, setExportFields, role, status],
  );

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}

export function useWorkspaceData(): WorkspaceData {
  const context = useContext(WorkspaceDataContext);
  if (!context) throw new Error("useWorkspaceData must be used inside WorkspaceDataProvider.");
  return context;
}
