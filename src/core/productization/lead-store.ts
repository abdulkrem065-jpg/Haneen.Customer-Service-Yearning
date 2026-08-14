export interface DigitalServiceLead {
  id: string;
  conversationId: string;
  tenantId: string;
  storeId: string;
  name: string;
  phone: string;
  serviceType: string;
  email?: string;
  userConfirmed: boolean;
  createdAt: Date;
}

export interface LeadStoreOptions {
  maxLeads?: number;
}

export class InMemoryLeadStore {
  private leads: Map<string, DigitalServiceLead> = new Map();
  private maxLeads: number;

  constructor(options?: LeadStoreOptions) {
    this.maxLeads = options?.maxLeads ?? 1000;
  }

  /**
   * Records a lead ONLY if userConfirmed is true.
   * Throws error if userConfirmed is false or mandatory fields are missing.
   */
  public recordLead(lead: Omit<DigitalServiceLead, 'id' | 'createdAt'>): DigitalServiceLead {
    if (!lead.userConfirmed) {
      throw new Error('Lead registration rejected: userConfirmed must be true before recording lead');
    }

    if (!lead.name || !lead.phone || !lead.serviceType) {
      throw new Error('Lead registration rejected: name, phone, and serviceType are required');
    }

    if (this.leads.size >= this.maxLeads) {
      this.evictOldestLead();
    }

    const leadId = `lead-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const fullLead: DigitalServiceLead = {
      ...lead,
      id: leadId,
      createdAt: new Date()
    };

    this.leads.set(leadId, fullLead);
    return fullLead;
  }

  public getLeadsByConversation(conversationId: string): DigitalServiceLead[] {
    return Array.from(this.leads.values()).filter(l => l.conversationId === conversationId);
  }

  public getAllLeads(): DigitalServiceLead[] {
    return Array.from(this.leads.values());
  }

  private evictOldestLead(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, lead] of this.leads.entries()) {
      const time = new Date(lead.createdAt).getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.leads.delete(oldestId);
    }
  }

  public clear(): void {
    this.leads.clear();
  }
}
