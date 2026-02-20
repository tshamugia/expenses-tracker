export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      Expense: {
        Row: {
          amount: number
          category: string | null
          createdAt: string
          currency: string
          description: string | null
          id: string
          isRecurring: boolean
          nextDueDate: string | null
          recurrenceRule: string | null
          startDate: string | null
          title: string
          updatedAt: string
          userId: string
        }
        Insert: {
          amount: number
          category?: string | null
          createdAt?: string
          currency?: string
          description?: string | null
          id?: string
          isRecurring?: boolean
          nextDueDate?: string | null
          recurrenceRule?: string | null
          startDate?: string | null
          title: string
          updatedAt?: string
          userId: string
        }
        Update: {
          amount?: number
          category?: string | null
          createdAt?: string
          currency?: string
          description?: string | null
          id?: string
          isRecurring?: boolean
          nextDueDate?: string | null
          recurrenceRule?: string | null
          startDate?: string | null
          title?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "Expense_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      NotificationPreference: {
        Row: {
          emailEnabled: boolean
          id: string
          notifyBeforeDays: number
          pushEnabled: boolean
          smsEnabled: boolean
          userId: string
        }
        Insert: {
          emailEnabled?: boolean
          id?: string
          notifyBeforeDays?: number
          pushEnabled?: boolean
          smsEnabled?: boolean
          userId: string
        }
        Update: {
          emailEnabled?: boolean
          id?: string
          notifyBeforeDays?: number
          pushEnabled?: boolean
          smsEnabled?: boolean
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "NotificationPreference_userId_fkey"
            columns: ["userId"]
            isOneToOne: true
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Payment: {
        Row: {
          amount: number
          createdAt: string
          dueDate: string
          expenseId: string
          id: string
          paid: boolean
          paidAt: string | null
          snoozedUntil: string | null
          updatedAt: string
        }
        Insert: {
          amount: number
          createdAt?: string
          dueDate: string
          expenseId: string
          id?: string
          paid?: boolean
          paidAt?: string | null
          snoozedUntil?: string | null
          updatedAt?: string
        }
        Update: {
          amount?: number
          createdAt?: string
          dueDate?: string
          expenseId?: string
          id?: string
          paid?: boolean
          paidAt?: string | null
          snoozedUntil?: string | null
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Payment_expenseId_fkey"
            columns: ["expenseId"]
            isOneToOne: false
            referencedRelation: "Expense"
            referencedColumns: ["id"]
          },
        ]
      }
      User: {
        Row: {
          createdAt: string
          email: string
          id: string
          image: string | null
          name: string | null
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          email: string
          id?: string
          image?: string | null
          name?: string | null
          updatedAt?: string
        }
        Update: {
          createdAt?: string
          email?: string
          id?: string
          image?: string | null
          name?: string | null
          updatedAt?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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

type DefaultSchema = Database["public"]

export type Tables<
  TableName extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][TableName]["Row"]

export type TablesInsert<
  TableName extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][TableName]["Insert"]

export type TablesUpdate<
  TableName extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][TableName]["Update"]
