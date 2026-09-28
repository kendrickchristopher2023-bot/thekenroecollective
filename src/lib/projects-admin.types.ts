/** Shared types for the owner/admin projects console (client-safe). */
export type AdminProjectScope = "active" | "archived" | "all";
export type AdminProjectLinked = "all" | "linked" | "unlinked";
export type AdminProjectSort =
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc";

export type AdminProjectRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  event_id: string | null;
  language: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  owner_email: string | null;
  owner_display_name: string | null;
  task_count: number;
  member_count: number;
};
