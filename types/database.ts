// Generated from Supabase public schema; scoped to supabase/baseline/schema.sql.
// Regenerate with npm run db:types -- <project-ref>. Do not edit manually.
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
      attachments: {
        Row: {
          attachable_id: string
          attachable_type: Database["public"]["Enums"]["attachable_type"]
          created_at: string | null
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          attachable_id: string
          attachable_type: Database["public"]["Enums"]["attachable_type"]
          created_at?: string | null
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          attachable_id?: string
          attachable_type?: Database["public"]["Enums"]["attachable_type"]
          created_at?: string | null
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      babysitter_availability_entries: {
        Row: {
          created_at: string | null
          end_time: string
          entry_date: string
          id: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          entry_date: string
          id?: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          entry_date?: string
          id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "babysitter_availability_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      babysitter_availability_templates: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "babysitter_availability_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      babysitter_availability_weeks: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "babysitter_availability_weeks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      babysitter_booking_requests: {
        Row: {
          babysitter_id: string
          created_at: string | null
          created_by: string | null
          end_time: string
          id: string
          note: string | null
          one_off_id: string | null
          request_date: string
          responded_at: string | null
          start_time: string
          status: string
          updated_at: string | null
        }
        Insert: {
          babysitter_id: string
          created_at?: string | null
          created_by?: string | null
          end_time: string
          id?: string
          note?: string | null
          one_off_id?: string | null
          request_date: string
          responded_at?: string | null
          start_time: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          babysitter_id?: string
          created_at?: string | null
          created_by?: string | null
          end_time?: string
          id?: string
          note?: string | null
          one_off_id?: string | null
          request_date?: string
          responded_at?: string | null
          start_time?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "babysitter_booking_requests_babysitter_id_fkey"
            columns: ["babysitter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "babysitter_booking_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "babysitter_booking_requests_one_off_id_fkey"
            columns: ["one_off_id"]
            isOneToOne: false
            referencedRelation: "schedule_one_offs"
            referencedColumns: ["id"]
          },
        ]
      }
      child_logs: {
        Row: {
          category: Database["public"]["Enums"]["child_log_category"]
          child: Database["public"]["Enums"]["child_name"]
          created_at: string | null
          description: string | null
          end_time: string | null
          id: string
          log_date: string
          log_time: string
          logged_by: string | null
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["child_log_category"]
          child: Database["public"]["Enums"]["child_name"]
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          log_date?: string
          log_time: string
          logged_by?: string | null
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["child_log_category"]
          child?: Database["public"]["Enums"]["child_name"]
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          log_date?: string
          log_time?: string
          logged_by?: string | null
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_group_memberships: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "employee_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_group_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_groups: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      employee_profiles: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          emergency_contact: string | null
          hire_date: string | null
          id: string
          important_dates: Json | null
          notes: string | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          emergency_contact?: string | null
          hire_date?: string | null
          id?: string
          important_dates?: Json | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          emergency_contact?: string | null
          hire_date?: string | null
          id?: string
          important_dates?: Json | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          start_time: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          start_time: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          start_time?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      food_note_responses: {
        Row: {
          food_request_id: string | null
          id: string
          menu_rating_id: string | null
          note_revision: string
          received_at: string
          replied_at: string | null
          reply: string | null
          responded_by: string
        }
        Insert: {
          food_request_id?: string | null
          id?: string
          menu_rating_id?: string | null
          note_revision: string
          received_at?: string
          replied_at?: string | null
          reply?: string | null
          responded_by: string
        }
        Update: {
          food_request_id?: string | null
          id?: string
          menu_rating_id?: string | null
          note_revision?: string
          received_at?: string
          replied_at?: string | null
          reply?: string | null
          responded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_note_responses_food_request_id_fkey"
            columns: ["food_request_id"]
            isOneToOne: false
            referencedRelation: "food_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_note_responses_menu_rating_id_fkey"
            columns: ["menu_rating_id"]
            isOneToOne: false
            referencedRelation: "menu_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_note_responses_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      food_requests: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          food_name: string
          id: string
          menu_item_id: string | null
          note_revision: string
          notes: string | null
          recipe_id: string | null
          requested_by: string
          status: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          food_name: string
          id?: string
          menu_item_id?: string | null
          note_revision?: string
          notes?: string | null
          recipe_id?: string | null
          requested_by: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          food_name?: string
          id?: string
          menu_item_id?: string | null
          note_revision?: string
          notes?: string | null
          recipe_id?: string | null
          requested_by?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_requests_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_requests_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_requests_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_synced_events: {
        Row: {
          created_at: string | null
          event_type: string
          google_event_id: string
          id: string
          source_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          google_event_id: string
          id?: string
          source_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          google_event_id?: string
          id?: string
          source_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_synced_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string | null
          created_at: string | null
          google_email: string | null
          id: string
          last_synced: string | null
          refresh_token: string
          sync_filters: Json | null
          token_expiry: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          created_at?: string | null
          google_email?: string | null
          id?: string
          last_synced?: string | null
          refresh_token: string
          sync_filters?: Json | null
          token_expiry: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          created_at?: string | null
          google_email?: string | null
          id?: string
          last_synced?: string | null
          refresh_token?: string
          sync_filters?: Json | null
          token_expiry?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balance_effects: {
        Row: {
          days: number
          kind: string
          request_id: string
          year: number
        }
        Insert: {
          days: number
          kind: string
          request_id: string
          year: number
        }
        Update: {
          days?: number
          kind?: string
          request_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balance_effects_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string | null
          id: string
          sick_total: number | null
          sick_used: number | null
          updated_at: string | null
          user_id: string | null
          vacation_total: number | null
          vacation_used: number | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          sick_total?: number | null
          sick_used?: number | null
          updated_at?: string | null
          user_id?: string | null
          vacation_total?: number | null
          vacation_used?: number | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          sick_total?: number | null
          sick_used?: number | null
          updated_at?: string | null
          user_id?: string | null
          vacation_total?: number | null
          vacation_used?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          end_date: string
          end_time: string | null
          id: string
          is_full_day: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selected_dates: string[] | null
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["leave_status"] | null
          total_days: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          is_full_day?: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_dates?: string[] | null
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["leave_status"] | null
          total_days?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          is_full_day?: boolean | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_dates?: string[] | null
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["leave_status"] | null
          total_days?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_merge_events: {
        Row: {
          affected_rating_ids: string[]
          affected_request_ids: string[]
          created_at: string | null
          id: string
          merge_note: string | null
          merged_at: string
          merged_by: string | null
          source_item_id: string
          source_name: string
          target_item_id: string
          target_name: string
          undo_note: string | null
          undone_at: string | null
          undone_by: string | null
          updated_at: string | null
        }
        Insert: {
          affected_rating_ids?: string[]
          affected_request_ids?: string[]
          created_at?: string | null
          id?: string
          merge_note?: string | null
          merged_at?: string
          merged_by?: string | null
          source_item_id: string
          source_name: string
          target_item_id: string
          target_name: string
          undo_note?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_rating_ids?: string[]
          affected_request_ids?: string[]
          created_at?: string | null
          id?: string
          merge_note?: string | null
          merged_at?: string
          merged_by?: string | null
          source_item_id?: string
          source_name?: string
          target_item_id?: string
          target_name?: string
          undo_note?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_merge_events_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_merge_events_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_merge_events_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_merge_events_undone_by_fkey"
            columns: ["undone_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_merges: {
        Row: {
          canonical_name: string
          created_at: string | null
          id: string
          merge_note: string | null
          merged_at: string | null
          merged_by: string | null
          source_name: string
          unmerge_note: string | null
          unmerged_at: string | null
          unmerged_by: string | null
          updated_at: string | null
        }
        Insert: {
          canonical_name: string
          created_at?: string | null
          id?: string
          merge_note?: string | null
          merged_at?: string | null
          merged_by?: string | null
          source_name: string
          unmerge_note?: string | null
          unmerged_at?: string | null
          unmerged_by?: string | null
          updated_at?: string | null
        }
        Update: {
          canonical_name?: string
          created_at?: string | null
          id?: string
          merge_note?: string | null
          merged_at?: string | null
          merged_by?: string | null
          source_name?: string
          unmerge_note?: string | null
          unmerged_at?: string | null
          unmerged_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_merges_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_merges_unmerged_by_fkey"
            columns: ["unmerged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_tags: {
        Row: {
          created_at: string | null
          menu_item_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          menu_item_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          menu_item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_tags_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "menu_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          aliases: string[]
          average_rating: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          last_served_at: string | null
          meal_types: string[]
          merge_note: string | null
          merged_at: string | null
          merged_by: string | null
          merged_into_id: string | null
          name: string
          normalized_name: string
          search_text: string | null
          times_served: number | null
          total_ratings: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          average_rating?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          last_served_at?: string | null
          meal_types?: string[]
          merge_note?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          name: string
          normalized_name: string
          search_text?: string | null
          times_served?: number | null
          total_ratings?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          aliases?: string[]
          average_rating?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          last_served_at?: string | null
          meal_types?: string[]
          merge_note?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          name?: string
          normalized_name?: string
          search_text?: string | null
          times_served?: number | null
          total_ratings?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_ratings: {
        Row: {
          comment: string | null
          created_at: string | null
          day_of_week: string
          id: string
          meal_type: string
          menu_item: string
          menu_item_id: string | null
          note_revision: string
          rated_by: string
          rating: number
          updated_at: string | null
          week_start: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          day_of_week: string
          id?: string
          meal_type: string
          menu_item: string
          menu_item_id?: string | null
          note_revision?: string
          rated_by: string
          rating: number
          updated_at?: string | null
          week_start: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          day_of_week?: string
          id?: string
          meal_type?: string
          menu_item?: string
          menu_item_id?: string | null
          note_revision?: string
          rated_by?: string
          rating?: number
          updated_at?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_ratings_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_ratings_rated_by_fkey"
            columns: ["rated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_tag_groups: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_tag_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_tags: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          group_id: string
          id: string
          label: string | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          group_id: string
          id?: string
          label?: string | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          group_id?: string
          id?: string
          label?: string | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "menu_tag_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_media: {
        Row: {
          created_at: string | null
          created_by: string | null
          file_name: string | null
          file_size: number | null
          id: string
          is_hero: boolean | null
          media_type: string
          mime_type: string | null
          recipe_id: string
          sort_order: number | null
          storage_type: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_hero?: boolean | null
          media_type: string
          mime_type?: string | null
          recipe_id: string
          sort_order?: number | null
          storage_type: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_hero?: boolean | null
          media_type?: string
          mime_type?: string | null
          recipe_id?: string
          sort_order?: number | null
          storage_type?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_media_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          cook_time_minutes: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          description_es: string | null
          description_zh: string | null
          id: string
          ingredients: Json | null
          instructions: Json | null
          notes: string | null
          prep_time_minutes: number | null
          servings: number | null
          source_name: string | null
          source_url: string | null
          title: string
          title_es: string | null
          title_zh: string | null
          updated_at: string | null
        }
        Insert: {
          cook_time_minutes?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          description_zh?: string | null
          id?: string
          ingredients?: Json | null
          instructions?: Json | null
          notes?: string | null
          prep_time_minutes?: number | null
          servings?: number | null
          source_name?: string | null
          source_url?: string | null
          title: string
          title_es?: string | null
          title_zh?: string | null
          updated_at?: string | null
        }
        Update: {
          cook_time_minutes?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          description_zh?: string | null
          id?: string
          ingredients?: Json | null
          instructions?: Json | null
          notes?: string | null
          prep_time_minutes?: number | null
          servings?: number | null
          source_name?: string | null
          source_url?: string | null
          title?: string
          title_es?: string | null
          title_zh?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_one_offs: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_time: string
          id: string
          schedule_date: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_time: string
          id?: string
          schedule_date: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_time?: string
          id?: string
          schedule_date?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_one_offs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_one_offs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_time: string | null
          id: string
          is_cancelled: boolean | null
          notes: string | null
          override_date: string
          schedule_id: string
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_cancelled?: boolean | null
          notes?: string | null
          override_date: string
          schedule_id: string
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_cancelled?: boolean | null
          notes?: string | null
          override_date?: string
          schedule_id?: string
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "employee_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_notifications: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          message: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          phone_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"] | null
          twilio_sid: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          phone_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          twilio_sid?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          phone_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          twilio_sid?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          description: string | null
          id: string
          product_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["supply_request_status"] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          product_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["supply_request_status"] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          product_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["supply_request_status"] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignments: {
        Row: {
          created_at: string | null
          id: string
          target_group_id: string | null
          target_type: Database["public"]["Enums"]["assignment_target_type"]
          target_user_id: string | null
          task_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          target_group_id?: string | null
          target_type: Database["public"]["Enums"]["assignment_target_type"]
          target_user_id?: string | null
          task_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          target_group_id?: string | null
          target_type?: Database["public"]["Enums"]["assignment_target_type"]
          target_user_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_target_group_id_fkey"
            columns: ["target_group_id"]
            isOneToOne: false
            referencedRelation: "employee_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_date: string
          id: string
          task_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_date: string
          id?: string
          task_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_date?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_instance_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          instance_date: string
          override_end_time: string | null
          override_start_time: string | null
          override_time: string | null
          task_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          instance_date: string
          override_end_time?: string | null
          override_start_time?: string | null
          override_time?: string | null
          task_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          instance_date?: string
          override_end_time?: string | null
          override_start_time?: string | null
          override_time?: string | null
          task_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_instance_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instance_overrides_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_instances: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description_override: string | null
          google_calendar_event_id: string | null
          id: string
          instance_date: string
          parent_task_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title_override: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description_override?: string | null
          google_calendar_event_id?: string | null
          id?: string
          instance_date: string
          parent_task_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title_override?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description_override?: string | null
          google_calendar_event_id?: string | null
          id?: string
          instance_date?: string
          parent_task_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_series: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          repeat_days: number[] | null
          repeat_interval: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          repeat_days?: number[] | null
          repeat_interval?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          repeat_days?: number[] | null
          repeat_interval?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_skipped_instances: {
        Row: {
          id: string
          skipped_at: string | null
          skipped_by: string | null
          skipped_date: string
          task_id: string
        }
        Insert: {
          id?: string
          skipped_at?: string | null
          skipped_by?: string | null
          skipped_date: string
          task_id: string
        }
        Update: {
          id?: string
          skipped_at?: string | null
          skipped_by?: string | null
          skipped_date?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_skipped_instances_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_skipped_instances_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          category_id: string | null
          created_at: string | null
          created_by: string | null
          default_assignments: Json | null
          default_time: string | null
          default_viewers: Json | null
          description: string | null
          end_time: string | null
          id: string
          is_activity: boolean | null
          is_all_day: boolean | null
          is_recurring: boolean | null
          name: string
          priority: Database["public"]["Enums"]["task_priority"] | null
          recurrence_rule: string | null
          repeat_days: number[] | null
          repeat_interval: string | null
          start_time: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          default_assignments?: Json | null
          default_time?: string | null
          default_viewers?: Json | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_activity?: boolean | null
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          name: string
          priority?: Database["public"]["Enums"]["task_priority"] | null
          recurrence_rule?: string | null
          repeat_days?: number[] | null
          repeat_interval?: string | null
          start_time?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          default_assignments?: Json | null
          default_time?: string | null
          default_viewers?: Json | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_activity?: boolean | null
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          name?: string
          priority?: Database["public"]["Enums"]["task_priority"] | null
          recurrence_rule?: string | null
          repeat_days?: number[] | null
          repeat_interval?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_videos: {
        Row: {
          created_at: string | null
          created_by: string | null
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          task_id: string
          title: string | null
          url: string
          video_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          task_id: string
          title?: string | null
          url: string
          video_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          task_id?: string
          title?: string | null
          url?: string
          video_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_videos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_viewers: {
        Row: {
          created_at: string | null
          id: string
          target_group_id: string | null
          target_type: Database["public"]["Enums"]["assignment_target_type"]
          target_user_id: string | null
          task_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          target_group_id?: string | null
          target_type: Database["public"]["Enums"]["assignment_target_type"]
          target_user_id?: string | null
          task_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          target_group_id?: string | null
          target_type?: Database["public"]["Enums"]["assignment_target_type"]
          target_user_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_viewers_target_group_id_fkey"
            columns: ["target_group_id"]
            isOneToOne: false
            referencedRelation: "employee_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_viewers_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_viewers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          category_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          description_es: string | null
          description_zh: string | null
          due_date: string | null
          due_time: string | null
          end_time: string | null
          google_calendar_event_id: string | null
          id: string
          is_activity: boolean | null
          is_all_day: boolean | null
          is_recurring: boolean | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          recurrence_rule: string | null
          series_id: string | null
          source_locale: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          sync_to_calendar: boolean | null
          title: string
          title_es: string | null
          title_zh: string | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          description_zh?: string | null
          due_date?: string | null
          due_time?: string | null
          end_time?: string | null
          google_calendar_event_id?: string | null
          id?: string
          is_activity?: boolean | null
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          recurrence_rule?: string | null
          series_id?: string | null
          source_locale?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          sync_to_calendar?: boolean | null
          title: string
          title_es?: string | null
          title_zh?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          description_zh?: string | null
          due_date?: string | null
          due_time?: string | null
          end_time?: string | null
          google_calendar_event_id?: string | null
          id?: string
          is_activity?: boolean | null
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          recurrence_rule?: string | null
          series_id?: string | null
          source_locale?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          sync_to_calendar?: boolean | null
          title?: string
          title_es?: string | null
          title_zh?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "task_series"
            referencedColumns: ["id"]
          },
        ]
      }
      template_videos: {
        Row: {
          created_at: string | null
          created_by: string | null
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          template_id: string
          title: string | null
          url: string
          video_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          template_id: string
          title?: string | null
          url: string
          video_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          template_id?: string
          title?: string | null
          url?: string
          video_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_videos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          preferred_locale: string | null
          role: Database["public"]["Enums"]["user_role"]
          sms_notifications_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          preferred_locale?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          sms_notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          preferred_locale?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          sms_notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_menu: {
        Row: {
          created_at: string | null
          id: string
          meals: Json
          notes: string | null
          updated_at: string | null
          updated_by: string | null
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          meals?: Json
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
          week_start?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          meals?: Json
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_menu_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      apply_task_series_change: {
        Args: {
          p_actor?: string
          p_assignments?: Json
          p_changes: Json
          p_dates?: string[]
          p_delete?: boolean
          p_extend_only?: boolean
          p_metadata?: Json
          p_task_id: string
          p_videos?: Json
          p_viewers?: Json
        }
        Returns: Json
      }
      calendar_visible_records: { Args: { p_user_id: string }; Returns: Json }
      can_access_task: {
        Args: { p_action?: string; p_task_id: string }
        Returns: boolean
      }
      can_respond_to_food_notes: { Args: never; Returns: boolean }
      child_log_in_my_shift: {
        Args: {
          p_end: string
          p_log_date: string
          p_log_time: string
          p_start: string
        }
        Returns: boolean
      }
      ensure_task_series: {
        Args: {
          p_days: number[]
          p_end: string
          p_interval: string
          p_start: string
          p_task_id: string
        }
        Returns: string
      }
      has_removed_menu_catalog_term: {
        Args: { input: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_chef: { Args: never; Returns: boolean }
      is_assigned_to_task: { Args: { p_task_id: string }; Returns: boolean }
      is_babysitter: { Args: never; Returns: boolean }
      is_likely_menu_catalog_item: { Args: { input: string }; Returns: boolean }
      merge_menu_catalog_item_group: {
        Args: {
          canonical_name?: string
          merge_note?: string
          source_item_ids: string[]
          target_item_id: string
        }
        Returns: string[]
      }
      merge_menu_catalog_items: {
        Args: {
          merge_note?: string
          source_item_id: string
          target_item_id: string
        }
        Returns: string
      }
      normalize_menu_item_name: { Args: { input: string }; Returns: string }
      refresh_menu_item_rating_stats: {
        Args: { target_menu_item_id: string }
        Returns: undefined
      }
      respond_to_food_note: {
        Args: {
          p_id: string
          p_note_revision: string
          p_reply?: string
          p_source: string
        }
        Returns: undefined
      }
      review_leave_request: {
        Args: { p_action: string; p_notes?: string; p_request_id: string }
        Returns: string
      }
      swap_menu_meals: {
        Args: {
          p_day_a: string
          p_day_b: string
          p_expected_updated_at?: string
          p_meal_a: string
          p_meal_b: string
          p_week_start: string
        }
        Returns: string
      }
      sync_menu_catalog_from_history: { Args: never; Returns: undefined }
      unmerge_menu_catalog_items: {
        Args: { merge_event_id: string; undo_note?: string }
        Returns: undefined
      }
    }
    Enums: {
      assignment_target_type: "user" | "group" | "all" | "all_admins"
      attachable_type: "task" | "employee_profile"
      child_log_category: "sleep" | "food" | "poop" | "shower"
      child_name: "Zoe" | "Zara" | "Zander"
      leave_status: "pending" | "approved" | "denied"
      leave_type: "pto" | "sick" | "holiday" | "vacation"
      notification_status: "pending" | "sent" | "failed"
      notification_type:
        | "task_assigned"
        | "task_due_reminder"
        | "leave_request_submitted"
        | "leave_request_approved"
        | "leave_request_denied"
        | "schedule_change"
      supply_request_status: "pending" | "approved" | "rejected"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed"
      user_role: "admin" | "employee"
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
      assignment_target_type: ["user", "group", "all", "all_admins"],
      attachable_type: ["task", "employee_profile"],
      child_log_category: ["sleep", "food", "poop", "shower"],
      child_name: ["Zoe", "Zara", "Zander"],
      leave_status: ["pending", "approved", "denied"],
      leave_type: ["pto", "sick", "holiday", "vacation"],
      notification_status: ["pending", "sent", "failed"],
      notification_type: [
        "task_assigned",
        "task_due_reminder",
        "leave_request_submitted",
        "leave_request_approved",
        "leave_request_denied",
        "schedule_change",
      ],
      supply_request_status: ["pending", "approved", "rejected"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed"],
      user_role: ["admin", "employee"],
    },
  },
} as const
