"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageHeader } from "../components/PageHeader";
import { DASHBOARD_PAGES } from "../navigation";
import { ProspectLists } from "../prospecting/SavedPanels";
import { useProspectingActions } from "../prospecting/useProspectingActions";
import { useWorkspaceData } from "../WorkspaceDataContext";
import styles from "./Pages.module.css";

/** /home/lists: prospect lists built from selections, each exportable as CSV. */
export function ListsPage() {
  const { lists } = useWorkspaceData();
  const actions = useProspectingActions();

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Prospecting"
        title="Lists"
        description="Prospects you selected and saved together. Exports use the fields you chose in the export window or the Enrich tab."
        aside={
          <ButtonLink variant="ink" href={DASHBOARD_PAGES.search.href} withArrow>
            Build a list
          </ButtonLink>
        }
      />
      <ProspectLists lists={lists} onExport={actions.exportList} onDelete={(id) => void actions.deleteList(id)} />
    </div>
  );
}
