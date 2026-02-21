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
      balance_audit_log: {
        Row: {
          change_amount: number
          changed_at: string
          id: string
          new_balance: number
          old_balance: number
          source: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          change_amount: number
          changed_at?: string
          id?: string
          new_balance: number
          old_balance: number
          source?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          change_amount?: number
          changed_at?: string
          id?: string
          new_balance?: number
          old_balance?: number
          source?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: []
      }
      banned_ips: {
        Row: {
          banned_at: string
          id: string
          ip_address: string
          reason: string | null
        }
        Insert: {
          banned_at?: string
          id?: string
          ip_address: string
          reason?: string | null
        }
        Update: {
          banned_at?: string
          id?: string
          ip_address?: string
          reason?: string | null
        }
        Relationships: []
      }
      banned_users: {
        Row: {
          banned_at: string
          email: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string
          email?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string
          email?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_tokens: {
        Row: {
          created_at: string
          credits_used: number
          expires_at: string | null
          id: string
          is_active: boolean
          owner_id: string
          token: string
          total_credits: number
        }
        Insert: {
          created_at?: string
          credits_used?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          owner_id: string
          token?: string
          total_credits: number
        }
        Update: {
          created_at?: string
          credits_used?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          owner_id?: string
          token?: string
          total_credits?: number
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          times_used: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
        }
        Relationships: []
      }
      fraud_attempts: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      generations: {
        Row: {
          client_ip: string | null
          client_name: string
          client_token_id: string | null
          created_at: string
          credits_earned: number | null
          credits_requested: number
          error_message: string | null
          farm_id: string
          id: string
          master_email: string | null
          settled_at: string | null
          status: string
          token_id: string | null
          updated_at: string
          user_id: string | null
          workspace_name: string | null
        }
        Insert: {
          client_ip?: string | null
          client_name: string
          client_token_id?: string | null
          created_at?: string
          credits_earned?: number | null
          credits_requested: number
          error_message?: string | null
          farm_id: string
          id?: string
          master_email?: string | null
          settled_at?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          client_ip?: string | null
          client_name?: string
          client_token_id?: string | null
          created_at?: string
          credits_earned?: number | null
          credits_requested?: number
          error_message?: string | null
          farm_id?: string
          id?: string
          master_email?: string | null
          settled_at?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_client_token_id_fkey"
            columns: ["client_token_id"]
            isOneToOne: false
            referencedRelation: "client_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          coupon_id: string | null
          created_at: string
          customer_document: string
          customer_email: string
          customer_name: string
          discount_amount: number | null
          id: string
          order_type: string
          paid_at: string | null
          pix_code: string | null
          pix_expires_at: string | null
          product_id: string
          source: string | null
          status: string
          token_id: string | null
          transaction_id: string | null
          updated_at: string
          upgrade_increment: number | null
          user_id: string | null
        }
        Insert: {
          amount: number
          coupon_id?: string | null
          created_at?: string
          customer_document: string
          customer_email: string
          customer_name: string
          discount_amount?: number | null
          id?: string
          order_type?: string
          paid_at?: string | null
          pix_code?: string | null
          pix_expires_at?: string | null
          product_id: string
          source?: string | null
          status?: string
          token_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          upgrade_increment?: number | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          coupon_id?: string | null
          created_at?: string
          customer_document?: string
          customer_email?: string
          customer_name?: string
          discount_amount?: number | null
          id?: string
          order_type?: string
          paid_at?: string | null
          pix_code?: string | null
          pix_expires_at?: string | null
          product_id?: string
          source?: string | null
          status?: string
          token_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          upgrade_increment?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          credits_per_use: number
          daily_limit: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          total_limit: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_per_use?: number
          daily_limit?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          total_limit?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_per_use?: number
          daily_limit?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          total_limit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      refund_locks: {
        Row: {
          debit_transaction_id: string
          locked_at: string
          locked_by: string
        }
        Insert: {
          debit_transaction_id: string
          locked_at?: string
          locked_by: string
        }
        Update: {
          debit_transaction_id?: string
          locked_at?: string
          locked_by?: string
        }
        Relationships: []
      }
      token_accounts: {
        Row: {
          created_at: string
          email: string
          id: string
          token_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_accounts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: true
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      token_usages: {
        Row: {
          client_ip: string | null
          completed_at: string | null
          created_at: string
          credits_earned: number | null
          credits_requested: number
          farm_id: string | null
          id: string
          status: string
          token_id: string
        }
        Insert: {
          client_ip?: string | null
          completed_at?: string | null
          created_at?: string
          credits_earned?: number | null
          credits_requested: number
          farm_id?: string | null
          id?: string
          status?: string
          token_id: string
        }
        Update: {
          client_ip?: string | null
          completed_at?: string | null
          created_at?: string
          credits_earned?: number | null
          credits_requested?: number
          farm_id?: string | null
          id?: string
          status?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_usages_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          client_name: string
          cooldown_minutes: number | null
          created_at: string
          created_by: string
          credits_per_use: number
          daily_limit: number | null
          expires_at: string | null
          id: string
          is_active: boolean
          token: string
          total_limit: number | null
          updated_at: string
          warning_message: string | null
        }
        Insert: {
          client_name: string
          cooldown_minutes?: number | null
          created_at?: string
          created_by: string
          credits_per_use?: number
          daily_limit?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
          total_limit?: number | null
          updated_at?: string
          warning_message?: string | null
        }
        Update: {
          client_name?: string
          cooldown_minutes?: number | null
          created_at?: string
          created_by?: string
          credits_per_use?: number
          daily_limit?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
          total_limit?: number | null
          updated_at?: string
          warning_message?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          credits: number | null
          description: string
          id: string
          reference_id: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits?: number | null
          description?: string
          id?: string
          reference_id?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits?: number | null
          description?: string
          id?: string
          reference_id?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_type: string
          id: string
          received_at: string
          transaction_id: string
        }
        Insert: {
          event_type: string
          id?: string
          received_at?: string
          transaction_id: string
        }
        Update: {
          event_type?: string
          id?: string
          received_at?: string
          transaction_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_refund_cron: { Args: never; Returns: undefined }
      calc_credit_price: { Args: { creditos: number }; Returns: number }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_ip: string
          p_max_requests?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: Json
      }
      credit_wallet: {
        Args: {
          p_amount: number
          p_description: string
          p_reference_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      daily_reconciliation: { Args: never; Returns: undefined }
      debit_wallet: {
        Args: {
          p_amount: number
          p_credits: number
          p_description: string
          p_reference_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_usage: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      is_ip_banned: { Args: { p_ip: string }; Returns: boolean }
      is_user_banned: { Args: { p_user_id: string }; Returns: boolean }
      reconcile_balances: {
        Args: never
        Returns: {
          difference: number
          ledger_balance: number
          materialized_balance: number
          r_user_id: string
        }[]
      }
      refund_client_token_credits: {
        Args: { p_credits: number; p_token_id: string }
        Returns: Json
      }
      reserve_credits: {
        Args: {
          p_client_ip?: string
          p_client_name: string
          p_credits_requested: number
          p_farm_id: string
          p_master_email?: string
          p_queued?: boolean
          p_status?: string
          p_token_id: string
        }
        Returns: Json
      }
      use_client_token_credits: {
        Args: { p_credits: number; p_token_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
