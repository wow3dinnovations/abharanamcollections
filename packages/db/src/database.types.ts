
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "categories": {
                  Row: {
                    "code": string | null,"created_at": string,"description": string,"id": string,"image_path": string | null,"is_active": boolean,"is_visible": boolean,"local_id": string | null,"name": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"is_visible"?: boolean,"local_id"?: string | null,"name": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"is_visible"?: boolean,"local_id"?: string | null,"name"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"enquiries": {
                  Row: {
                    "admin_note": string | null,"city": string | null,"created_at": string,"email": string | null,"id": string,"item_count": number,"message": string | null,"name": string,"number": string,"phone": string,"source": string,"status": Database["public"]['Enums']["enquiry_status"],"total": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"city"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"item_count"?: number,"message"?: string | null,"name": string,"number"?: string,"phone": string,"source"?: string,"status"?: Database["public"]['Enums']["enquiry_status"],"total"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "admin_note"?: string | null,"city"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"item_count"?: number,"message"?: string | null,"name"?: string,"number"?: string,"phone"?: string,"source"?: string,"status"?: Database["public"]['Enums']["enquiry_status"],"total"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"enquiry_items": {
                  Row: {
                    "enquiry_id": string,"id": string,"name": string,"price": number,"product_id": string | null,"quantity": number,"sku": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enquiry_id": string,"id"?: string,"name": string,"price": number,"product_id"?: string | null,"quantity": number,"sku": string
                  }
                  Update: {
                    "enquiry_id"?: string,"id"?: string,"name"?: string,"price"?: number,"product_id"?: string | null,"quantity"?: number,"sku"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enquiry_items_enquiry_id_fkey"
      columns: ["enquiry_id"]
isOneToOne: false
      referencedRelation: "enquiries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiry_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enquiry_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "added_at": string,"category_id": string | null,"collection": string,"colour": string,"created_at": string,"description": string,"design_number": string,"extra_image_paths": (string)[],"id": string,"image_paths": (string)[],"is_active": boolean,"is_featured": boolean,"is_visible": boolean,"local_id": string | null,"material": string,"mrp": number | null,"name": string,"price": number,"search": unknown,"size": string,"sku": string,"slug": string,"stock_qty": number,"subcategory_id": string | null,"tags": (string)[],"updated_at": string,"web_description": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"category_id"?: string | null,"collection"?: string,"colour"?: string,"created_at"?: string,"description"?: string,"design_number"?: string,"extra_image_paths"?: (string)[],"id"?: string,"image_paths"?: (string)[],"is_active"?: boolean,"is_featured"?: boolean,"is_visible"?: boolean,"local_id"?: string | null,"material"?: string,"mrp"?: number | null,"name": string,"price": number,"search"?: unknown,"size"?: string,"sku": string,"slug": string,"stock_qty"?: number,"subcategory_id"?: string | null,"tags"?: (string)[],"updated_at"?: string,"web_description"?: string
                  }
                  Update: {
                    "added_at"?: string,"category_id"?: string | null,"collection"?: string,"colour"?: string,"created_at"?: string,"description"?: string,"design_number"?: string,"extra_image_paths"?: (string)[],"id"?: string,"image_paths"?: (string)[],"is_active"?: boolean,"is_featured"?: boolean,"is_visible"?: boolean,"local_id"?: string | null,"material"?: string,"mrp"?: number | null,"name"?: string,"price"?: number,"search"?: unknown,"size"?: string,"sku"?: string,"slug"?: string,"stock_qty"?: number,"subcategory_id"?: string | null,"tags"?: (string)[],"updated_at"?: string,"web_description"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category_summary"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "city": string | null,"created_at": string,"full_name": string | null,"id": string,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"store_settings": {
                  Row: {
                    "address": string,"announcement": string,"email": string,"enquiries_open": boolean,"id": number,"instagram_url": string,"last_sync_at": string | null,"phone": string,"show_prices": boolean,"show_stock_count": boolean,"store_name": string,"tagline": string,"updated_at": string,"whatsapp_number": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string,"announcement"?: string,"email"?: string,"enquiries_open"?: boolean,"id"?: number,"instagram_url"?: string,"last_sync_at"?: string | null,"phone"?: string,"show_prices"?: boolean,"show_stock_count"?: boolean,"store_name"?: string,"tagline"?: string,"updated_at"?: string,"whatsapp_number"?: string
                  }
                  Update: {
                    "address"?: string,"announcement"?: string,"email"?: string,"enquiries_open"?: boolean,"id"?: number,"instagram_url"?: string,"last_sync_at"?: string | null,"phone"?: string,"show_prices"?: boolean,"show_stock_count"?: boolean,"store_name"?: string,"tagline"?: string,"updated_at"?: string,"whatsapp_number"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subcategories": {
                  Row: {
                    "category_id": string,"created_at": string,"id": string,"is_active": boolean,"local_id": string | null,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"local_id"?: string | null,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"local_id"?: string | null,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcategories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category_summary"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "catalog": {
                  Row: {
                    "added_at": string,"category_id": string | null,"category_name": string | null,"category_slug": string | null,"collection": string,"colour": string,"description": string | null,"design_number": string,"id": string,"image_paths": (string)[] | null,"in_stock": boolean | null,"is_featured": boolean,"material": string,"mrp": number | null,"name": string,"price": number,"search": unknown,"size": string,"sku": string,"slug": string,"stock_qty": number,"subcategory_id": string | null,"subcategory_name": string | null,"subcategory_slug": string | null,"tags": (string)[]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category_summary"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "subcategories"
      referencedColumns: ["id"]
    }
                  ]
                },"category_summary": {
                  Row: {
                    "cover_path": string | null,"description": string,"id": string,"image_path": string | null,"name": string,"product_count": number | null,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"slugify":
{ Args: { "txt": string }; Returns: string
                           },
"submit_enquiry":
{ Args: { "p_city": string,"p_email": string,"p_items": Json,"p_message": string,"p_name": string,"p_phone": string,"p_source"?: string }; Returns: {
              "id": string,"number": string
            }[]
                           }
          }
          Enums: {
            "enquiry_status": "new"|"contacted"|"confirmed"|"completed"|"cancelled","user_role": "admin"|"customer"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "enquiry_status": ["new", "contacted", "confirmed", "completed", "cancelled"],"user_role": ["admin", "customer"]
          }
        }
} as const
