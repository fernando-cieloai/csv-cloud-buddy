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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      countries: {
        Row: {
          id: string
          nombre: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          created_at?: string
        }
        Relationships: []
      }
      country_groups: {
        Row: {
          country_id: string
          group_id: string
          created_at: string
        }
        Insert: {
          country_id: string
          group_id: string
          created_at?: string
        }
        Update: {
          country_id?: string
          group_id?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "country_groups_country_id_fkey"; columns: ["country_id"]; referencedRelation: "countries"; referencedColumns: ["id"] },
          { foreignKeyName: "country_groups_group_id_fkey"; columns: ["group_id"]; referencedRelation: "groups"; referencedColumns: ["id"] }
        ]
      }
      clients: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      csv_uploads: {
        Row: {
          id: string
          file_name: string
          created_at: string
          vendor_id: string | null
          upload_mode: string
        }
        Insert: {
          id?: string
          file_name: string
          created_at?: string
          vendor_id?: string | null
          upload_mode?: string
        }
        Update: {
          id?: string
          file_name?: string
          created_at?: string
          vendor_id?: string | null
          upload_mode?: string
        }
        Relationships: [
          { foreignKeyName: "csv_uploads_vendor_id_fkey"; columns: ["vendor_id"]; referencedRelation: "vendors"; referencedColumns: ["id"] }
        ]
      }
      vendors: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          estado: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          estado?: string
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          descripcion?: string | null
          estado?: string
          created_at?: string
        }
        Relationships: []
      }
      saved_quotations: {
        Row: {
          id: string
          name: string | null
          vendor_ids: string[]
          snapshot: Json
          created_at: string
          client_id: string | null
          status: string
        }
        Insert: {
          id?: string
          name?: string | null
          vendor_ids?: string[]
          snapshot: Json
          created_at?: string
          client_id?: string | null
          status?: string
        }
        Update: {
          id?: string
          name?: string | null
          vendor_ids?: string[]
          snapshot?: Json
          created_at?: string
          client_id?: string | null
          status?: string
        }
        Relationships: [
          { foreignKeyName: "saved_quotations_client_id_fkey"; columns: ["client_id"]; referencedRelation: "clients"; referencedColumns: ["id"] }
        ]
      }
      groups: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          descripcion?: string | null
          created_at?: string
        }
        Relationships: []
      }
      country_regions: {
        Row: {
          id: string
          country_id: string
          region: string
          region_code: string
          effective_date: string | null
          valid_to: string | null
          date_added: string | null
          created_at: string
        }
        Insert: {
          id?: string
          country_id: string
          region: string
          region_code: string
          effective_date?: string | null
          valid_to?: string | null
          date_added?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          country_id?: string
          region?: string
          region_code?: string
          effective_date?: string | null
          valid_to?: string | null
          date_added?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "country_regions_country_id_fkey"; columns: ["country_id"]; referencedRelation: "countries"; referencedColumns: ["id"] }
        ]
      }
      phone_rates: {
        Row: {
          country: string
          created_at: string
          id: string
          network: string
          prefix: string
          rate: number
          rate_type: string
          upload_id: string
          comment: string | null
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          network: string
          prefix: string
          rate: number
          rate_type?: string
          upload_id: string
          comment?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          network?: string
          prefix?: string
          rate?: number
          rate_type?: string
          upload_id?: string
          comment?: string | null
        }
        Relationships: [
          { foreignKeyName: "phone_rates_upload_id_fkey"; columns: ["upload_id"]; referencedRelation: "csv_uploads"; referencedColumns: ["id"] }
        ]
      }
    }
    Views: {
      master_list_flat: {
        Row: {
          id: string
          region: string
          region_code: string
          effective_date: string | null
          valid_to: string | null
          date_added: string | null
          country_name: string | null
        }
        Relationships: []
      }
      phone_rates_with_country_iso: {
        Row: {
          id: string
          upload_id: string
          country: string
          network: string
          prefix: string
          rate: number
          rate_type: string
          comment: string | null
          created_at: string
          country_iso: string | null
          country_match_key: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "phone_rates_upload_id_fkey"
            columns: ["upload_id"]
            referencedRelation: "csv_uploads"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
