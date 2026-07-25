export type CustomerStatus =
  | "new"
  | "call_scheduled"
  | "calling"
  | "contacted"
  | "appointment_set"
  | "no_answer"
  | "not_interested"
  | "do_not_call";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "canceled"
  | "no_show";

export type CallOutcome =
  | "appointment_set"
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "call_back_later"
  | "error"
  | null;

// NB: these are `type`, not `interface` — postgrest-js's generic type
// resolution (ParseQuery / Simplify chains) fails to match interface types
// here and silently collapses query results to `never`. Keep these as type
// aliases even though interfaces would normally be preferred.

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: CustomerStatus;
  created_at: string;
};

export type SalesAgent = {
  id: string;
  name: string;
  email: string;
  calendly_url: string | null;
  calendly_access_token: string | null;
  calendly_refresh_token: string | null;
  calendly_user_uri: string | null;
  calendly_webhook_uri: string | null;
  calendly_webhook_signing_key: string | null;
  vapi_phone_number_id: string | null;
  vapi_phone_number: string | null;
  twilio_phone_number_sid: string | null;
  created_at: string;
};

export type Appointment = {
  id: string;
  customer_id: string;
  agent_id: string | null;
  scheduled_at: string;
  zoom_link: string | null;
  calendly_event_uri: string | null;
  status: AppointmentStatus;
  created_at: string;
};

export type AppointmentWithRelations = Appointment & {
  customer: Pick<Customer, "id" | "name" | "phone" | "email"> | null;
  agent: Pick<SalesAgent, "id" | "name" | "email"> | null;
};

export type Call = {
  id: string;
  customer_id: string;
  agent_id: string | null;
  vapi_call_id: string | null;
  transcript: string | null;
  recording_url: string | null;
  outcome: CallOutcome;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: Customer;
        Insert: Partial<Customer> & Pick<Customer, "name" | "phone">;
        Update: Partial<Customer>;
        Relationships: [];
      };
      sales_agents: {
        Row: SalesAgent;
        Insert: Partial<SalesAgent> & Pick<SalesAgent, "name" | "email">;
        Update: Partial<SalesAgent>;
        Relationships: [];
      };
      appointments: {
        Row: Appointment;
        Insert: Partial<Appointment> &
          Pick<Appointment, "customer_id" | "scheduled_at">;
        Update: Partial<Appointment>;
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: Call;
        Insert: Partial<Call> & Pick<Call, "customer_id">;
        Update: Partial<Call>;
        Relationships: [
          {
            foreignKeyName: "calls_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "sales_agents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
