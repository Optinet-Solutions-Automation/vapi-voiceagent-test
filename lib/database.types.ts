export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "agent";
          content: string;
          order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "agent";
          content: string;
          order: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: "user" | "agent";
          content?: string;
          order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          message_id: string;
          parent_id: string | null;
          author: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          parent_id?: string | null;
          author?: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          parent_id?: string | null;
          author?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          id: string;
          conversation_id: string;
          author: string;
          rating: number | null;
          text_content: string | null;
          audio_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          author?: string;
          rating?: number | null;
          text_content?: string | null;
          audio_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          author?: string;
          rating?: number | null;
          text_content?: string | null;
          audio_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
