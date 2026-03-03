import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SAAS_POLICY = {
  verticalPolicyId: 'policy-saas-v1',
  verticalKey: 'saas',
  version: '1.0',
  stages: [
    { stageKey: 'Prospect', displayName: 'Prospect', order: 1 },
    { stageKey: 'Qualified', displayName: 'Qualified', order: 2 },
    { stageKey: 'Proposal', displayName: 'Proposal', order: 3 },
    { stageKey: 'Negotiation', displayName: 'Negotiation', order: 4 },
    { stageKey: 'ClosedWon', displayName: 'Closed Won', order: 5 },
    { stageKey: 'ClosedLost', displayName: 'Closed Lost', order: 6 },
  ],
  transitions: [
    { fromStageKey: 'Prospect', toStageKey: 'Qualified' },
    { fromStageKey: 'Qualified', toStageKey: 'Proposal' },
    { fromStageKey: 'Proposal', toStageKey: 'Negotiation' },
    { fromStageKey: 'Negotiation', toStageKey: 'ClosedWon' },
    { fromStageKey: 'Negotiation', toStageKey: 'ClosedLost' },
  ],
  requiredFieldsByTransition: {
    'Prospect->Qualified': ['budget', 'timeline'],
    'Qualified->Proposal': ['proposalSentDate'],
  },
  approvalRules: [
    { discountThresholdPercent: 20, requiredApproverRole: 'SalesDirector' },
  ],
  complianceRules: {
    allowedOutboundChannels: ['Email', 'Phone'],
    dncOverrideAllowed: true,
    dncOverrideRequiredRole: 'ComplianceOfficer',
    consentRequiredChannels: ['Email'],
    ndaGatingEnabled: false,
  },
  handoffPlaybooks: [
    { requiredFields: ['scope', 'billingDetails', 'startDate'] },
  ],
  qualificationFramework: {
    framework: 'BANT',
    requiredKeys: ['budget', 'authority', 'need', 'timeline'],
  },
  closedWonRequiredFields: ['contractRef'],
  permittedOverrides: ['DNCOverride'],
  permittedOverriderRoles: ['ComplianceOfficer'],
};

async function main() {
  console.log('Seeding demo data...');

  // Org
  const org = await prisma.organization.upsert({
    where: { id: 'org-acme' },
    update: {},
    create: { id: 'org-acme', name: 'Acme SaaS' },
  });

  // Policy
  const policy = await prisma.verticalPolicy.upsert({
    where: { id: 'policy-saas-v1' },
    update: {},
    create: {
      id: 'policy-saas-v1',
      orgId: org.id,
      verticalKey: 'saas',
      version: '1.0',
      config: SAAS_POLICY as any,
    },
  });

  // Select policy
  await prisma.organization.update({ where: { id: org.id }, data: { selectedVerticalPolicyId: policy.id } });

  // Accounts
  const acct1 = await prisma.account.upsert({
    where: { id: 'acct-1' },
    update: {},
    create: { id: 'acct-1', orgId: org.id, legalName: 'Globex Corp', segment: 'Enterprise', territory: 'AMER', riskFlags: [], activeNdaOnFile: true },
  });
  const acct2 = await prisma.account.upsert({
    where: { id: 'acct-2' },
    update: {},
    create: { id: 'acct-2', orgId: org.id, legalName: 'Initech LLC', segment: 'Mid-Market', territory: 'EMEA', riskFlags: [], activeNdaOnFile: false },
  });
  const acct3 = await prisma.account.upsert({
    where: { id: 'acct-3' },
    update: {},
    create: { id: 'acct-3', orgId: org.id, legalName: 'Umbrella Ltd', segment: 'SMB', territory: 'APAC', riskFlags: ['CreditHold'], activeNdaOnFile: false },
  });

  // Contacts
  await prisma.contact.upsert({
    where: { id: 'cont-1' },
    update: {},
    create: { id: 'cont-1', orgId: org.id, accountId: acct1.id, email: 'alice@globex.com', phone: '+1-555-0101', consentStatus: 'OptIn', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-2' },
    update: {},
    create: { id: 'cont-2', orgId: org.id, accountId: acct1.id, email: 'bob@globex.com', phone: '+1-555-0102', consentStatus: 'SoftOptIn', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-3' },
    update: {},
    create: { id: 'cont-3', orgId: org.id, accountId: acct2.id, email: 'carol@initech.com', phone: '+1-555-0201', consentStatus: 'OptOut', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-4' },
    update: {},
    create: { id: 'cont-4', orgId: org.id, accountId: acct3.id, email: 'dave@umbrella.com', phone: '+1-555-0301', consentStatus: 'Unknown', doNotContact: true },
  });

  // Leads
  await prisma.lead.upsert({
    where: { id: 'lead-1' },
    update: {},
    create: { id: 'lead-1', orgId: org.id, source: 'Inbound', status: 'New' },
  });
  await prisma.lead.upsert({
    where: { id: 'lead-2' },
    update: {},
    create: { id: 'lead-2', orgId: org.id, source: 'Outbound', status: 'Working', assignedToUserId: 'user-ae-1' },
  });
  await prisma.lead.upsert({
    where: { id: 'lead-3' },
    update: {},
    create: { id: 'lead-3', orgId: org.id, source: 'Partner', status: 'Qualified', assignedToUserId: 'user-ae-2', qualificationChecklist: { framework: 'BANT', completedKeys: ['budget', 'authority', 'need', 'timeline'] } },
  });
  await prisma.lead.upsert({
    where: { id: 'lead-4' },
    update: {},
    create: { id: 'lead-4', orgId: org.id, source: 'Event', status: 'Disqualified' },
  });

  // Opportunities
  const opp1 = await prisma.opportunity.upsert({
    where: { id: 'opp-1' },
    update: {},
    create: { id: 'opp-1', orgId: org.id, accountId: acct1.id, name: 'Globex Platform Deal', amount: 120000, expectedCloseDate: new Date('2026-06-30'), stageKey: 'Prospect', forecastCategory: 'Pipeline' },
  });
  const opp2 = await prisma.opportunity.upsert({
    where: { id: 'opp-2' },
    update: {},
    create: { id: 'opp-2', orgId: org.id, accountId: acct1.id, name: 'Globex Analytics Add-on', amount: 45000, expectedCloseDate: new Date('2026-05-31'), stageKey: 'Qualified', forecastCategory: 'BestCase' },
  });
  const opp3 = await prisma.opportunity.upsert({
    where: { id: 'opp-3' },
    update: {},
    create: { id: 'opp-3', orgId: org.id, accountId: acct2.id, name: 'Initech Starter Plan', amount: 28000, expectedCloseDate: new Date('2026-04-30'), stageKey: 'Proposal', forecastCategory: 'Commit' },
  });
  const opp4 = await prisma.opportunity.upsert({
    where: { id: 'opp-4' },
    update: {},
    create: { id: 'opp-4', orgId: org.id, accountId: acct2.id, name: 'Initech Enterprise Upgrade', amount: 95000, expectedCloseDate: new Date('2026-04-15'), stageKey: 'Negotiation', forecastCategory: 'Commit' },
  });
  const opp5 = await prisma.opportunity.upsert({
    where: { id: 'opp-5' },
    update: {},
    create: { id: 'opp-5', orgId: org.id, accountId: acct3.id, name: 'Umbrella Basic Plan', amount: 12000, expectedCloseDate: new Date('2026-07-31'), stageKey: 'Prospect', forecastCategory: 'Pipeline' },
  });

  // Quotes
  await prisma.quote.upsert({
    where: { id: 'quote-1' },
    update: {},
    create: { id: 'quote-1', opportunityId: opp3.id, lineItems: [{ productKey: 'starter', quantity: 1, unitPrice: 28000 }], discountPercent: 5, nonStandardTerms: [], approvalStatus: 'Pending', marginPercent: 40 },
  });
  await prisma.quote.upsert({
    where: { id: 'quote-2' },
    update: {},
    create: { id: 'quote-2', opportunityId: opp4.id, lineItems: [{ productKey: 'enterprise', quantity: 1, unitPrice: 95000 }], discountPercent: 10, nonStandardTerms: [], approvalStatus: 'Approved', marginPercent: 55 },
  });

  // Handoff
  await prisma.handoff.upsert({
    where: { id: 'handoff-1' },
    update: {},
    create: { id: 'handoff-1', opportunityId: opp4.id, status: 'Draft', keyStakeholderIds: ['cont-1'], completedChecklistItems: [] },
  });

  console.log('Seed complete!');
  console.log('Org ID: org-acme');
  console.log('Policy ID: policy-saas-v1');
}

main().catch(console.error).finally(() => prisma.$disconnect());
