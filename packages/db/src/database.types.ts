export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string;
          created_at: string;
          full_name: string;
          id: string;
          line1: string;
          line2: string;
          phone: string;
          pincode: string;
          state: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          city: string;
          created_at?: string;
          full_name: string;
          id?: string;
          line1: string;
          line2?: string;
          phone: string;
          pincode: string;
          state: string;
          user_id?: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          line1?: string;
          line2?: string;
          phone?: string;
          pincode?: string;
          state?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          code: string | null;
          created_at: string;
          description: string;
          id: string;
          image_path: string | null;
          is_active: boolean;
          is_visible: boolean;
          local_id: string | null;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          is_visible?: boolean;
          local_id?: string | null;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          is_visible?: boolean;
          local_id?: string | null;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      enquiries: {
        Row: {
          admin_note: string | null;
          city: string | null;
          created_at: string;
          email: string | null;
          id: string;
          item_count: number;
          message: string | null;
          name: string;
          number: string;
          phone: string;
          source: string;
          status: Database["public"]["Enums"]["enquiry_status"];
          total: number;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          admin_note?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          item_count?: number;
          message?: string | null;
          name: string;
          number?: string;
          phone: string;
          source?: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          admin_note?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          item_count?: number;
          message?: string | null;
          name?: string;
          number?: string;
          phone?: string;
          source?: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      enquiry_items: {
        Row: {
          enquiry_id: string;
          id: string;
          name: string;
          price: number;
          product_id: string | null;
          quantity: number;
          sku: string;
        };
        ComputedFields: never;
        Insert: {
          enquiry_id: string;
          id?: string;
          name: string;
          price: number;
          product_id?: string | null;
          quantity: number;
          sku: string;
        };
        Update: {
          enquiry_id?: string;
          id?: string;
          name?: string;
          price?: number;
          product_id?: string | null;
          quantity?: number;
          sku?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enquiry_items_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiry_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiry_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: number;
          image_path: string | null;
          line_total: number | null;
          name: string;
          order_id: string;
          price: number;
          product_id: string | null;
          quantity: number;
          sku: string;
          stock_from: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          image_path?: string | null;
          line_total?: never;
          name: string;
          order_id: string;
          price: number;
          product_id?: string | null;
          quantity: number;
          sku: string;
          stock_from?: NonNullable<Json>;
        };
        Update: {
          id?: never;
          image_path?: string | null;
          line_total?: never;
          name?: string;
          order_id?: string;
          price?: number;
          product_id?: string | null;
          quantity?: number;
          sku?: string;
          stock_from?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          created_at: string;
          id: number;
          note: string;
          order_id: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          note?: string;
          order_id: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          created_at?: string;
          id?: never;
          note?: string;
          order_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          admin_note: string;
          created_at: string;
          customer_notes: string;
          email: string;
          gateway_order_id: string | null;
          id: string;
          number: string;
          paid_at: string | null;
          pay_token: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_status: Database["public"]["Enums"]["payment_status"];
          shipping_address: NonNullable<Json>;
          shipping_fee: number;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          tracking: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          admin_note?: string;
          created_at?: string;
          customer_notes?: string;
          email?: string;
          gateway_order_id?: string | null;
          id?: string;
          number?: string;
          paid_at?: string | null;
          pay_token?: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_status?: Database["public"]["Enums"]["payment_status"];
          shipping_address: NonNullable<Json>;
          shipping_fee?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          tracking?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          admin_note?: string;
          created_at?: string;
          customer_notes?: string;
          email?: string;
          gateway_order_id?: string | null;
          id?: string;
          number?: string;
          paid_at?: string | null;
          pay_token?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: Database["public"]["Enums"]["payment_status"];
          shipping_address?: NonNullable<Json>;
          shipping_fee?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          tracking?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string;
          gateway_payment_id: string | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          note: string;
          order_id: string;
          raw: Json | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          gateway_payment_id?: string | null;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          note?: string;
          order_id: string;
          raw?: Json | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount?: number;
          created_at?: string;
          gateway_payment_id?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          note?: string;
          order_id?: string;
          raw?: Json | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          added_at: string;
          category_id: string | null;
          collection: string;
          colour: string;
          created_at: string;
          description: string;
          design_number: string;
          extra_image_paths: string[];
          id: string;
          image_paths: string[];
          is_active: boolean;
          is_featured: boolean;
          is_visible: boolean;
          local_id: string | null;
          material: string;
          mrp: number | null;
          name: string;
          price: number;
          search: unknown;
          size: string;
          sku: string;
          slug: string;
          stock_qty: number;
          subcategory_id: string | null;
          tags: string[];
          updated_at: string;
          web_description: string;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          category_id?: string | null;
          collection?: string;
          colour?: string;
          created_at?: string;
          description?: string;
          design_number?: string;
          extra_image_paths?: string[];
          id?: string;
          image_paths?: string[];
          is_active?: boolean;
          is_featured?: boolean;
          is_visible?: boolean;
          local_id?: string | null;
          material?: string;
          mrp?: number | null;
          name: string;
          price: number;
          search?: unknown;
          size?: string;
          sku: string;
          slug: string;
          stock_qty?: number;
          subcategory_id?: string | null;
          tags?: string[];
          updated_at?: string;
          web_description?: string;
        };
        Update: {
          added_at?: string;
          category_id?: string | null;
          collection?: string;
          colour?: string;
          created_at?: string;
          description?: string;
          design_number?: string;
          extra_image_paths?: string[];
          id?: string;
          image_paths?: string[];
          is_active?: boolean;
          is_featured?: boolean;
          is_visible?: boolean;
          local_id?: string | null;
          material?: string;
          mrp?: number | null;
          name?: string;
          price?: number;
          search?: unknown;
          size?: string;
          sku?: string;
          slug?: string;
          stock_qty?: number;
          subcategory_id?: string | null;
          tags?: string[];
          updated_at?: string;
          web_description?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_summary";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_subcategory_id_fkey";
            columns: ["subcategory_id"];
            isOneToOne: false;
            referencedRelation: "subcategories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          city: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_customers: {
        Row: {
          address: string;
          created_at: string;
          email: string;
          id: string;
          name: string;
          notes: string;
          phone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          notes?: string;
          phone: string;
          updated_at?: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          notes?: string;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_locations: {
        Row: {
          code: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          local_id: string | null;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          code?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          local_id?: string | null;
          name: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          local_id?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      shop_products: {
        Row: {
          guarantee_months: number;
          barcode: string | null;
          invoice_no: string;
          location_id: string | null;
          multiplier: number | null;
          product_id: string;
          purchase_date: string | null;
          purchase_rate: number;
          rack: string;
          updated_at: string;
          vendor_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          guarantee_months?: number;
          barcode?: string | null;
          invoice_no?: string;
          location_id?: string | null;
          multiplier?: number | null;
          product_id: string;
          purchase_date?: string | null;
          purchase_rate?: number;
          rack?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Update: {
          guarantee_months?: number;
          barcode?: string | null;
          invoice_no?: string;
          location_id?: string | null;
          multiplier?: number | null;
          product_id?: string;
          purchase_date?: string | null;
          purchase_rate?: number;
          rack?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shop_products_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "shop_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_products_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "shop_vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_sale_items: {
        Row: {
          id: number;
          line_total: number;
          name: string;
          price: number;
          product_id: string | null;
          qty: number;
          sale_id: string;
          sku: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          line_total: number;
          name: string;
          price: number;
          product_id?: string | null;
          qty: number;
          sale_id: string;
          sku: string;
        };
        Update: {
          id?: never;
          line_total?: number;
          name?: string;
          price?: number;
          product_id?: string | null;
          qty?: number;
          sale_id?: string;
          sku?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "shop_sales";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_sales: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          discount: number;
          discount_type: string;
          discount_value: number;
          id: string;
          location_id: string | null;
          notes: string;
          number: string;
          payment_method: string;
          status: string;
          subtotal: number;
          total: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          discount?: number;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          location_id?: string | null;
          notes?: string;
          number?: string;
          payment_method?: string;
          status?: string;
          subtotal?: number;
          total?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          discount?: number;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          location_id?: string | null;
          notes?: string;
          number?: string;
          payment_method?: string;
          status?: string;
          subtotal?: number;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shop_sales_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "shop_customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_sales_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "shop_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_settings: {
        Row: {
          code_pattern: string;
          code_type: string;
          guarantee_letter: string;
          guarantee_months: number;
          next_serial: number;
          serial_digits: number;
          serial_scope: string;
          tag_layout: Json;
          bill_footer: string;
          default_multiplier: number;
          id: number;
          tag_height_mm: number;
          tag_width_mm: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code_pattern?: string;
          code_type?: string;
          guarantee_letter?: string;
          guarantee_months?: number;
          next_serial?: number;
          serial_digits?: number;
          serial_scope?: string;
          tag_layout?: Json;
          bill_footer?: string;
          default_multiplier?: number;
          id?: number;
          tag_height_mm?: number;
          tag_width_mm?: number;
          updated_at?: string;
        };
        Update: {
          code_pattern?: string;
          code_type?: string;
          guarantee_letter?: string;
          guarantee_months?: number;
          next_serial?: number;
          serial_digits?: number;
          serial_scope?: string;
          tag_layout?: Json;
          bill_footer?: string;
          default_multiplier?: number;
          id?: number;
          tag_height_mm?: number;
          tag_width_mm?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_stock: {
        Row: {
          location_id: string;
          product_id: string;
          qty: number;
        };
        ComputedFields: never;
        Insert: {
          location_id: string;
          product_id: string;
          qty?: number;
        };
        Update: {
          location_id?: string;
          product_id?: string;
          qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shop_stock_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "shop_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_stock_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_stock_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_stock_moves: {
        Row: {
          change: number;
          created_at: string;
          created_by: string | null;
          id: number;
          location_id: string | null;
          note: string;
          product_id: string;
          reason: string;
          ref: string;
        };
        ComputedFields: never;
        Insert: {
          change: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          location_id?: string | null;
          note?: string;
          product_id: string;
          reason: string;
          ref?: string;
        };
        Update: {
          change?: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          location_id?: string | null;
          note?: string;
          product_id?: string;
          reason?: string;
          ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_stock_moves_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "shop_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_stock_moves_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_stock_moves_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_vendors: {
        Row: {
          code_no: number | null;
          location_id: string | null;
          next_serial: number;
          created_at: string;
          id: string;
          is_active: boolean;
          local_id: string | null;
          name: string;
          notes: string;
          phone: string;
        };
        ComputedFields: never;
        Insert: {
          code_no?: number | null;
          location_id?: string | null;
          next_serial?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          local_id?: string | null;
          name: string;
          notes?: string;
          phone?: string;
        };
        Update: {
          code_no?: number | null;
          location_id?: string | null;
          next_serial?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          local_id?: string | null;
          name?: string;
          notes?: string;
          phone?: string;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          address: string;
          announcement: string;
          cod_enabled: boolean;
          email: string;
          enquiries_open: boolean;
          free_shipping_above: number;
          id: number;
          instagram_url: string;
          last_sync_at: string | null;
          orders_open: boolean;
          phone: string;
          razorpay_enabled: boolean;
          shipping_fee: number;
          show_prices: boolean;
          show_stock_count: boolean;
          store_name: string;
          tagline: string;
          updated_at: string;
          upi_id: string;
          upi_manual_enabled: boolean;
          whatsapp_number: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          announcement?: string;
          cod_enabled?: boolean;
          email?: string;
          enquiries_open?: boolean;
          free_shipping_above?: number;
          id?: number;
          instagram_url?: string;
          last_sync_at?: string | null;
          orders_open?: boolean;
          phone?: string;
          razorpay_enabled?: boolean;
          shipping_fee?: number;
          show_prices?: boolean;
          show_stock_count?: boolean;
          store_name?: string;
          tagline?: string;
          updated_at?: string;
          upi_id?: string;
          upi_manual_enabled?: boolean;
          whatsapp_number?: string;
        };
        Update: {
          address?: string;
          announcement?: string;
          cod_enabled?: boolean;
          email?: string;
          enquiries_open?: boolean;
          free_shipping_above?: number;
          id?: number;
          instagram_url?: string;
          last_sync_at?: string | null;
          orders_open?: boolean;
          phone?: string;
          razorpay_enabled?: boolean;
          shipping_fee?: number;
          show_prices?: boolean;
          show_stock_count?: boolean;
          store_name?: string;
          tagline?: string;
          updated_at?: string;
          upi_id?: string;
          upi_manual_enabled?: boolean;
          whatsapp_number?: string;
        };
        Relationships: [];
      };
      subcategories: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          local_id: string | null;
          name: string;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          local_id?: string | null;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          local_id?: string | null;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subcategories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_summary";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      catalog: {
        Row: {
          added_at: string;
          category_id: string | null;
          category_name: string | null;
          category_slug: string | null;
          collection: string;
          colour: string;
          description: string | null;
          design_number: string;
          id: string;
          image_paths: string[] | null;
          in_stock: boolean | null;
          is_featured: boolean;
          material: string;
          mrp: number | null;
          name: string;
          price: number;
          search: unknown;
          size: string;
          sku: string;
          slug: string;
          stock_qty: number;
          subcategory_id: string | null;
          subcategory_name: string | null;
          subcategory_slug: string | null;
          tags: string[];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_summary";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_subcategory_id_fkey";
            columns: ["subcategory_id"];
            isOneToOne: false;
            referencedRelation: "subcategories";
            referencedColumns: ["id"];
          },
        ];
      };
      category_summary: {
        Row: {
          cover_path: string | null;
          description: string;
          id: string;
          image_path: string | null;
          name: string;
          product_count: number | null;
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Relationships: [];
      };
      shop_stock_age: {
        Row: {
          age_days: number | null;
          id: string | null;
          is_active: boolean | null;
          name: string | null;
          price: number | null;
          purchase_rate: number | null;
          since: string | null;
          sku: string | null;
          stock_qty: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_update_order: {
        Args: {
          p_note?: string;
          p_order: string;
          p_payment?: Database["public"]["Enums"]["payment_status"];
          p_status?: Database["public"]["Enums"]["order_status"];
          p_tracking?: string;
        };
        Returns: undefined;
      };
      cancel_my_order: { Args: { p_order: string }; Returns: undefined };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      order_admin_note: { Args: { p_order: string }; Returns: string };
      order_for_payment: { Args: { p_order: string; p_token: string }; Returns: Json };
      order_mark_paid: {
        Args: {
          p_amount_paise: number;
          p_gateway_order: string;
          p_payment_id: string;
          p_raw: Json;
        };
        Returns: string;
      };
      order_return_stock: { Args: { p_order: string }; Returns: undefined };
      order_set_gateway: {
        Args: { p_gateway_order: string; p_order: string; p_token: string };
        Returns: undefined;
      };
      order_take_stock: {
        Args: { p_product: string; p_qty: number; p_ref: string };
        Returns: Json;
      };
      place_order: {
        Args: {
          p_address_id: string;
          p_items: Json;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_notes?: string;
        };
        Returns: {
          id: string;
          number: string;
          pay_token: string;
          total: number;
        }[];
      };
      release_unpaid_orders: { Args: Record<PropertyKey, never>; Returns: number };
      shop_bump_code: { Args: { p_code: string }; Returns: string };
      shop_cancel_sale: { Args: { p_sale: string }; Returns: undefined };
      shop_clean_phone: { Args: { p: string }; Returns: string };
      shop_create_sale: { Args: { p: Json }; Returns: Json };
      shop_import: { Args: { p: Json }; Returns: Json };
      shop_next_barcode: { Args: Record<PropertyKey, never>; Returns: string };
      shop_next_code: {
        Args: { p_category: string; p_location?: string; p_vendor?: string };
        Returns: Json;
      };
      shop_require_admin: { Args: Record<PropertyKey, never>; Returns: undefined };
      shop_save_product: { Args: { p: Json }; Returns: string };
      shop_set_stock: {
        Args: { p_location: string; p_note?: string; p_product: string; p_qty: number };
        Returns: number;
      };
      shop_store_collections: {
        Args: Record<PropertyKey, never>;
        Returns: {
          doc: Json;
          name: string;
          records: number;
          revision: number;
        }[];
      };
      shop_store_commit: { Args: { p_ops: Json }; Returns: undefined };
      shop_store_records: {
        Args: { p_after?: number; p_collection: string; p_limit?: number };
        Returns: {
          data: Json;
          seq: number;
        }[];
      };
      shop_store_replace: { Args: { p_cols: Json }; Returns: undefined };
      shop_next_vendor_no: { Args: { p_location: string }; Returns: number };
      shop_scheme_code: {
        Args: { p_guarantee?: boolean; p_location?: string; p_vendor: string };
        Returns: Json;
      };
      shop_scheme_format: {
        Args: { p_guarantee: boolean; p_location: string; p_serial: number; p_vendor: string };
        Returns: string;
      };
      shop_stock_age_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      shop_suggest_code: {
        Args: { p_category?: string; p_guarantee?: boolean; p_location?: string; p_vendor?: string };
        Returns: Json;
      };
      shop_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      slugify: { Args: { txt: string }; Returns: string };
      submit_enquiry: {
        Args: {
          p_city: string;
          p_email: string;
          p_items: Json;
          p_message: string;
          p_name: string;
          p_phone: string;
          p_source?: string;
        };
        Returns: {
          id: string;
          number: string;
        }[];
      };
    };
    Enums: {
      enquiry_status: "new" | "contacted" | "confirmed" | "completed" | "cancelled";
      order_status: "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";
      payment_method: "razorpay" | "upi_manual" | "cod";
      payment_status: "pending" | "paid" | "failed" | "refunded";
      user_role: "admin" | "customer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      enquiry_status: ["new", "contacted", "confirmed", "completed", "cancelled"],
      order_status: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"],
      payment_method: ["razorpay", "upi_manual", "cod"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      user_role: ["admin", "customer"],
    },
  },
} as const;
