/** Shared types for the owner/admin events console (client-safe, no server imports). */
export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type AdminEventScope = "active" | "archived" | "all";
export type AdminEventDemoFilter = "production" | "demo" | "all";
export type AdminEventSort =
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc"
  | "title_asc"
  | "title_desc";

export type AdminEventRow = {
  id: string;
  user_id: string | null;
  branded_slug: string | null;
  data: Json;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  is_demo: boolean;
  owner_email: string | null;
  owner_display_name: string | null;
};
