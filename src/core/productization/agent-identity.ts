export interface AgentIdentityConfig {
  agentId: string;
  displayName: string;
  role: string;
  greeting: string;
  enabled: boolean;
}

export const DEFAULT_AGENT_IDENTITY: AgentIdentityConfig = {
  agentId: 'agt-c93183d5', // Fixed internal identifier
  displayName: 'سناء', // Default configuration-driven display name
  role: 'المساعد الذكي لخدمة العملاء',
  greeting: 'أهلاً بك! أنا سناء، مساعدتك الذكية لخدمة العملاء في متجر الذيباني. يسعدني إجابة جميع استفساراتك حول المنتجات والأسعار وطرق الدفع وساعات العمل والتوصيل والخدمات الرقمية. كيف يمكنني مساعدتك اليوم؟',
  enabled: true
};

export class AgentIdentityStore {
  private static instance: AgentIdentityStore;
  private currentConfig: AgentIdentityConfig;

  private constructor() {
    this.currentConfig = { ...DEFAULT_AGENT_IDENTITY };
  }

  public static getInstance(): AgentIdentityStore {
    if (!AgentIdentityStore.instance) {
      AgentIdentityStore.instance = new AgentIdentityStore();
    }
    return AgentIdentityStore.instance;
  }

  public getIdentity(): AgentIdentityConfig {
    return { ...this.currentConfig };
  }

  /**
   * Updates display identity configuration (displayName, role, greeting, enabled).
   * Note: agentId is strictly immutable and remains 'agt-c93183d5'.
   */
  public updateIdentity(updates: Partial<Omit<AgentIdentityConfig, 'agentId'>>): AgentIdentityConfig {
    this.currentConfig = {
      ...this.currentConfig,
      ...updates,
      agentId: DEFAULT_AGENT_IDENTITY.agentId // Strictly preserve fixed internal agentId
    };
    return this.getIdentity();
  }

  public resetToDefault(): void {
    this.currentConfig = { ...DEFAULT_AGENT_IDENTITY };
  }
}
