// Supabase generated types - replace with actual output from:
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/database.types.ts
export type Database = {
  public: {
    Tables: {
      auth_users: {
        Row: {
          id: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
        }
      }
      auth: {
        users: {
          Row: {
            id: string
            email: string
            created_at: string
          }
        }
      }
      user_profiles: {
        Row: {
          id: string
          display_name: string
          ldap_dn: string | null
          is_admin: boolean
          created_at: string
          updated_at: string
        }
      }
      app_roles: {
        Row: {
          id: number
          name: string
          description: string | null
          created_at: string
        }
      }
      user_app_roles: {
        Row: {
          id: string
          user_id: string
          role_id: number
          created_at: string
        }
      }
      cr_types: {
        Row: {
          id: number
          name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
      }
      workflow_steps: {
        Row: {
          id: number
          cr_type_id: number
          step_order: number
          step_key: string
          step_label: string
          can_skip: boolean
          requires_role: string | null
          notify_on_complete: string[] | null
          created_at: string
        }
      }
      system_tiers: {
        Row: {
          id: number
          code: string
          label: string
          priority: number
        }
      }
      change_requests: {
        Row: {
          id: string
          cr_number: string
          cr_type_id: number | null
          title: string
          description: string
          applicant_id: string | null
          applicant_supervisor_id: string | null
          system_tier_id: number | null
          is_internet_facing: boolean
          risk_level: 'high' | 'medium' | 'low'
          status: string
          current_step_key: string | null
          current_step_order: number | null
          approvals: unknown
          submitted_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
      }
      cr_impact_analysis: {
        Row: {
          id: string
          cr_id: string
          affected_systems: string | null
          impact_description: string | null
          rollback_plan: string | null
          outage_window: string | null
          created_at: string
          updated_at: string
        }
      }
      cr_cost_estimate: {
        Row: {
          id: string
          cr_id: string
          labor_cost: number | null
          material_cost: number | null
          total_cost: number | null
          currency: string
          notes: string | null
          created_at: string
          updated_at: string
        }
      }
      cr_system_design: {
        Row: {
          id: string
          cr_id: string
          design_details: string | null
          tech_stack: string | null
          created_at: string
          updated_at: string
        }
      }
      cr_sit_test_cases: {
        Row: {
          id: string
          cr_id: string
          test_cases: unknown
          created_at: string
          updated_at: string
        }
      }
      cr_sit_results: {
        Row: {
          id: string
          cr_id: string
          results: unknown
          created_at: string
          updated_at: string
        }
      }
      cr_uat_test_cases: {
        Row: {
          id: string
          cr_id: string
          test_cases: unknown
          created_at: string
          updated_at: string
        }
      }
      cr_uat_results: {
        Row: {
          id: string
          cr_id: string
          results: unknown
          created_at: string
          updated_at: string
        }
      }
      cr_deployment_record: {
        Row: {
          id: string
          cr_id: string
          deployed_by: string | null
          deployed_at: string | null
          deployment_notes: string | null
          check_by_1: string | null
          check_by_2: string | null
          check_completed_at: string | null
          created_at: string
        }
      }
      cr_chat_messages: {
        Row: {
          id: string
          cr_id: string
          sender_id: string | null
          body: string
          mentions: string[] | null
          created_at: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          cr_id: string | null
          type: string
          subject: string
          body: string | null
          is_read: boolean
          created_at: string
        }
      }
      cr_audit_log: {
        Row: {
          id: string
          cr_id: string
          user_id: string | null
          action: string
          step_key: string | null
          details: unknown
          created_at: string
        }
      }
    }
  }
}