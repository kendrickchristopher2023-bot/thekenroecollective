export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_impressions: {
        Row: {
          at: string
          id: string
          kind: string
          placement_id: string
          referrer: string | null
          user_id: string | null
        }
        Insert: {
          at?: string
          id?: string
          kind: string
          placement_id: string
          referrer?: string | null
          user_id?: string | null
        }
        Update: {
          at?: string
          id?: string
          kind?: string
          placement_id?: string
          referrer?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "active_ad_placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_placements: {
        Row: {
          blurb: string | null
          created_at: string
          cta_url: string | null
          ends_at: string | null
          headline: string
          hero_image: string | null
          id: string
          monthly_price_id: string | null
          owner_user_id: string | null
          region: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          starts_at: string | null
          status: string
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          blurb?: string | null
          created_at?: string
          cta_url?: string | null
          ends_at?: string | null
          headline: string
          hero_image?: string | null
          id?: string
          monthly_price_id?: string | null
          owner_user_id?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string | null
          status?: string
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          blurb?: string | null
          created_at?: string
          cta_url?: string | null
          ends_at?: string | null
          headline?: string
          hero_image?: string | null
          id?: string
          monthly_price_id?: string | null
          owner_user_id?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string | null
          status?: string
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_placements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_placements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          metadata: Json
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          metadata?: Json
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json
          title?: string
        }
        Relationships: []
      }
      ai_package_entitlements: {
        Row: {
          active: boolean
          created_at: string
          environment: string
          event_id: string | null
          expires_at: string | null
          id: string
          project_id: string | null
          scope: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          environment?: string
          event_id?: string | null
          expires_at?: string | null
          id?: string
          project_id?: string | null
          scope: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          environment?: string
          event_id?: string | null
          expires_at?: string | null
          id?: string
          project_id?: string | null
          scope?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_packages: {
        Row: {
          attachments: Json
          budget_cents: number | null
          content: Json
          created_at: string
          event_id: string | null
          guest_count: number | null
          id: string
          kind: string
          model: string | null
          project_id: string | null
          prompt: string
          share_token: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          budget_cents?: number | null
          content?: Json
          created_at?: string
          event_id?: string | null
          guest_count?: number | null
          id?: string
          kind: string
          model?: string | null
          project_id?: string | null
          prompt: string
          share_token?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          budget_cents?: number | null
          content?: Json
          created_at?: string
          event_id?: string | null
          guest_count?: number | null
          id?: string
          kind?: string
          model?: string | null
          project_id?: string | null
          prompt?: string
          share_token?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          body: string
          channels: string[]
          created_at: string
          created_by: string | null
          email_body: string | null
          email_subject: string | null
          event_id: string | null
          event_title: string | null
          id: string
          image_url: string | null
          link_label: string | null
          link_url: string | null
          scheduled_for: string | null
          sent_at: string | null
          sms_text: string | null
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
          type: Database["public"]["Enums"]["announcement_type"]
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          email_body?: string | null
          email_subject?: string | null
          event_id?: string | null
          event_title?: string | null
          id?: string
          image_url?: string | null
          link_label?: string | null
          link_url?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sms_text?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title: string
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          email_body?: string | null
          email_subject?: string | null
          event_id?: string | null
          event_title?: string | null
          id?: string
          image_url?: string | null
          link_label?: string | null
          link_url?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sms_text?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
        }
        Relationships: []
      }
      app_error_logs: {
        Row: {
          created_at: string
          environment: string
          error_name: string
          fingerprint: string
          id: string
          message: string
          release: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          environment?: string
          error_name?: string
          fingerprint: string
          id?: string
          message: string
          release?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          error_name?: string
          fingerprint?: string
          id?: string
          message?: string
          release?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_rate_limit: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          bytes: number
          created_at: string
          deleted_object_count: number
          errors: Json
          finished_at: string | null
          id: string
          kind: string
          new_object_count: number
          object_count: number
          prefix: string
          row_count: number
          started_at: string
          status: string
          table_count: number
          tables: Json
        }
        Insert: {
          bytes?: number
          created_at?: string
          deleted_object_count?: number
          errors?: Json
          finished_at?: string | null
          id?: string
          kind?: string
          new_object_count?: number
          object_count?: number
          prefix: string
          row_count?: number
          started_at?: string
          status?: string
          table_count?: number
          tables?: Json
        }
        Update: {
          bytes?: number
          created_at?: string
          deleted_object_count?: number
          errors?: Json
          finished_at?: string | null
          id?: string
          kind?: string
          new_object_count?: number
          object_count?: number
          prefix?: string
          row_count?: number
          started_at?: string
          status?: string
          table_count?: number
          tables?: Json
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          created_at: string
          font_body: string
          font_display: string
          id: string
          is_default: boolean
          logo_url: string | null
          name: string
          palette: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          font_body?: string
          font_display?: string
          id?: string
          is_default?: boolean
          logo_url?: string | null
          name: string
          palette?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          font_body?: string
          font_display?: string
          id?: string
          is_default?: boolean
          logo_url?: string | null
          name?: string
          palette?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_cards: {
        Row: {
          created_at: string
          email: string
          full_name: string
          organisation: string
          phone: string | null
          photo_url: string | null
          published: boolean
          role: string
          show_phone_on_page: boolean
          slug: string
          sort_order: number
          tagline: string | null
          updated_at: string
          website: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          organisation?: string
          phone?: string | null
          photo_url?: string | null
          published?: boolean
          role?: string
          show_phone_on_page?: boolean
          slug: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          website?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          organisation?: string
          phone?: string | null
          photo_url?: string | null
          published?: boolean
          role?: string
          show_phone_on_page?: boolean
          slug?: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      card_scans: {
        Row: {
          action: string
          card_slug: string | null
          created_at: string
          destination: string
          id: string
          source: string
        }
        Insert: {
          action?: string
          card_slug?: string | null
          created_at?: string
          destination: string
          id?: string
          source?: string
        }
        Update: {
          action?: string
          card_slug?: string | null
          created_at?: string
          destination?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          currency: string
          event_id: string | null
          id: string
          kind: string
          metadata: Json
          project_id: string | null
          quantity: number
          sku: string
          unit_amount_cents: number | null
        }
        Insert: {
          cart_id: string
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          project_id?: string | null
          quantity?: number
          sku: string
          unit_amount_cents?: number | null
        }
        Update: {
          cart_id?: string
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          project_id?: string | null
          quantity?: number
          sku?: string
          unit_amount_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          environment: string
          id: string
          promo_code: string | null
          status: string
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          environment?: string
          id?: string
          promo_code?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          promo_code?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_broadcast_recipients: {
        Row: {
          broadcast_id: string
          contact_id: string | null
          created_at: string
          email: string
          error: string | null
          id: string
          status: string
        }
        Insert: {
          broadcast_id: string
          contact_id?: string | null
          created_at?: string
          email: string
          error?: string | null
          id?: string
          status?: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string | null
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "contact_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_broadcasts: {
        Row: {
          body_preview: string | null
          created_at: string
          cta_url: string | null
          filter_group_id: string | null
          filter_tag: string | null
          id: string
          owner_user_id: string
          queued_count: number
          recipient_count: number
          sent_at: string
          skipped_count: number
          subject: string
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          cta_url?: string | null
          filter_group_id?: string | null
          filter_tag?: string | null
          id?: string
          owner_user_id: string
          queued_count?: number
          recipient_count?: number
          sent_at?: string
          skipped_count?: number
          subject: string
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          cta_url?: string | null
          filter_group_id?: string | null
          filter_tag?: string | null
          id?: string
          owner_user_id?: string
          queued_count?: number
          recipient_count?: number
          sent_at?: string
          skipped_count?: number
          subject?: string
        }
        Relationships: []
      }
      contact_event_links: {
        Row: {
          contact_id: string
          event_id: string
          gift_amount_cents: number | null
          id: string
          linked_at: string
          rsvp_status: string | null
          thankyou_sent_at: string | null
        }
        Insert: {
          contact_id: string
          event_id: string
          gift_amount_cents?: number | null
          id?: string
          linked_at?: string
          rsvp_status?: string | null
          thankyou_sent_at?: string | null
        }
        Update: {
          contact_id?: string
          event_id?: string
          gift_amount_cents?: number | null
          id?: string
          linked_at?: string
          rsvp_status?: string | null
          thankyou_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_event_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_group_members: {
        Row: {
          added_at: string
          contact_id: string
          group_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          group_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_group_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_imports: {
        Row: {
          created_at: string
          id: string
          kind: string
          owner_user_id: string
          parsed_rows: Json | null
          result: Json | null
          row_count: number | null
          schedule_id: string | null
          status: string
          storage_path: string | null
          submitted_rows: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          owner_user_id: string
          parsed_rows?: Json | null
          result?: Json | null
          row_count?: number | null
          schedule_id?: string | null
          status?: string
          storage_path?: string | null
          submitted_rows?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          owner_user_id?: string
          parsed_rows?: Json | null
          result?: Json | null
          row_count?: number | null
          schedule_id?: string | null
          status?: string
          storage_path?: string | null
          submitted_rows?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          email_norm: string | null
          email_opt_out: boolean
          first_seen_event_id: string | null
          id: string
          merged_into: string | null
          notes: string | null
          owner_user_id: string
          phone: string | null
          phone_norm: string | null
          source: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          email_norm?: string | null
          email_opt_out?: boolean
          first_seen_event_id?: string | null
          id?: string
          merged_into?: string | null
          notes?: string | null
          owner_user_id: string
          phone?: string | null
          phone_norm?: string | null
          source?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          email_norm?: string | null
          email_opt_out?: boolean
          first_seen_event_id?: string | null
          id?: string
          merged_into?: string | null
          notes?: string | null
          owner_user_id?: string
          phone?: string | null
          phone_norm?: string | null
          source?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      data_cleanup_log: {
        Row: {
          cleanup_type: string
          event_id: string | null
          executed_at: string
          guests_anonymized: number
          id: string
          notes: string | null
        }
        Insert: {
          cleanup_type: string
          event_id?: string | null
          executed_at?: string
          guests_anonymized?: number
          id?: string
          notes?: string | null
        }
        Update: {
          cleanup_type?: string
          event_id?: string | null
          executed_at?: string
          guests_anonymized?: number
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      demo_event_snapshots: {
        Row: {
          captured_at: string
          event_id: string
          row: Json
        }
        Insert: {
          captured_at?: string
          event_id: string
          row: Json
        }
        Update: {
          captured_at?: string
          event_id?: string
          row?: Json
        }
        Relationships: []
      }
      demo_guard_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: Json
          id: string
          kind: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
        }
        Relationships: []
      }
      demo_seed_tombstones: {
        Row: {
          deleted_at: string
          id: string
          kind: string
          row_key: string
        }
        Insert: {
          deleted_at?: string
          id?: string
          kind: string
          row_key: string
        }
        Update: {
          deleted_at?: string
          id?: string
          kind?: string
          row_key?: string
        }
        Relationships: []
      }
      design_assets: {
        Row: {
          content: Json
          created_at: string
          environment: string
          event_id: string | null
          id: string
          kind: string
          share_token: string | null
          template_id: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          environment?: string
          event_id?: string | null
          id?: string
          kind: string
          share_token?: string | null
          template_id: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          environment?: string
          event_id?: string | null
          id?: string
          kind?: string
          share_token?: string | null
          template_id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dev_changelog: {
        Row: {
          body_md: string
          category: string
          commit_sha: string | null
          created_at: string
          files: string[]
          id: string
          published_at: string
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          category?: string
          commit_sha?: string | null
          created_at?: string
          files?: string[]
          id?: string
          published_at?: string
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          category?: string
          commit_sha?: string | null
          created_at?: string
          files?: string[]
          id?: string
          published_at?: string
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          active: boolean
          amount_off: number | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          max_uses: number | null
          percent_off: number | null
          referrer_user_id: string | null
          tier_id: string | null
          used_count: number
        }
        Insert: {
          active?: boolean
          amount_off?: number | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          max_uses?: number | null
          percent_off?: number | null
          referrer_user_id?: string | null
          tier_id?: string | null
          used_count?: number
        }
        Update: {
          active?: boolean
          amount_off?: number | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          max_uses?: number | null
          percent_off?: number | null
          referrer_user_id?: string | null
          tier_id?: string | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      disposable_email_domains: {
        Row: {
          added_at: string
          domain: string
        }
        Insert: {
          added_at?: string
          domain: string
        }
        Update: {
          added_at?: string
          domain?: string
        }
        Relationships: []
      }
      ecard_contributions: {
        Row: {
          audio_url: string | null
          contributor_name: string
          created_at: string
          ecard_id: string
          edit_token: string
          gif_url: string | null
          id: string
          image_url: string | null
          is_hidden: boolean
          media_type: string
          media_url: string | null
          message: string
          position: number
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          contributor_name: string
          created_at?: string
          ecard_id: string
          edit_token?: string
          gif_url?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          media_type?: string
          media_url?: string | null
          message?: string
          position?: number
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          contributor_name?: string
          created_at?: string
          ecard_id?: string
          edit_token?: string
          gif_url?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          media_type?: string
          media_url?: string | null
          message?: string
          position?: number
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecard_contributions_ecard_id_fkey"
            columns: ["ecard_id"]
            isOneToOne: false
            referencedRelation: "ecards"
            referencedColumns: ["id"]
          },
        ]
      }
      ecard_rate_limit: {
        Row: {
          count: number
          ecard_id: string
          window_start: string
        }
        Insert: {
          count?: number
          ecard_id: string
          window_start: string
        }
        Update: {
          count?: number
          ecard_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecard_rate_limit_ecard_id_fkey"
            columns: ["ecard_id"]
            isOneToOne: false
            referencedRelation: "ecards"
            referencedColumns: ["id"]
          },
        ]
      }
      ecards: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          is_paid: boolean
          music_heard_at: string | null
          music_piece_id: string | null
          occasion: string
          organizer_timezone: string | null
          organizer_user_id: string
          paid_at: string | null
          public_slug: string
          recipient_email: string | null
          recipient_name: string
          reminder_early_sent_at: string | null
          reminder_sent_at: string | null
          reveal_date: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_paid?: boolean
          music_heard_at?: string | null
          music_piece_id?: string | null
          occasion: string
          organizer_timezone?: string | null
          organizer_user_id: string
          paid_at?: string | null
          public_slug: string
          recipient_email?: string | null
          recipient_name: string
          reminder_early_sent_at?: string | null
          reminder_sent_at?: string | null
          reveal_date: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_paid?: boolean
          music_heard_at?: string | null
          music_piece_id?: string | null
          occasion?: string
          organizer_timezone?: string | null
          organizer_user_id?: string
          paid_at?: string | null
          public_slug?: string
          recipient_email?: string | null
          recipient_name?: string
          reminder_early_sent_at?: string | null
          reminder_sent_at?: string | null
          reveal_date?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecards_music_piece_id_fkey"
            columns: ["music_piece_id"]
            isOneToOne: false
            referencedRelation: "sound_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_activity_log: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          details: Json
          event_id: string
          guest_id: string | null
          guest_name: string | null
          id: string
          occurred_at: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          details?: Json
          event_id: string
          guest_id?: string | null
          guest_name?: string | null
          id?: string
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          details?: Json
          event_id?: string
          guest_id?: string | null
          guest_name?: string | null
          id?: string
          occurred_at?: string
        }
        Relationships: []
      }
      event_addons: {
        Row: {
          addon_key: string
          created_at: string
          environment: string
          event_id: string
          id: string
          metadata: Json
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          addon_key: string
          created_at?: string
          environment?: string
          event_id: string
          id?: string
          metadata?: Json
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          addon_key?: string
          created_at?: string
          environment?: string
          event_id?: string
          id?: string
          metadata?: Json
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      event_bring_claims: {
        Row: {
          created_at: string
          dish: string | null
          edit_token: string
          event_id: string
          id: string
          item_id: string
          name: string | null
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dish?: string | null
          edit_token?: string
          event_id: string
          id?: string
          item_id: string
          name?: string | null
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dish?: string | null
          edit_token?: string
          event_id?: string
          id?: string
          item_id?: string
          name?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_bring_claims_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "event_bring_items"
            referencedColumns: ["id"]
          },
        ]
      }
      event_bring_items: {
        Row: {
          category: string
          created_at: string
          event_id: string
          id: string
          name: string
          note: string | null
          position: number
          serves: number | null
          slots_needed: number
          suggested_by_guest: boolean
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          event_id: string
          id?: string
          name: string
          note?: string | null
          position?: number
          serves?: number | null
          slots_needed?: number
          suggested_by_guest?: boolean
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          note?: string | null
          position?: number
          serves?: number | null
          slots_needed?: number
          suggested_by_guest?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      event_comments: {
        Row: {
          author_role: string
          body: string
          created_at: string
          event_id: string
          guest_id: string | null
          guest_name: string | null
          hidden: boolean
          host_read_at: string | null
          id: string
          notified_at: string | null
          parent_id: string | null
          removed_at: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_role?: string
          body: string
          created_at?: string
          event_id: string
          guest_id?: string | null
          guest_name?: string | null
          hidden?: boolean
          host_read_at?: string | null
          id?: string
          notified_at?: string | null
          parent_id?: string | null
          removed_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_role?: string
          body?: string
          created_at?: string
          event_id?: string
          guest_id?: string | null
          guest_name?: string | null
          hidden?: boolean
          host_read_at?: string | null
          id?: string
          notified_at?: string | null
          parent_id?: string | null
          removed_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "event_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guest_requests: {
        Row: {
          contact: string
          created_at: string
          event_id: string
          id: string
          name: string
          note: string | null
          notified_at: string | null
          party_size: number
          reminded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact: string
          created_at?: string
          event_id: string
          id?: string
          name: string
          note?: string | null
          notified_at?: string | null
          party_size?: number
          reminded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact?: string
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          note?: string | null
          notified_at?: string | null
          party_size?: number
          reminded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guest_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invite_opens: {
        Row: {
          created_at: string
          event_id: string
          first_opened_at: string
          guest_id: string
          last_opened_at: string
          open_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          first_opened_at?: string
          guest_id: string
          last_opened_at?: string
          open_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          first_opened_at?: string
          guest_id?: string
          last_opened_at?: string
          open_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          event_id: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          role: Database["public"]["Enums"]["event_member_role"]
          status: string
          token: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          event_id: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          role?: Database["public"]["Enums"]["event_member_role"]
          status?: string
          token?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          role?: Database["public"]["Enums"]["event_member_role"]
          status?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photo_rate_limit: {
        Row: {
          bucket_key: string
          count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      event_photos: {
        Row: {
          byte_size: number | null
          content_type: string | null
          created_at: string
          event_id: string
          id: string
          ip_hash: string | null
          status: string
          storage_path: string
          updated_at: string
          uploader_label: string | null
        }
        Insert: {
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          event_id: string
          id?: string
          ip_hash?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          uploader_label?: string | null
        }
        Update: {
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          event_id?: string
          id?: string
          ip_hash?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploader_label?: string | null
        }
        Relationships: []
      }
      event_reminder_sends: {
        Row: {
          channel: string
          created_at: string
          event_id: string
          guest_id: string
          id: string
          preset_id: string
          sent_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          event_id: string
          guest_id: string
          id?: string
          preset_id: string
          sent_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          event_id?: string
          guest_id?: string
          id?: string
          preset_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      event_wall_music: {
        Row: {
          artist: string | null
          bpm: number | null
          byte_size: number | null
          created_at: string
          crossfade_ms: number
          duration_seconds: number | null
          energy: number | null
          event_id: string
          id: string
          intro_ms: number | null
          licence_affirmation_text: string
          licence_affirmed_at: string
          link_art_url: string | null
          link_provider: string | null
          link_title: string | null
          link_url: string | null
          order_index: number
          outro_ms: number | null
          prompt: string | null
          settings: Json
          source: string
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          artist?: string | null
          bpm?: number | null
          byte_size?: number | null
          created_at?: string
          crossfade_ms?: number
          duration_seconds?: number | null
          energy?: number | null
          event_id: string
          id?: string
          intro_ms?: number | null
          licence_affirmation_text: string
          licence_affirmed_at?: string
          link_art_url?: string | null
          link_provider?: string | null
          link_title?: string | null
          link_url?: string | null
          order_index?: number
          outro_ms?: number | null
          prompt?: string | null
          settings?: Json
          source?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          artist?: string | null
          bpm?: number | null
          byte_size?: number | null
          created_at?: string
          crossfade_ms?: number
          duration_seconds?: number | null
          energy?: number | null
          event_id?: string
          id?: string
          intro_ms?: number | null
          licence_affirmation_text?: string
          licence_affirmed_at?: string
          link_art_url?: string | null
          link_provider?: string | null
          link_title?: string | null
          link_url?: string | null
          order_index?: number
          outro_ms?: number | null
          prompt?: string | null
          settings?: Json
          source?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      event_well_wishes: {
        Row: {
          created_at: string
          event_id: string
          hidden: boolean
          id: string
          message: string
          name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          hidden?: boolean
          id?: string
          message: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          hidden?: boolean
          id?: string
          message?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_well_wishes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          archived_at: string | null
          branded_slug: string | null
          created_at: string
          data: Json
          honoree_email: string | null
          id: string
          is_demo: boolean
          language: string | null
          share_token: string
          updated_at: string
          user_id: string | null
          wishes_sent_at: string | null
        }
        Insert: {
          archived_at?: string | null
          branded_slug?: string | null
          created_at?: string
          data: Json
          honoree_email?: string | null
          id: string
          is_demo?: boolean
          language?: string | null
          share_token?: string
          updated_at?: string
          user_id?: string | null
          wishes_sent_at?: string | null
        }
        Update: {
          archived_at?: string | null
          branded_slug?: string | null
          created_at?: string
          data?: Json
          honoree_email?: string | null
          id?: string
          is_demo?: boolean
          language?: string | null
          share_token?: string
          updated_at?: string
          user_id?: string | null
          wishes_sent_at?: string | null
        }
        Relationships: []
      }
      guest_privacy_rate_limit: {
        Row: {
          count: number
          email: string
          window_start: string
        }
        Insert: {
          count?: number
          email: string
          window_start: string
        }
        Update: {
          count?: number
          email?: string
          window_start?: string
        }
        Relationships: []
      }
      guest_privacy_requests: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          status?: string
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          status?: string
          token?: string
        }
        Relationships: []
      }
      host_data_consent_log: {
        Row: {
          consent_given_at: string
          consent_text: string
          created_at: string
          event_id: string | null
          guest_count: number | null
          host_user_id: string
          id: string
          ip_address: string | null
          source: string | null
        }
        Insert: {
          consent_given_at?: string
          consent_text: string
          created_at?: string
          event_id?: string | null
          guest_count?: number | null
          host_user_id: string
          id?: string
          ip_address?: string | null
          source?: string | null
        }
        Update: {
          consent_given_at?: string
          consent_text?: string
          created_at?: string
          event_id?: string | null
          guest_count?: number | null
          host_user_id?: string
          id?: string
          ip_address?: string | null
          source?: string | null
        }
        Relationships: []
      }
      host_notifications: {
        Row: {
          body: string | null
          created_at: string
          event_id: string | null
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_narrations: {
        Row: {
          chars: number
          created_at: string
          event_id: string
          generating_at: string | null
          script: string
          script_hash: string
          seconds: number | null
          storage_path: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          chars?: number
          created_at?: string
          event_id: string
          generating_at?: string | null
          script: string
          script_hash: string
          seconds?: number | null
          storage_path?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          chars?: number
          created_at?: string
          event_id?: string
          generating_at?: string | null
          script?: string
          script_hash?: string
          seconds?: number | null
          storage_path?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: []
      }
      media_uploads: {
        Row: {
          alt_text: string | null
          bucket: string
          content_type: string | null
          created_at: string
          deleted_at: string | null
          folder: string
          height: number | null
          id: string
          object_path: string
          original_filename: string | null
          public_url: string
          responsive_group_id: string | null
          size_bytes: number | null
          source: string
          tags: string[]
          user_id: string
          visibility: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket?: string
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          folder?: string
          height?: number | null
          id?: string
          object_path: string
          original_filename?: string | null
          public_url: string
          responsive_group_id?: string | null
          size_bytes?: number | null
          source?: string
          tags?: string[]
          user_id: string
          visibility?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          folder?: string
          height?: number | null
          id?: string
          object_path?: string
          original_filename?: string | null
          public_url?: string
          responsive_group_id?: string | null
          size_bytes?: number | null
          source?: string
          tags?: string[]
          user_id?: string
          visibility?: string
          width?: number | null
        }
        Relationships: []
      }
      one_time_passes: {
        Row: {
          ai_generations_cap: number | null
          ai_generations_used: number
          attached_at: string | null
          created_at: string
          environment: string
          event_id: string | null
          expires_at: string
          first_material_use_at: string | null
          id: string
          price_id: string | null
          purchased_at: string
          refund_reason: string | null
          refunded_at: string | null
          revoked_at: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_generations_cap?: number | null
          ai_generations_used?: number
          attached_at?: string | null
          created_at?: string
          environment?: string
          event_id?: string | null
          expires_at: string
          first_material_use_at?: string | null
          id?: string
          price_id?: string | null
          purchased_at?: string
          refund_reason?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_generations_cap?: number | null
          ai_generations_used?: number
          attached_at?: string | null
          created_at?: string
          environment?: string
          event_id?: string | null
          expires_at?: string
          first_material_use_at?: string | null
          id?: string
          price_id?: string | null
          purchased_at?: string
          refund_reason?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_passes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_ai_actions: {
        Row: {
          amount_cents: number | null
          approved_at: string | null
          approved_by_email: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_email: string | null
          created_by_user_id: string
          error: string | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          kind: string
          payload: Json
          reject_reason: string | null
          rejected_at: string | null
          rejected_by_email: string | null
          rejected_by_user_id: string | null
          requires_amount_confirmation: boolean
          status: string
          summary: string
          target_label: string | null
          target_user_id: string | null
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          approved_at?: string | null
          approved_by_email?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_user_id: string
          error?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          kind: string
          payload?: Json
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by_email?: string | null
          rejected_by_user_id?: string | null
          requires_amount_confirmation?: boolean
          status?: string
          summary: string
          target_label?: string | null
          target_user_id?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          approved_at?: string | null
          approved_by_email?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_user_id?: string
          error?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          kind?: string
          payload?: Json
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by_email?: string | null
          rejected_by_user_id?: string | null
          requires_amount_confirmation?: boolean
          status?: string
          summary?: string
          target_label?: string | null
          target_user_id?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_ai_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "owner_ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_ai_audit: {
        Row: {
          cost_micro_usd: number
          created_at: string
          id: string
          input_tokens: number
          outcome: string
          output_tokens: number
          owner_email: string | null
          owner_user_id: string
          question: string
          sources: Json
          thread_id: string | null
          tools_used: Json
        }
        Insert: {
          cost_micro_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          outcome?: string
          output_tokens?: number
          owner_email?: string | null
          owner_user_id: string
          question: string
          sources?: Json
          thread_id?: string | null
          tools_used?: Json
        }
        Update: {
          cost_micro_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          outcome?: string
          output_tokens?: number
          owner_email?: string | null
          owner_user_id?: string
          question?: string
          sources?: Json
          thread_id?: string | null
          tools_used?: Json
        }
        Relationships: []
      }
      owner_ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          owner_user_id: string
          role: string
          sources: Json
          thread_id: string
          tool_calls: Json
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          owner_user_id: string
          role: string
          sources?: Json
          thread_id: string
          tool_calls?: Json
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          owner_user_id?: string
          role?: string
          sources?: Json
          thread_id?: string
          tool_calls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "owner_ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "owner_ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_ai_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          owner_email: string | null
          owner_user_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          owner_email?: string | null
          owner_user_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          owner_email?: string | null
          owner_user_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      owner_ai_usage: {
        Row: {
          cost_micro_usd: number
          day: string
          last_question_at: string | null
          minute_count: number
          minute_window_started_at: string | null
          owner_user_id: string
          questions: number
        }
        Insert: {
          cost_micro_usd?: number
          day: string
          last_question_at?: string | null
          minute_count?: number
          minute_window_started_at?: string | null
          owner_user_id: string
          questions?: number
        }
        Update: {
          cost_micro_usd?: number
          day?: string
          last_question_at?: string | null
          minute_count?: number
          minute_window_started_at?: string | null
          owner_user_id?: string
          questions?: number
        }
        Relationships: []
      }
      owner_alert_log: {
        Row: {
          created_at: string
          dedupe_key: string
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
        }
        Relationships: []
      }
      pm_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          project_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          project_id: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["pm_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["pm_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["pm_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_projects: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          language: string | null
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          language?: string | null
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          language?: string | null
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_projects_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string
          uploader_user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id: string
          uploader_user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          uploader_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_tasks: {
        Row: {
          assignee_user_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          position: number
          project_id: string
          status: Database["public"]["Enums"]["pm_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          position?: number
          project_id: string
          status?: Database["public"]["Enums"]["pm_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          position?: number
          project_id?: string
          status?: Database["public"]["Enums"]["pm_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_tiers: {
        Row: {
          active: boolean
          blurb: string
          category: string
          features: Json
          id: string
          name: string
          popular: boolean
          price_monthly: number
          price_onetime: number
          price_yearly: number
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          blurb?: string
          category?: string
          features?: Json
          id: string
          name: string
          popular?: boolean
          price_monthly?: number
          price_onetime?: number
          price_yearly?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          blurb?: string
          category?: string
          features?: Json
          id?: string
          name?: string
          popular?: boolean
          price_monthly?: number
          price_onetime?: number
          price_yearly?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_feedback: {
        Row: {
          allow_public: boolean
          approved: boolean
          comment: string | null
          created_at: string
          id: string
          nps: number
          public_name: string | null
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_public?: boolean
          approved?: boolean
          comment?: string | null
          created_at?: string
          id?: string
          nps: number
          public_name?: string | null
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_public?: boolean
          approved?: boolean
          comment?: string | null
          created_at?: string
          id?: string
          nps?: number
          public_name?: string | null
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_feedback_prompt: {
        Row: {
          created_at: string
          dismissed_forever: boolean
          snooze_until: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_forever?: boolean
          snooze_until?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_forever?: boolean
          snooze_until?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_update_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          update_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          update_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_update_dismissals_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "product_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_updates: {
        Row: {
          audience_tier: string
          body_html: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          emoji: string | null
          id: string
          published_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_tier?: string
          body_html?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          emoji?: string | null
          id?: string
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_tier?: string
          body_html?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          emoji?: string | null
          id?: string
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          atelier_trial_expires_at: string | null
          atelier_trial_started_at: string | null
          atelier_trial_used: boolean
          avatar_url: string | null
          converter_enabled: boolean
          created_at: string
          deletion_requested_at: string | null
          display_name: string | null
          guest_import_enabled: boolean
          id: string
          notification_prefs: Json
          phone: string | null
          preferred_language: string | null
          referral_code: string | null
          sms_opt_in: boolean
          sms_pack_enabled: boolean
          thank_you_cards_enabled: boolean
          tier: string
        }
        Insert: {
          atelier_trial_expires_at?: string | null
          atelier_trial_started_at?: string | null
          atelier_trial_used?: boolean
          avatar_url?: string | null
          converter_enabled?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name?: string | null
          guest_import_enabled?: boolean
          id: string
          notification_prefs?: Json
          phone?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          sms_opt_in?: boolean
          sms_pack_enabled?: boolean
          thank_you_cards_enabled?: boolean
          tier?: string
        }
        Update: {
          atelier_trial_expires_at?: string | null
          atelier_trial_started_at?: string | null
          atelier_trial_used?: boolean
          avatar_url?: string | null
          converter_enabled?: boolean
          created_at?: string
          deletion_requested_at?: string | null
          display_name?: string | null
          guest_import_enabled?: boolean
          id?: string
          notification_prefs?: Json
          phone?: string | null
          preferred_language?: string | null
          referral_code?: string | null
          sms_opt_in?: boolean
          sms_pack_enabled?: boolean
          thank_you_cards_enabled?: boolean
          tier?: string
        }
        Relationships: []
      }
      purchase_consent_log: {
        Row: {
          consent_text: string
          created_at: string
          environment: string
          event_id: string | null
          id: string
          ip_address: string | null
          price_id: string
          refund_policy_version: string | null
          terms_version: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_text: string
          created_at?: string
          environment?: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          price_id: string
          refund_policy_version?: string | null
          terms_version?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_text?: string
          created_at?: string
          environment?: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          price_id?: string
          refund_policy_version?: string | null
          terms_version?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          credit_granted_at: string | null
          credit_note: string | null
          environment: string
          id: string
          redeemed_at: string
          referred_email_hash: string | null
          referred_user_id: string | null
          referrer_user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          credit_granted_at?: string | null
          credit_note?: string | null
          environment?: string
          id?: string
          redeemed_at?: string
          referred_email_hash?: string | null
          referred_user_id?: string | null
          referrer_user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          credit_granted_at?: string | null
          credit_note?: string | null
          environment?: string
          id?: string
          redeemed_at?: string
          referred_email_hash?: string | null
          referred_user_id?: string | null
          referrer_user_id?: string
        }
        Relationships: []
      }
      refund_copy: {
        Row: {
          footnote: string
          headline: string
          id: boolean
          points: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          footnote: string
          headline: string
          id?: boolean
          points: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          footnote?: string
          headline?: string
          id?: boolean
          points?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      refund_copy_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          footnote: string
          headline: string
          id: string
          points: Json
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          footnote: string
          headline: string
          id?: string
          points: Json
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          footnote?: string
          headline?: string
          id?: string
          points?: Json
        }
        Relationships: []
      }
      refund_log: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          environment: string
          id: string
          pass_id: string | null
          reason: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          pass_id?: string | null
          reason?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          pass_id?: string | null
          reason?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_log_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "one_time_passes"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_invitations: {
        Row: {
          business_name: string | null
          claim_token: string
          claimed_at: string | null
          claimed_vendor_id: string | null
          created_at: string
          decline_reason: string | null
          email: string | null
          external_business_id: string | null
          id: string
          phone: string | null
          responded_at: string | null
          rfq_id: string
          sent_at: string
          status: string
          vendor_id: string | null
        }
        Insert: {
          business_name?: string | null
          claim_token?: string
          claimed_at?: string | null
          claimed_vendor_id?: string | null
          created_at?: string
          decline_reason?: string | null
          email?: string | null
          external_business_id?: string | null
          id?: string
          phone?: string | null
          responded_at?: string | null
          rfq_id: string
          sent_at?: string
          status?: string
          vendor_id?: string | null
        }
        Update: {
          business_name?: string | null
          claim_token?: string
          claimed_at?: string | null
          claimed_vendor_id?: string | null
          created_at?: string
          decline_reason?: string | null
          email?: string | null
          external_business_id?: string | null
          id?: string
          phone?: string | null
          responded_at?: string | null
          rfq_id?: string
          sent_at?: string
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invitations_claimed_vendor_id_fkey"
            columns: ["claimed_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_claimed_vendor_id_fkey"
            columns: ["claimed_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_messages: {
        Row: {
          attachments: Json
          availability_note: string | null
          bid_amount: number | null
          bid_status: string
          body: string
          created_at: string
          id: string
          is_bid: boolean
          rfq_id: string
          sender_user_id: string | null
          vendor_id: string | null
        }
        Insert: {
          attachments?: Json
          availability_note?: string | null
          bid_amount?: number | null
          bid_status?: string
          body: string
          created_at?: string
          id?: string
          is_bid?: boolean
          rfq_id: string
          sender_user_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          attachments?: Json
          availability_note?: string | null
          bid_amount?: number | null
          bid_status?: string
          body?: string
          created_at?: string
          id?: string
          is_bid?: boolean
          rfq_id?: string
          sender_user_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_messages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_messages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_requests: {
        Row: {
          awarded_vendor_id: string | null
          budget_max: number | null
          budget_min: number | null
          category: string | null
          closed_at: string | null
          created_at: string
          event_date: string | null
          event_id: string | null
          guest_count: number | null
          id: string
          location: string | null
          message: string
          requester_user_id: string
          status: string
          subject: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          awarded_vendor_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          event_date?: string | null
          event_id?: string | null
          guest_count?: number | null
          id?: string
          location?: string | null
          message: string
          requester_user_id: string
          status?: string
          subject: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          awarded_vendor_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          event_date?: string | null
          event_id?: string | null
          guest_count?: number | null
          id?: string
          location?: string | null
          message?: string
          requester_user_id?: string
          status?: string
          subject?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_requests_awarded_vendor_id_fkey"
            columns: ["awarded_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_requests_awarded_vendor_id_fkey"
            columns: ["awarded_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_exceptions: {
        Row: {
          action: string
          created_at: string
          id: string
          new_duration_minutes: number | null
          new_start_local: string | null
          note: string | null
          original_local: string
          schedule_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_duration_minutes?: number | null
          new_start_local?: string | null
          note?: string | null
          original_local: string
          schedule_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_duration_minutes?: number | null
          new_start_local?: string | null
          note?: string | null
          original_local?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_occurrences: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          occurrence_local: string
          schedule_id: string
          start_local: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          occurrence_local: string
          schedule_id: string
          start_local: string
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          occurrence_local?: string
          schedule_id?: string
          start_local?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_occurrences_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_people: {
        Row: {
          channel: string
          contact_id: string
          created_at: string
          first_sms_sent_at: string | null
          id: string
          paused: boolean
          removed_at: string | null
          rsvp_token: string
          schedule_id: string
          sms_consent_at: string | null
          sms_consent_by: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          contact_id: string
          created_at?: string
          first_sms_sent_at?: string | null
          id?: string
          paused?: boolean
          removed_at?: string | null
          rsvp_token?: string
          schedule_id: string
          sms_consent_at?: string | null
          sms_consent_by?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          contact_id?: string
          created_at?: string
          first_sms_sent_at?: string | null
          id?: string
          paused?: boolean
          removed_at?: string | null
          rsvp_token?: string
          schedule_id?: string
          sms_consent_at?: string | null
          sms_consent_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_people_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_people_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_reminder_sends: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          due_at: string
          error: string | null
          id: string
          kind: string
          manual_send_id: string | null
          occurrence_id: string
          owner_user_id: string
          person_id: string
          sent_at: string | null
          sms_outbox_id: string | null
          status: string
          step_id: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          due_at: string
          error?: string | null
          id?: string
          kind?: string
          manual_send_id?: string | null
          occurrence_id: string
          owner_user_id: string
          person_id: string
          sent_at?: string | null
          sms_outbox_id?: string | null
          status?: string
          step_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          due_at?: string
          error?: string | null
          id?: string
          kind?: string
          manual_send_id?: string | null
          occurrence_id?: string
          owner_user_id?: string
          person_id?: string
          sent_at?: string | null
          sms_outbox_id?: string | null
          status?: string
          step_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_reminder_sends_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "schedule_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_reminder_sends_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "schedule_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_reminder_sends_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "schedule_reminder_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_reminder_steps: {
        Row: {
          active: boolean
          body: string
          channel: string
          created_at: string
          id: string
          is_starting_now: boolean
          offset_minutes: number
          position: number
          schedule_id: string
          subject: string | null
        }
        Insert: {
          active?: boolean
          body: string
          channel: string
          created_at?: string
          id?: string
          is_starting_now?: boolean
          offset_minutes: number
          position?: number
          schedule_id: string
          subject?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_starting_now?: boolean
          offset_minutes?: number
          position?: number
          schedule_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_reminder_steps_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_rsvp_rate_limit: {
        Row: {
          hits: number
          token_hash: string
          window_start: string
        }
        Insert: {
          hits?: number
          token_hash: string
          window_start: string
        }
        Update: {
          hits?: number
          token_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      schedule_rsvps: {
        Row: {
          answer: string
          answered_at: string
          created_at: string
          id: string
          note: string | null
          occurrence_id: string
          person_id: string
          schedule_id: string
          source: string
          updated_at: string
        }
        Insert: {
          answer: string
          answered_at?: string
          created_at?: string
          id?: string
          note?: string | null
          occurrence_id: string
          person_id: string
          schedule_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          answer?: string
          answered_at?: string
          created_at?: string
          id?: string
          note?: string | null
          occurrence_id?: string
          person_id?: string
          schedule_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_rsvps_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "schedule_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_rsvps_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "schedule_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_rsvps_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          description: string | null
          dial_in: string | null
          dial_pin: string | null
          duration_minutes: number
          ends_kind: string
          horizon_until: string | null
          host_email: string | null
          host_name: string | null
          host_note: string | null
          host_phone: string | null
          id: string
          is_demo: boolean
          join_url: string | null
          kind: string
          location: string | null
          occurrence_count: number | null
          owner_user_id: string
          parent_schedule_id: string | null
          rrule: string | null
          source_id: string | null
          source_type: string | null
          start_local: string
          status: string
          timezone: string
          title: string
          until_local: string | null
          updated_at: string
          welcome_at: string | null
          welcome_body: string | null
          welcome_channel: string
          welcome_enabled: boolean
          welcome_late_joiners: boolean
          welcome_sent_at: string | null
          welcome_subject: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          dial_in?: string | null
          dial_pin?: string | null
          duration_minutes?: number
          ends_kind?: string
          horizon_until?: string | null
          host_email?: string | null
          host_name?: string | null
          host_note?: string | null
          host_phone?: string | null
          id?: string
          is_demo?: boolean
          join_url?: string | null
          kind?: string
          location?: string | null
          occurrence_count?: number | null
          owner_user_id: string
          parent_schedule_id?: string | null
          rrule?: string | null
          source_id?: string | null
          source_type?: string | null
          start_local: string
          status?: string
          timezone?: string
          title: string
          until_local?: string | null
          updated_at?: string
          welcome_at?: string | null
          welcome_body?: string | null
          welcome_channel?: string
          welcome_enabled?: boolean
          welcome_late_joiners?: boolean
          welcome_sent_at?: string | null
          welcome_subject?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          dial_in?: string | null
          dial_pin?: string | null
          duration_minutes?: number
          ends_kind?: string
          horizon_until?: string | null
          host_email?: string | null
          host_name?: string | null
          host_note?: string | null
          host_phone?: string | null
          id?: string
          is_demo?: boolean
          join_url?: string | null
          kind?: string
          location?: string | null
          occurrence_count?: number | null
          owner_user_id?: string
          parent_schedule_id?: string | null
          rrule?: string | null
          source_id?: string | null
          source_type?: string | null
          start_local?: string
          status?: string
          timezone?: string
          title?: string
          until_local?: string | null
          updated_at?: string
          welcome_at?: string | null
          welcome_body?: string | null
          welcome_channel?: string
          welcome_enabled?: boolean
          welcome_late_joiners?: boolean
          welcome_sent_at?: string | null
          welcome_subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_parent_schedule_id_fkey"
            columns: ["parent_schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      showcase_interactions: {
        Row: {
          created_at: string
          id: string
          kind: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          user_id?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          card_campaign: string | null
          card_destination: string | null
          contact_email: string
          id: boolean
          music_studio_public: boolean
          updated_at: string
        }
        Insert: {
          card_campaign?: string | null
          card_destination?: string | null
          contact_email?: string
          id?: boolean
          music_studio_public?: boolean
          updated_at?: string
        }
        Update: {
          card_campaign?: string | null
          card_destination?: string | null
          contact_email?: string
          id?: boolean
          music_studio_public?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sms_consent_log: {
        Row: {
          first_message_sent_at: string
          id: string
          opted_out: boolean
          opted_out_at: string | null
          phone_number: string
        }
        Insert: {
          first_message_sent_at?: string
          id?: string
          opted_out?: boolean
          opted_out_at?: string | null
          phone_number: string
        }
        Update: {
          first_message_sent_at?: string
          id?: string
          opted_out?: boolean
          opted_out_at?: string | null
          phone_number?: string
        }
        Relationships: []
      }
      sms_outbox: {
        Row: {
          body: string
          created_at: string
          error: string | null
          event_id: string
          guest_id: string | null
          guest_name: string | null
          id: string
          provider: string | null
          provider_sid: string | null
          sent_at: string | null
          status: string
          to_phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          event_id: string
          guest_id?: string | null
          guest_name?: string | null
          id?: string
          provider?: string | null
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          to_phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          event_id?: string
          guest_id?: string | null
          guest_name?: string | null
          id?: string
          provider?: string | null
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          to_phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sound_audition_day: {
        Row: {
          day: string
          used: number
          user_id: string
        }
        Insert: {
          day?: string
          used?: number
          user_id: string
        }
        Update: {
          day?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      sound_concierge_requests: {
        Row: {
          brief: string
          budget: string
          contact_email: string
          contact_name: string
          created_at: string
          id: string
          notes: string
          occasion: string
          quoted_cents: number | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brief?: string
          budget?: string
          contact_email: string
          contact_name: string
          created_at?: string
          id?: string
          notes?: string
          occasion?: string
          quoted_cents?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brief?: string
          budget?: string
          contact_email?: string
          contact_name?: string
          created_at?: string
          id?: string
          notes?: string
          occasion?: string
          quoted_cents?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sound_piece_purchases: {
        Row: {
          amount_cents: number
          created_at: string
          credit_unused: boolean
          ecard_id: string | null
          environment: string
          event_id: string | null
          id: string
          last_error: string | null
          piece_id: string | null
          price_key: string
          refund_id: string | null
          refund_reason: string | null
          refunded_at: string | null
          render_attempts: number
          seconds: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          credit_unused?: boolean
          ecard_id?: string | null
          environment?: string
          event_id?: string | null
          id?: string
          last_error?: string | null
          piece_id?: string | null
          price_key: string
          refund_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          render_attempts?: number
          seconds?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credit_unused?: boolean
          ecard_id?: string | null
          environment?: string
          event_id?: string | null
          id?: string
          last_error?: string | null
          piece_id?: string | null
          price_key?: string
          refund_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          render_attempts?: number
          seconds?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sound_piece_purchases_ecard_id_fkey"
            columns: ["ecard_id"]
            isOneToOne: false
            referencedRelation: "ecards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sound_piece_purchases_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "sound_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      sound_piece_sources: {
        Row: {
          created_at: string
          id: string
          piece_id: string
          position: number
          source_piece_id: string
          took: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          piece_id: string
          position?: number
          source_piece_id: string
          took?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          piece_id?: string
          position?: number
          source_piece_id?: string
          took?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sound_piece_sources_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "sound_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sound_piece_sources_source_piece_id_fkey"
            columns: ["source_piece_id"]
            isOneToOne: false
            referencedRelation: "sound_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      sound_pieces: {
        Row: {
          bpm: number | null
          created_at: string
          eleven_song_id: string | null
          energy: number | null
          event_id: string | null
          id: string
          intro_ms: number | null
          is_demo: boolean
          is_sample: boolean
          kind: string
          licence: string
          loop_ready: boolean
          origin: string
          outro_ms: number | null
          parent_seconds: number | null
          plan_json: Json | null
          prompt: string | null
          remix_of: string | null
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          seconds: number
          settings: Json
          share_slug: string | null
          share_token: string
          source_sample: string | null
          storage_bucket: string
          storage_path: string
          title: string
          updated_at: string
          user_id: string
          wall_music_id: string | null
          words: string
        }
        Insert: {
          bpm?: number | null
          created_at?: string
          eleven_song_id?: string | null
          energy?: number | null
          event_id?: string | null
          id?: string
          intro_ms?: number | null
          is_demo?: boolean
          is_sample?: boolean
          kind?: string
          licence?: string
          loop_ready?: boolean
          origin?: string
          outro_ms?: number | null
          parent_seconds?: number | null
          plan_json?: Json | null
          prompt?: string | null
          remix_of?: string | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          seconds?: number
          settings?: Json
          share_slug?: string | null
          share_token?: string
          source_sample?: string | null
          storage_bucket?: string
          storage_path: string
          title?: string
          updated_at?: string
          user_id: string
          wall_music_id?: string | null
          words?: string
        }
        Update: {
          bpm?: number | null
          created_at?: string
          eleven_song_id?: string | null
          energy?: number | null
          event_id?: string | null
          id?: string
          intro_ms?: number | null
          is_demo?: boolean
          is_sample?: boolean
          kind?: string
          licence?: string
          loop_ready?: boolean
          origin?: string
          outro_ms?: number | null
          parent_seconds?: number | null
          plan_json?: Json | null
          prompt?: string | null
          remix_of?: string | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          seconds?: number
          settings?: Json
          share_slug?: string | null
          share_token?: string
          source_sample?: string | null
          storage_bucket?: string
          storage_path?: string
          title?: string
          updated_at?: string
          user_id?: string
          wall_music_id?: string | null
          words?: string
        }
        Relationships: [
          {
            foreignKeyName: "sound_pieces_remix_of_fkey"
            columns: ["remix_of"]
            isOneToOne: false
            referencedRelation: "sound_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sound_pieces_wall_music_id_fkey"
            columns: ["wall_music_id"]
            isOneToOne: false
            referencedRelation: "event_wall_music"
            referencedColumns: ["id"]
          },
        ]
      }
      sound_playlist_items: {
        Row: {
          created_at: string
          id: string
          piece_id: string
          playlist_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          piece_id: string
          playlist_id: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          piece_id?: string
          playlist_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "sound_playlist_items_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "sound_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sound_playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "sound_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      sound_playlists: {
        Row: {
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          name: string
          share_slug: string | null
          share_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          name: string
          share_slug?: string | null
          share_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          name?: string
          share_slug?: string | null
          share_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sound_safety_refusals: {
        Row: {
          categories: string[]
          created_at: string
          id: string
          stage: string
          user_id: string | null
        }
        Insert: {
          categories?: string[]
          created_at?: string
          id?: string
          stage: string
          user_id?: string | null
        }
        Update: {
          categories?: string[]
          created_at?: string
          id?: string
          stage?: string
          user_id?: string | null
        }
        Relationships: []
      }
      storage_backup_objects: {
        Row: {
          bucket_id: string
          content_type: string | null
          copied_at: string | null
          created_at: string
          deleted_at: string | null
          error: string | null
          etag: string | null
          id: string
          mirror_path: string
          object_path: string
          purge_after: string | null
          size: number
          source_updated_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          content_type?: string | null
          copied_at?: string | null
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          etag?: string | null
          id?: string
          mirror_path: string
          object_path: string
          purge_after?: string | null
          size?: number
          source_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          content_type?: string | null
          copied_at?: string | null
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          etag?: string | null
          id?: string
          mirror_path?: string
          object_path?: string
          purge_after?: string | null
          size?: number
          source_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      support_rate_limit: {
        Row: {
          count: number
          ip_hash: string
          window_start: string
        }
        Insert: {
          count?: number
          ip_hash: string
          window_start: string
        }
        Update: {
          count?: number
          ip_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          ai_draft: string | null
          contact_email: string
          contact_name: string | null
          created_at: string
          final_reply: string | null
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_draft?: string | null
          contact_email: string
          contact_name?: string | null
          created_at?: string
          final_reply?: string | null
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_draft?: string | null
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          final_reply?: string | null
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          frequency: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          frequency?: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          frequency?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      thank_you_links: {
        Row: {
          card_id: string
          created_at: string
          created_by: string
          event_id: string
          guest_id: string
          open_count: number
          opened_at: string | null
          token: string
        }
        Insert: {
          card_id: string
          created_at?: string
          created_by: string
          event_id: string
          guest_id: string
          open_count?: number
          opened_at?: string | null
          token: string
        }
        Update: {
          card_id?: string
          created_at?: string
          created_by?: string
          event_id?: string
          guest_id?: string
          open_count?: number
          opened_at?: string | null
          token?: string
        }
        Relationships: []
      }
      trial_attempts: {
        Row: {
          created_at: string
          device_hash: string | null
          email_hash: string | null
          environment: string
          id: string
          ip_hash: string | null
          outcome: string
          reason: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_hash?: string | null
          email_hash?: string | null
          environment?: string
          id?: string
          ip_hash?: string | null
          outcome: string
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_hash?: string | null
          email_hash?: string | null
          environment?: string
          id?: string
          ip_hash?: string | null
          outcome?: string
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trial_claims: {
        Row: {
          created_at: string
          device_hash: string | null
          email_domain: string | null
          email_hash: string
          environment: string
          id: string
          ip_hash: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_hash?: string | null
          email_domain?: string | null
          email_hash: string
          environment?: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_hash?: string | null
          email_domain?: string | null
          email_hash?: string
          environment?: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_known_devices: {
        Row: {
          device_hash: string
          first_seen_at: string
          id: string
          ip_hash: string | null
          label: string | null
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_hash: string
          first_seen_at?: string
          id?: string
          ip_hash?: string | null
          label?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_hash?: string
          first_seen_at?: string
          id?: string
          ip_hash?: string | null
          label?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          rating: number
          reviewer_user_id: string
          vendor_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewer_user_id: string
          vendor_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewer_user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_search_cache: {
        Row: {
          fetched_at: string
          payload: Json
          query_hash: string
        }
        Insert: {
          fetched_at?: string
          payload: Json
          query_hash: string
        }
        Update: {
          fetched_at?: string
          payload?: Json
          query_hash?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          bio: string | null
          category: string
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          gallery: Json
          hero_image: string | null
          id: string
          is_demo: boolean
          logo_url: string | null
          name: string
          owner_user_id: string
          phone: string | null
          price_range: string | null
          region: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          show_address: boolean
          show_phone: boolean
          slug: string
          status: string
          updated_at: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          category: string
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          gallery?: Json
          hero_image?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name: string
          owner_user_id: string
          phone?: string | null
          price_range?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          show_address?: boolean
          show_phone?: boolean
          slug: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          gallery?: Json
          hero_image?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          phone?: string | null
          price_range?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          show_address?: boolean
          show_phone?: boolean
          slug?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      ventures: {
        Row: {
          accent: string | null
          category: string
          category_order: number
          created_at: string
          cta_label: string
          href: string
          id: string
          is_external: boolean
          name: string
          sort_order: number
          status: string
          tagline: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          accent?: string | null
          category?: string
          category_order?: number
          created_at?: string
          cta_label: string
          href: string
          id?: string
          is_external?: boolean
          name: string
          sort_order?: number
          status?: string
          tagline: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          accent?: string | null
          category?: string
          category_order?: number
          created_at?: string
          cta_label?: string
          href?: string
          id?: string
          is_external?: boolean
          name?: string
          sort_order?: number
          status?: string
          tagline?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      active_ad_placements: {
        Row: {
          blurb: string | null
          created_at: string | null
          cta_url: string | null
          headline: string | null
          hero_image: string | null
          id: string | null
          region: string | null
          status: string | null
          tier: string | null
          vendor_id: string | null
        }
        Insert: {
          blurb?: string | null
          created_at?: string | null
          cta_url?: string | null
          headline?: string | null
          hero_image?: string | null
          id?: string | null
          region?: string | null
          status?: string | null
          tier?: string | null
          vendor_id?: string | null
        }
        Update: {
          blurb?: string | null
          created_at?: string | null
          cta_url?: string | null
          headline?: string | null
          hero_image?: string | null
          id?: string | null
          region?: string | null
          status?: string | null
          tier?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_placements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_placements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reviews_public: {
        Row: {
          body: string | null
          created_at: string | null
          id: string | null
          rating: number | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors_public: {
        Row: {
          bio: string | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string | null
          gallery: Json | null
          hero_image: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          price_range: string | null
          public_address: string | null
          public_phone: string | null
          region: string | null
          slug: string | null
          status: string | null
          verified_at: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          gallery?: Json | null
          hero_image?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          price_range?: string | null
          public_address?: never
          public_phone?: never
          region?: string | null
          slug?: string | null
          status?: string | null
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          gallery?: Json | null
          hero_image?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          price_range?: string | null
          public_address?: never
          public_phone?: never
          region?: string | null
          slug?: string | null
          status?: string | null
          verified_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_event_member_invite: { Args: { _token: string }; Returns: string }
      access_drift: {
        Args: never
        Returns: {
          issue: string
          object: string
        }[]
      }
      add_ecard_contribution: {
        Args: {
          _audio_url?: string
          _contributor_name: string
          _gif_url?: string
          _image_url?: string
          _media_type?: string
          _media_url?: string
          _message: string
          _slug: string
          _video_url?: string
        }
        Returns: Json
      }
      add_well_wish: {
        Args: { _event_id: string; _message: string; _name: string }
        Returns: Json
      }
      adopt_showcase_event: { Args: { _owner: string }; Returns: undefined }
      attach_pass_to_event: {
        Args: { _event_id: string; _pass_id: string }
        Returns: Json
      }
      backup_health: {
        Args: never
        Returns: {
          bytes: number
          hours_since: number
          kind: string
          last_success_at: string
          object_count: number
          row_count: number
          stale: boolean
          table_count: number
        }[]
      }
      branded_slug_available: {
        Args: { _except_event_id?: string; _slug: string }
        Returns: boolean
      }
      can_edit_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      can_use_schedules: { Args: { _uid: string }; Returns: boolean }
      cancel_account_deletion: { Args: never; Returns: boolean }
      check_auth_rate_limit: {
        Args: { _key: string; _max?: number; _window_minutes?: number }
        Returns: boolean
      }
      check_event_photo_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      claim_ai_packages_trial: { Args: { _user_id: string }; Returns: string }
      claim_atelier_trial: {
        Args: {
          _device_hash: string
          _email_domain: string
          _email_hash: string
          _environment?: string
          _ip_hash: string
          _user_agent: string
          _user_id: string
        }
        Returns: Json
      }
      claim_bring_item: {
        Args: { _dish: string; _item_id: string; _name: string; _note: string }
        Returns: Json
      }
      claim_first_admin: { Args: never; Returns: boolean }
      claim_invite_narration: {
        Args: {
          _chars: number
          _event_id: string
          _hash: string
          _script: string
          _voice_id: string
        }
        Returns: {
          ready: boolean
          seconds: number
          should_generate: boolean
          storage_path: string
          voice_id: string
        }[]
      }
      claim_manual_schedule_send: {
        Args: {
          _body: string
          _channel: string
          _due_at: string
          _manual_send_id: string
          _occurrence_id: string
          _owner: string
          _person_id: string
          _status: string
          _subject: string
        }
        Returns: {
          is_new: boolean
          prior_at: string
          prior_error: string
          prior_status: string
          send_id: string
        }[]
      }
      claim_owner_ai_action: {
        Args: { _action_id: string; _approver: string; _approver_email: string }
        Returns: {
          amount_cents: number | null
          approved_at: string | null
          approved_by_email: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_email: string | null
          created_by_user_id: string
          error: string | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          kind: string
          payload: Json
          reject_reason: string | null
          rejected_at: string | null
          rejected_by_email: string | null
          rejected_by_user_id: string | null
          requires_amount_confirmation: boolean
          status: string
          summary: string
          target_label: string | null
          target_user_id: string | null
          thread_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "owner_ai_actions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_ai_credit: {
        Args: { _pass_id: string; _user: string }
        Returns: number
      }
      current_auth_aal: { Args: never; Returns: string }
      decline_rfq_invitation_by_token: {
        Args: { _reason?: string; _token: string }
        Returns: Json
      }
      delete_ecard_contribution_by_token: {
        Args: { _token: string }
        Returns: Json
      }
      ecard_has_profanity: { Args: { _text: string }; Returns: boolean }
      ecard_make_token: { Args: never; Returns: string }
      ecard_owner_id: { Args: { _ecard_id: string }; Returns: string }
      ecard_slug_upload_allowed: { Args: { _slug: string }; Returns: boolean }
      event_collaborator_role: {
        Args: { _event_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["event_member_role"]
      }
      event_confirmed_headcount: {
        Args: { _data: Json; _exclude_guest?: string }
        Returns: number
      }
      finish_invite_narration: {
        Args: {
          _event_id: string
          _hash: string
          _path: string
          _seconds: number
          _voice_id: string
        }
        Returns: undefined
      }
      get_cron_shared_secret: { Args: never; Returns: string }
      get_ecard_by_slug: { Args: { _slug: string }; Returns: Json }
      get_ecard_contribution_by_token: {
        Args: { _token: string }
        Returns: Json
      }
      get_ecard_music: {
        Args: { _slug: string }
        Returns: {
          id: string
          kind: string
          seconds: number
          storage_path: string
          title: string
          words: string
        }[]
      }
      get_ecard_reveal: { Args: { _slug: string }; Returns: Json }
      get_event_comments_for_guest: {
        Args: { _event_id: string; _guest_id: string }
        Returns: Json
      }
      get_event_member_invite: { Args: { _token: string }; Returns: Json }
      get_event_owner_id: { Args: { _id: string }; Returns: string }
      get_event_public_entitlements: {
        Args: { _event_id: string }
        Returns: Json
      }
      get_or_create_my_referral_code: { Args: never; Returns: string }
      get_package_public_entitlements: {
        Args: { _token: string }
        Returns: Json
      }
      get_public_bring_sheet: { Args: { _event_id: string }; Returns: Json }
      get_public_event_announcements: {
        Args: { _event_id: string }
        Returns: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          body: string
          event_id: string
          event_title: string
          id: string
          link_label: string
          link_url: string
          sent_at: string
          title: string
          type: Database["public"]["Enums"]["announcement_type"]
        }[]
      }
      get_public_event_by_id: { Args: { _id: string }; Returns: Json }
      get_public_event_by_slug: { Args: { _slug: string }; Returns: Json }
      get_public_event_photos: {
        Args: { _event_id: string }
        Returns: {
          created_at: string
          id: string
          storage_path: string
          uploader_label: string
        }[]
      }
      get_public_series_events: { Args: { _event_id: string }; Returns: Json }
      get_public_testimonials: {
        Args: { _limit?: number }
        Returns: {
          comment: string
          created_at: string
          public_name: string
          rating: number
        }[]
      }
      get_public_well_wishes: { Args: { _event_id: string }; Returns: Json }
      get_rfq_by_token: { Args: { _token: string }; Returns: Json }
      get_shared_ai_package: {
        Args: { p_token: string }
        Returns: {
          attachments: Json
          budget_cents: number | null
          content: Json
          created_at: string
          event_id: string | null
          guest_count: number | null
          id: string
          kind: string
          model: string | null
          project_id: string | null
          prompt: string
          share_token: string | null
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_packages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_design: {
        Args: { p_token: string }
        Returns: {
          content: Json
          created_at: string
          environment: string
          event_id: string | null
          id: string
          kind: string
          share_token: string | null
          template_id: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "design_assets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_playlist: {
        Args: { _key: string }
        Returns: {
          bpm: number
          description: string
          energy: number
          host_name: string
          item_position: number
          kind: string
          piece_id: string
          playlist_id: string
          playlist_name: string
          seconds: number
          storage_bucket: string
          storage_path: string
          title: string
        }[]
      }
      get_shared_sound_piece: {
        Args: { _key: string }
        Returns: {
          created_at: string
          event_title: string
          host_name: string
          id: string
          kind: string
          licence: string
          seconds: number
          storage_bucket: string
          storage_path: string
          title: string
          words: string
        }[]
      }
      get_sound_piece_by_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          id: string
          kind: string
          licence: string
          seconds: number
          storage_path: string
          title: string
        }[]
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_ai_packages_access: {
        Args: { _event_id?: string; _project_id?: string; _user_id: string }
        Returns: boolean
      }
      has_event_addon: {
        Args: { _addon_key: string; _environment?: string; _event_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_verified_mfa: { Args: { _user_id: string }; Returns: boolean }
      i_can_use_schedules: { Args: never; Returns: boolean }
      increment_discount_usage: {
        Args: { discount_code: string }
        Returns: undefined
      }
      is_demo_user: { Args: { _user_id: string }; Returns: boolean }
      is_event_collaborator: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_showcase_event: { Args: { _event_id: string }; Returns: boolean }
      is_vendor_owner: {
        Args: { _user_id: string; _vendor_id: string }
        Returns: boolean
      }
      is_verified_vendor_owner: {
        Args: { _user_id: string; _vendor_id: string }
        Returns: boolean
      }
      list_backup_buckets: { Args: never; Returns: string[] }
      list_backup_tables: { Args: never; Returns: string[] }
      list_storage_objects: {
        Args: { _bucket: string }
        Returns: {
          content_type: string
          etag: string
          object_path: string
          size: number
          updated_at: string
        }[]
      }
      mark_ecard_music_heard: { Args: { _slug: string }; Returns: undefined }
      mark_pass_material_use: {
        Args: { _event_id: string; _reason?: string; _user: string }
        Returns: undefined
      }
      mark_pass_material_use_by_event: {
        Args: { _event_id: string; _reason?: string }
        Returns: undefined
      }
      owner_analytics_snapshot:
        | { Args: { _since: string }; Returns: Json }
        | { Args: { _since: string; _until: string }; Returns: Json }
      owner_analytics_snapshot_v2: {
        Args: {
          _exclude_user_id: string
          _only_user_id: string
          _since: string
          _until: string
        }
        Returns: Json
      }
      owner_analytics_snapshot_v3: {
        Args: {
          _exclude_user_ids: string[]
          _only_user_id: string
          _since: string
          _until: string
        }
        Returns: Json
      }
      owner_contacts_snapshot:
        | { Args: { _since: string }; Returns: Json }
        | { Args: { _since: string; _until: string }; Returns: Json }
      owner_contacts_snapshot_v2: {
        Args: {
          _exclude_user_id: string
          _only_user_id: string
          _since: string
          _until: string
        }
        Returns: Json
      }
      owner_contacts_snapshot_v3: {
        Args: {
          _exclude_user_ids: string[]
          _only_user_id: string
          _since: string
          _until: string
        }
        Returns: Json
      }
      owns_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      owns_rfq_target_vendor: {
        Args: { _rfq_id: string; _user_id: string }
        Returns: boolean
      }
      owns_schedule: { Args: { _sid: string }; Returns: boolean }
      pass_active_for_event: {
        Args: { _event: string; _tier: string; _user: string }
        Returns: boolean
      }
      pm_can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      pm_can_link_events: { Args: { _user_id: string }; Returns: boolean }
      pm_has_events_access: { Args: { _user_id: string }; Returns: boolean }
      pm_is_project_admin: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      pm_is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      pm_project_is_linked_to_event: {
        Args: { _event_id: string; _project_id: string }
        Returns: boolean
      }
      post_event_comment: {
        Args: {
          _body: string
          _event_id: string
          _flagged?: boolean
          _guest_id: string
          _guest_name: string
          _visibility: string
        }
        Returns: Json
      }
      post_rfq_bid_by_token: {
        Args: {
          _availability_note: string
          _bid_amount: number
          _body: string
          _token: string
        }
        Returns: Json
      }
      profile_entitlements_unchanged: {
        Args: {
          _atelier_trial_expires_at: string
          _atelier_trial_used: boolean
          _converter_enabled: boolean
          _guest_import_enabled: boolean
          _id: string
          _sms_pack_enabled: boolean
          _thank_you_cards_enabled: boolean
          _tier: string
        }
        Returns: boolean
      }
      prune_app_error_logs: { Args: never; Returns: number }
      public_add_walkin: {
        Args: {
          _adults?: number
          _children?: number
          _event_id: string
          _name: string
          _note?: string
          _share_token?: string
        }
        Returns: Json
      }
      public_self_add_guest: {
        Args: {
          _email?: string
          _event_id: string
          _name: string
          _phone?: string
        }
        Returns: Json
      }
      public_set_checkin: {
        Args: {
          _checked_in: boolean
          _event_id: string
          _guest_id: string
          _heads?: number
          _note?: string
          _share_token?: string
        }
        Returns: Json
      }
      public_update_guest: {
        Args: { _event_id: string; _guest_id: string; _patch: Json }
        Returns: Json
      }
      record_card_scan:
        | {
            Args: { _destination: string; _source?: string }
            Returns: undefined
          }
        | {
            Args: {
              _action?: string
              _card_slug?: string
              _destination: string
              _source?: string
            }
            Returns: undefined
          }
      record_invite_open: {
        Args: { _event_id: string; _guest_id: string }
        Returns: undefined
      }
      record_referral_redemption: {
        Args: {
          _code: string
          _environment?: string
          _referred_email_hash?: string
          _referred_user_id: string
        }
        Returns: string
      }
      record_stale_backup_notices: { Args: never; Returns: undefined }
      release_bring_claim_by_token: {
        Args: { _id: string; _token: string }
        Returns: Json
      }
      request_account_deletion: { Args: never; Returns: string }
      request_guest_addition: {
        Args: {
          _contact: string
          _event_id: string
          _name: string
          _note?: string
          _party_size?: number
        }
        Returns: Json
      }
      restore_demo_event_snapshot: {
        Args: { _event_id: string }
        Returns: undefined
      }
      restore_showcase_samples: {
        Args: {
          _bring_items: Json
          _comments: Json
          _photos: Json
          _wishes: Json
        }
        Returns: undefined
      }
      rfq_invited_vendor_owner: {
        Args: { _rfq_id: string; _user_id: string }
        Returns: boolean
      }
      sms_mark_opt_in: { Args: { _phone: string }; Returns: undefined }
      sms_mark_opt_out: { Args: { _phone: string }; Returns: undefined }
      sound_share_suffix: { Args: never; Returns: string }
      sound_slugify: { Args: { _text: string }; Returns: string }
      sound_take_audition: {
        Args: { _limit: number; _user_id: string }
        Returns: number
      }
      suggest_bring_item: {
        Args: {
          _category: string
          _event_id: string
          _guest_name: string
          _item_name: string
          _note: string
          _serves: number
        }
        Returns: Json
      }
      super_admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: boolean
      }
      support_chat_rate_check: {
        Args: { _ip_hash: string; _max_per_minute?: number }
        Returns: boolean
      }
      update_bring_claim_by_token: {
        Args: {
          _dish: string
          _id: string
          _name: string
          _note: string
          _token: string
        }
        Returns: Json
      }
      update_ecard_contribution_by_token: {
        Args: {
          _audio_url?: string
          _gif_url?: string
          _image_url?: string
          _media_type?: string
          _media_url?: string
          _message: string
          _token: string
          _video_url?: string
        }
        Returns: Json
      }
      validate_discount_code:
        | { Args: { p_code: string; p_tier_id: string }; Returns: Json }
        | {
            Args: { p_code: string; p_tier_id: string; p_user_id: string }
            Returns: Json
          }
    }
    Enums: {
      announcement_audience: "all_users" | "event"
      announcement_status: "draft" | "scheduled" | "sent"
      announcement_type:
        | "venue_change"
        | "cancellation"
        | "date_change"
        | "general"
      app_role: "admin" | "user" | "owner" | "super_admin"
      event_member_role: "cohost" | "viewer"
      pm_member_role: "admin" | "editor" | "viewer"
      pm_task_status: "todo" | "in_progress" | "blocked" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_audience: ["all_users", "event"],
      announcement_status: ["draft", "scheduled", "sent"],
      announcement_type: [
        "venue_change",
        "cancellation",
        "date_change",
        "general",
      ],
      app_role: ["admin", "user", "owner", "super_admin"],
      event_member_role: ["cohost", "viewer"],
      pm_member_role: ["admin", "editor", "viewer"],
      pm_task_status: ["todo", "in_progress", "blocked", "done"],
    },
  },
} as const
