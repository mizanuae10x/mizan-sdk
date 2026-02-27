import { MizanAgent, UAEComplianceLayer, MockAdapter, Rule } from '../src';

class ComplianceAgent extends MizanAgent {
  async think(input: Record<string, unknown>): Promise<string> {
    if (this.adapter) {
      return this.adapter.complete(JSON.stringify(input));
    }
    return 'No adapter configured.';
  }
}

async function main(): Promise<void> {
  const compliance = new UAEComplianceLayer({
    frameworks: ['PDPL', 'UAE_AI_ETHICS', 'NESA'],
    language: 'both',
    auditLevel: 'full',
    dataResidency: 'UAE',
  });

  const rules: Rule[] = [
    {
      id: 'R001',
      name: 'High Risk Block',
      condition: 'risk > 0.8',
      action: 'REJECTED',
      reason: 'Risk threshold exceeded',
      priority: 1,
    },
  ];

  const agent = new ComplianceAgent({
    adapter: new MockAdapter('Loan application queued for review.'),
    rules,
    compliance,
  });

  const response = await agent.run({
    userId: 'U123',
    action: 'loan_application',
    amount: 50000,
    risk: 0.4,
    purpose: 'credit_assessment',
    consent: true,
    dataResidency: 'UAE',
    role: 'credit_officer',
    encryptionInTransit: true,
  });

  console.log('Decision:', response.decisions[0].result);
  console.log('Compliance Score:', response.decisions[0].complianceReport?.score);
  console.log('Arabic Summary:', response.decisions[0].complianceReport?.summaryAr);
}

main().catch(console.error);
