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

export class InMemoryLeadStore {
  private leads: Map<string, DigitalServiceLead> = new Map();

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

  public clear(): void {
    this.leads.clear();
  }
}
