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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      pe_appointment_trainees: {
        Row: {
          appointment_id: number | null
          id: number
          organization_id: string
          purchase_id: string | null
          session_number: number | null
          total_sessions: number | null
          trainee_id: string | null
        }
        Insert: {
          appointment_id?: number | null
          id?: number
          organization_id?: string
          purchase_id?: string | null
          session_number?: number | null
          total_sessions?: number | null
          trainee_id?: string | null
        }
        Update: {
          appointment_id?: number | null
          id?: number
          organization_id?: string
          purchase_id?: string | null
          session_number?: number | null
          total_sessions?: number | null
          trainee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_appointment_trainees_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "pe_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointment_trainees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointment_trainees_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "pe_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointment_trainees_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "pe_trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_appointments: {
        Row: {
          date: string | null
          group_lesson_id: string | null
          hour: number | null
          id: number
          organization_id: string
          purchase_id: string | null
          room_id: string | null
          trainer_id: string | null
        }
        Insert: {
          date?: string | null
          group_lesson_id?: string | null
          hour?: number | null
          id?: number
          organization_id?: string
          purchase_id?: string | null
          room_id?: string | null
          trainer_id?: string | null
        }
        Update: {
          date?: string | null
          group_lesson_id?: string | null
          hour?: number | null
          id?: number
          organization_id?: string
          purchase_id?: string | null
          room_id?: string | null
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_appointments_group_lesson_id_fkey"
            columns: ["group_lesson_id"]
            isOneToOne: false
            referencedRelation: "pe_group_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "pe_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "pe_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_appointments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "pe_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_group_lessons: {
        Row: {
          appointments_created_until: string | null
          created_at: string
          end_date: string | null
          id: string
          organization_id: string
          package_id: string | null
          room_id: string | null
          start_date: string | null
          timeslots: Json | null
          trainer_id: string | null
        }
        Insert: {
          appointments_created_until?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          organization_id?: string
          package_id?: string | null
          room_id?: string | null
          start_date?: string | null
          timeslots?: Json | null
          trainer_id?: string | null
        }
        Update: {
          appointments_created_until?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          organization_id?: string
          package_id?: string | null
          room_id?: string | null
          start_date?: string | null
          timeslots?: Json | null
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_group_lessons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_group_lessons_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "pe_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_group_lessons_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "pe_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_group_lessons_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "pe_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_logs: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          id: string
          organization_id: string
          status: string
          user_full_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          id?: string
          organization_id?: string
          status: string
          user_full_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          id?: string
          organization_id?: string
          status?: string
          user_full_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_organizations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      pe_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          lessons_per_week: number
          max_capacity: number
          name: string
          organization_id: string
          package_type: Database["public"]["Enums"]["package_type_enum"]
          reschedulable: boolean | null
          reschedule_limit: number | null
          weeks_duration: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          lessons_per_week?: number
          max_capacity?: number
          name: string
          organization_id?: string
          package_type: Database["public"]["Enums"]["package_type_enum"]
          reschedulable?: boolean | null
          reschedule_limit?: number | null
          weeks_duration?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          lessons_per_week?: number
          max_capacity?: number
          name?: string
          organization_id?: string
          package_type?: Database["public"]["Enums"]["package_type_enum"]
          reschedulable?: boolean | null
          reschedule_limit?: number | null
          weeks_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_purchases: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          package_id: string | null
          reschedule_left: number | null
          successor_id: string | null
          team_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string
          package_id?: string | null
          reschedule_left?: number | null
          successor_id?: string | null
          team_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          package_id?: string | null
          reschedule_left?: number | null
          successor_id?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_purchases_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "pe_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_purchases_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "pe_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_rooms: {
        Row: {
          capacity: number | null
          id: string
          is_active: boolean
          name: string | null
          organization_id: string
        }
        Insert: {
          capacity?: number | null
          id?: string
          is_active?: boolean
          name?: string | null
          organization_id?: string
        }
        Update: {
          capacity?: number | null
          id?: string
          is_active?: boolean
          name?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_teams: {
        Row: {
          id: string
          organization_id: string
          trainee_id: string | null
        }
        Insert: {
          id?: string
          organization_id?: string
          trainee_id?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          trainee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_teams_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "pe_trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_trainees: {
        Row: {
          auth_id: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string
        }
        Insert: {
          auth_id?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id?: string
          phone: string
        }
        Update: {
          auth_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_trainees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_trainers: {
        Row: {
          id: string
          is_active: boolean | null
          name: string | null
          organization_id: string
          phone: string
        }
        Insert: {
          id: string
          is_active?: boolean | null
          name?: string | null
          organization_id?: string
          phone: string
        }
        Update: {
          id?: string
          is_active?: boolean | null
          name?: string | null
          organization_id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_trainers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_user_organizations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "pe_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_role: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      get_coordinator_reschedule_count: {
        Args: { user_id: string }
        Returns: number
      }
      populate_default_weekly_schedules: { Args: never; Returns: undefined }
      set_current_organization: { Args: { p_org_id: string }; Returns: Json }
    }
    Enums: {
      appointment_status: "scheduled" | "completed" | "cancelled"
      day_of_week:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      group_type: "individual" | "fixed" | "dynamic"
      package_type_enum: "private" | "group"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      appointment_status: ["scheduled", "completed", "cancelled"],
      day_of_week: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      group_type: ["individual", "fixed", "dynamic"],
      package_type_enum: ["private", "group"],
    },
  },
} as const
