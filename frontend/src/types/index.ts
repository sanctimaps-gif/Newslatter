export type Role = 'admin' | 'editor' | 'viewer';
export interface User { id: number; email: string; displayName: string; role: Role; totpEnabled: boolean }
export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'suspended';
export interface Subscriber {
  id: number; email: string; first_name: string | null; last_name: string | null; status: SubscriberStatus; source: string; tags: string[];
  subscribed_at: string; confirmed_at: string | null; unsubscribed_at: string | null; created_at: string; notes?: string | null; bounce_count?: number;
}
export type CampaignStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'paused';
export interface CampaignRow {
  id: number; name: string; subject: string; status: CampaignStatus; scheduled_at: string | null; timezone: string; started_at: string | null; finished_at: string | null;
  recipient_count: number | null; created_at: string; updated_at: string; accepted?: number; bounced?: number; clickers?: number;
}
export interface MediaFile { id: number; filename: string; original_name: string; url: string; width: number | null; height: number | null; alt_text: string; size_bytes: number; created_at: string }
export interface Template { id: number; name: string; description: string; category: string; is_system: boolean; design: any; updated_at: string }
