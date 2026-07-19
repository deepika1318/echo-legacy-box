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
      death_certificates: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          reviewed_at: string | null
          status: string
          storage_path: string
          uploader_email: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          reviewed_at?: string | null
          status?: string
          storage_path: string
          uploader_email: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          reviewed_at?: string | null
          status?: string
          storage_path?: string
          uploader_email?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          allow_certificate: boolean
          allow_file: boolean
          allow_note: boolean
          allow_photo: boolean
          allow_video: boolean
          allow_voice: boolean
          created_at: string
          family_email: string
          full_name: string | null
          id: string
          owner_id: string
          relationship: string | null
        }
        Insert: {
          allow_certificate?: boolean
          allow_file?: boolean
          allow_note?: boolean
          allow_photo?: boolean
          allow_video?: boolean
          allow_voice?: boolean
          created_at?: string
          family_email: string
          full_name?: string | null
          id?: string
          owner_id: string
          relationship?: string | null
        }
        Update: {
          allow_certificate?: boolean
          allow_file?: boolean
          allow_note?: boolean
          allow_photo?: boolean
          allow_video?: boolean
          allow_voice?: boolean
          created_at?: string
          family_email?: string
          full_name?: string | null
          id?: string
          owner_id?: string
          relationship?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      release_approvals: {
        Row: {
          approved_at: string
          contact_email: string
          id: string
          owner_id: string
        }
        Insert: {
          approved_at?: string
          contact_email: string
          id?: string
          owner_id: string
        }
        Update: {
          approved_at?: string
          contact_email?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      trusted_contacts: {
        Row: {
          contact_email: string
          created_at: string
          full_name: string | null
          id: string
          owner_id: string
          relationship: string | null
        }
        Insert: {
          contact_email: string
          created_at?: string
          full_name?: string | null
          id?: string
          owner_id: string
          relationship?: string | null
        }
        Update: {
          contact_email?: string
          created_at?: string
          full_name?: string | null
          id?: string
          owner_id?: string
          relationship?: string | null
        }
        Relationships: []
      }
      vault_items: {
        Row: {
          created_at: string
          description: string | null
          encrypted_description: string | null
          encrypted_transcript: string | null
          id: string
          is_encrypted: boolean
          is_sensitive: boolean
          item_type: Database["public"]["Enums"]["item_type"]
          mime_type: string | null
          owner_id: string
          size_bytes: number | null
          storage_path: string | null
          title: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          encrypted_description?: string | null
          encrypted_transcript?: string | null
          id?: string
          is_encrypted?: boolean
          is_sensitive?: boolean
          item_type: Database["public"]["Enums"]["item_type"]
          mime_type?: string | null
          owner_id: string
          size_bytes?: number | null
          storage_path?: string | null
          title: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          encrypted_description?: string | null
          encrypted_transcript?: string | null
          id?: string
          is_encrypted?: boolean
          is_sensitive?: boolean
          item_type?: Database["public"]["Enums"]["item_type"]
          mime_type?: string | null
          owner_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          title?: string
          transcript?: string | null
        }
        Relationships: []
      }
      vault_settings: {
        Row: {
          created_at: string
          inactivity_days: number
          is_released: boolean
          last_checkin_at: string
          memorial_message: string | null
          owner_id: string
          released_at: string | null
          required_approvals: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          inactivity_days?: number
          is_released?: boolean
          last_checkin_at?: string
          memorial_message?: string | null
          owner_id: string
          released_at?: string | null
          required_approvals?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          inactivity_days?: number
          is_released?: boolean
          last_checkin_at?: string
          memorial_message?: string | null
          owner_id?: string
          released_at?: string | null
          required_approvals?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      family_can_see_category: {
        Args: {
          _owner: string
          _type: Database["public"]["Enums"]["item_type"]
        }
        Returns: boolean
      }
      is_family_member: { Args: { _owner: string }; Returns: boolean }
      is_vault_released: { Args: { _owner: string }; Returns: boolean }
    }
    Enums: {
      item_type: "photo" | "video" | "file" | "certificate" | "note" | "voice"
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
      item_type: ["photo", "video", "file", "certificate", "note", "voice"],
    },
  },
} as const
