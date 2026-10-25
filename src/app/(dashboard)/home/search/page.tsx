import { redirect } from "next/navigation";
import { ROUTES } from "@/config/site";

/** Prospect search moved to the workspace home; old links land there. */
export default function Page() {
  redirect(ROUTES.dashboard);
}
