export type ItemStatus = "open" | "in_progress" | "done" | "has_question";

export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          title: string;
          vapi_call_id: string | null;
          assistant_id: string | null;
          assistant_name: string | null;
          tester: string | null;
          prompt_id: string | null;
          prompt_name: string | null;
          prompt_content: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title?: string;
          vapi_call_id?: string | null;
          assistant_id?: string | null;
          assistant_name?: string | null;
          tester?: string | null;
          prompt_id?: string | null;
          prompt_name?: string | null;
          prompt_content?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          vapi_call_id?: string | null;
          assistant_id?: string | null;
          assistant_name?: string | null;
          tester?: string | null;
          prompt_id?: string | null;
          prompt_name?: string | null;
          prompt_content?: string | null;
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
          status: ItemStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          parent_id?: string | null;
          author?: string;
          content: string;
          status?: ItemStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          parent_id?: string | null;
          author?: string;
          content?: string;
          status?: ItemStatus;
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
          status: ItemStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          author?: string;
          rating?: number | null;
          text_content?: string | null;
          audio_url?: string | null;
          status?: ItemStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          author?: string;
          rating?: number | null;
          text_content?: string | null;
          audio_url?: string | null;
          status?: ItemStatus;
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
      tracker_items: {
        Row: {
          id: string;
          conversation_id: string | null;
          author: string;
          content: string;
          status: ItemStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id?: string | null;
          author?: string;
          content: string;
          status?: ItemStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string | null;
          author?: string;
          content?: string;
          status?: ItemStatus;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracker_items_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      tracker_replies: {
        Row: {
          id: string;
          parent_kind: "comment" | "feedback" | "item";
          parent_id: string;
          author: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_kind: "comment" | "feedback" | "item";
          parent_id: string;
          author?: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_kind?: "comment" | "feedback" | "item";
          parent_id?: string;
          author?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      call_transcripts: {
        Row: {
          id: string;
          title: string;
          content: string;
          notes: string;
          classification: "good" | "bad" | "unclassified";
          ai_analysis: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title?: string;
          content: string;
          notes?: string;
          classification?: "good" | "bad" | "unclassified";
          ai_analysis?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          notes?: string;
          classification?: "good" | "bad" | "unclassified";
          ai_analysis?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      transcript_questions: {
        Row: {
          id: string;
          question: string;
          answer: string;
          transcript_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          question: string;
          answer?: string;
          transcript_ids?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          question?: string;
          answer?: string;
          transcript_ids?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      prompt_library: {
        Row: {
          id: string;
          name: string;
          content: string;
          notes: string;
          is_active: boolean;
          assistant_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          content: string;
          notes?: string;
          is_active?: boolean;
          assistant_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          content?: string;
          notes?: string;
          is_active?: boolean;
          assistant_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_configs: {
        Row: {
          id: string;
          name: string;
          password_hash: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          password_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          password_hash?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      call_settings: {
        Row: {
          id: string;
          voice_provider: string;
          voice_id: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          voice_provider: string;
          voice_id: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          voice_provider?: string;
          voice_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_favorites: {
        Row: {
          conversation_id: string;
          user_nickname: string;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          user_nickname: string;
          created_at?: string;
        };
        Update: {
          conversation_id?: string;
          user_nickname?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      listener_handlers: {
        Row: {
          id: string;
          name: string;
          intent_key: string;
          description: string;
          response_template: string;
          action_type: "answer" | "send_sms" | "give_offer" | "end_call" | "ignore";
          delivery: "verbatim" | "reword";
          enabled: boolean;
          priority: number;
          mode: "tool" | "listener" | "both";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          intent_key: string;
          description?: string;
          response_template?: string;
          action_type?: "answer" | "send_sms" | "give_offer" | "end_call" | "ignore";
          delivery?: "verbatim" | "reword";
          enabled?: boolean;
          priority?: number;
          mode?: "tool" | "listener" | "both";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          intent_key?: string;
          description?: string;
          response_template?: string;
          action_type?: "answer" | "send_sms" | "give_offer" | "end_call" | "ignore";
          delivery?: "verbatim" | "reword";
          enabled?: boolean;
          priority?: number;
          mode?: "tool" | "listener" | "both";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lab_call_events: {
        Row: {
          id: number;
          call_id: string;
          event_type: string;
          role: string | null;
          content: string | null;
          intent_key: string | null;
          confidence: number | null;
          handler_id: string | null;
          action_type: string | null;
          utterance_at: string | null;
          received_at: string;
          classified_at: string | null;
          injected_at: string | null;
          latency_ms: number | null;
          meta: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          call_id: string;
          event_type: string;
          role?: string | null;
          content?: string | null;
          intent_key?: string | null;
          confidence?: number | null;
          handler_id?: string | null;
          action_type?: string | null;
          utterance_at?: string | null;
          received_at?: string;
          classified_at?: string | null;
          injected_at?: string | null;
          latency_ms?: number | null;
          meta?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          call_id?: string;
          event_type?: string;
          role?: string | null;
          content?: string | null;
          intent_key?: string | null;
          confidence?: number | null;
          handler_id?: string | null;
          action_type?: string | null;
          utterance_at?: string | null;
          received_at?: string;
          classified_at?: string | null;
          injected_at?: string | null;
          latency_ms?: number | null;
          meta?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      lab_settings: {
        Row: {
          id: string;
          lab_assistant_id: string | null;
          short_prompt: string | null;
          router_model: string;
          confidence_threshold: number;
          injection_cooldown_ms: number;
          trigger_response: boolean;
          server_url_override: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lab_assistant_id?: string | null;
          short_prompt?: string | null;
          router_model?: string;
          confidence_threshold?: number;
          injection_cooldown_ms?: number;
          trigger_response?: boolean;
          server_url_override?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lab_assistant_id?: string | null;
          short_prompt?: string | null;
          router_model?: string;
          confidence_threshold?: number;
          injection_cooldown_ms?: number;
          trigger_response?: boolean;
          server_url_override?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationFavorite = Database["public"]["Tables"]["conversation_favorites"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
export type TrackerItem = Database["public"]["Tables"]["tracker_items"]["Row"];
export type TrackerReply = Database["public"]["Tables"]["tracker_replies"]["Row"];
export type CallTranscript = Database["public"]["Tables"]["call_transcripts"]["Row"];
export type TranscriptQuestion = Database["public"]["Tables"]["transcript_questions"]["Row"];
export type PromptLibraryItem = Database["public"]["Tables"]["prompt_library"]["Row"];
export type CallSettings = Database["public"]["Tables"]["call_settings"]["Row"];
export type AgentConfig = Database["public"]["Tables"]["agent_configs"]["Row"];
export type ListenerHandler = Database["public"]["Tables"]["listener_handlers"]["Row"];
export type LabCallEvent = Database["public"]["Tables"]["lab_call_events"]["Row"];
export type LabSettings = Database["public"]["Tables"]["lab_settings"]["Row"];
