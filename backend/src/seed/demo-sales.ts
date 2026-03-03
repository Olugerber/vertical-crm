import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { dispatch } from '../services/eventDispatcher.js';

const prisma = new PrismaClient();

const ORG_ID = 'org-acme-sales';
const POLICY_ID = 'policy-saas-sales-v1';

const SAAS_POLICY = {
  verticalPolicyId: POLICY_ID,
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
  console.log('Running demo-sales seed...');

  // ── 1. Org ────────────────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: 'Acme SaaS Inc', website: 'https://acmesaas.com', industry: 'Software' },
    create: { id: ORG_ID, name: 'Acme SaaS Inc', website: 'https://acmesaas.com', industry: 'Software' },
  });

  // ── 2. Policy ─────────────────────────────────────────────────────────────────
  const policy = await prisma.verticalPolicy.upsert({
    where: { id: POLICY_ID },
    update: {
      verticalKey: SAAS_POLICY.verticalKey,
      version: SAAS_POLICY.version,
      config: SAAS_POLICY as any,
      activatedAt: new Date(),
      activatedBy: 'user-admin',
    },
    create: {
      id: POLICY_ID,
      orgId: ORG_ID,
      verticalKey: SAAS_POLICY.verticalKey,
      version: SAAS_POLICY.version,
      config: SAAS_POLICY as any,
      activatedAt: new Date(),
      activatedBy: 'user-admin',
    },
  });

  // ── 3. Activate policy on org ─────────────────────────────────────────────────
  await prisma.organization.update({
    where: { id: ORG_ID },
    data: { selectedVerticalPolicyId: POLICY_ID },
  });

  // ── 4. Users ──────────────────────────────────────────────────────────────────
  const users = [
    { id: 'user-admin', email: 'admin@acme.com', name: 'Alex Admin', roles: ['Admin'] },
    { id: 'user-sm', email: 'sarah@acme.com', name: 'Sarah Manager', roles: ['SalesManager'] },
    { id: 'user-ae1', email: 'john@acme.com', name: 'John AE', roles: ['AE'] },
    { id: 'user-ae2', email: 'lisa@acme.com', name: 'Lisa AE', roles: ['AE'] },
    { id: 'user-comp', email: 'compliance@acme.com', name: 'Chris Compliance', roles: ['Compliance', 'ComplianceOfficer'] },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email, name: u.name, roles: u.roles },
      create: { id: u.id, orgId: ORG_ID, email: u.email, name: u.name, roles: u.roles },
    });
  }

  // ── 5. Accounts ───────────────────────────────────────────────────────────────
  const acct1 = await prisma.account.upsert({
    where: { id: 'acct-sales-1' },
    update: {},
    create: { id: 'acct-sales-1', orgId: ORG_ID, legalName: 'Globex Corp', segment: 'Enterprise', territory: 'AMER', riskFlags: [], activeNdaOnFile: true },
  });
  const acct2 = await prisma.account.upsert({
    where: { id: 'acct-sales-2' },
    update: {},
    create: { id: 'acct-sales-2', orgId: ORG_ID, legalName: 'Initech LLC', segment: 'Mid-Market', territory: 'EMEA', riskFlags: [], activeNdaOnFile: false },
  });
  const acct3 = await prisma.account.upsert({
    where: { id: 'acct-sales-3' },
    update: {},
    create: { id: 'acct-sales-3', orgId: ORG_ID, legalName: 'Umbrella Ltd', segment: 'SMB', territory: 'APAC', riskFlags: ['CreditHold'], activeNdaOnFile: false },
  });

  // ── 6. Contacts (mixed consent) ───────────────────────────────────────────────
  await prisma.contact.upsert({
    where: { id: 'cont-sales-1' },
    update: {},
    create: { id: 'cont-sales-1', orgId: ORG_ID, accountId: acct1.id, email: 'alice@globex.com', phone: '+1-555-0101', consentStatus: 'OptIn', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-sales-2' },
    update: {},
    create: { id: 'cont-sales-2', orgId: ORG_ID, accountId: acct1.id, email: 'bob@globex.com', phone: '+1-555-0102', consentStatus: 'OptIn', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-sales-3' },
    update: {},
    create: { id: 'cont-sales-3', orgId: ORG_ID, accountId: acct2.id, email: 'carol@initech.com', phone: '+1-555-0201', consentStatus: 'SoftOptIn', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-sales-4' },
    update: {},
    create: { id: 'cont-sales-4', orgId: ORG_ID, accountId: acct2.id, email: 'dan@initech.com', phone: '+1-555-0202', consentStatus: 'OptOut', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-sales-5' },
    update: {},
    create: { id: 'cont-sales-5', orgId: ORG_ID, accountId: acct3.id, email: 'eve@umbrella.com', phone: '+1-555-0301', consentStatus: 'Unknown', doNotContact: false },
  });
  await prisma.contact.upsert({
    where: { id: 'cont-sales-6' },
    update: {},
    create: { id: 'cont-sales-6', orgId: ORG_ID, accountId: acct3.id, email: 'frank@umbrella.com', phone: '+1-555-0302', consentStatus: 'Unknown', doNotContact: true },
  });

  // ── 7. Opportunities (25 total across stages) ──────────────────────────────────
  // 5 Prospect
  const prospectOpps = [
    { id: 'opp-sales-p1', accountId: acct1.id, name: 'Globex Platform v2', amount: 150000, close: '2026-09-30' },
    { id: 'opp-sales-p2', accountId: acct1.id, name: 'Globex Mobile Suite', amount: 60000, close: '2026-10-31' },
    { id: 'opp-sales-p3', accountId: acct2.id, name: 'Initech Growth Pack', amount: 35000, close: '2026-09-15' },
    { id: 'opp-sales-p4', accountId: acct2.id, name: 'Initech API Add-on', amount: 18000, close: '2026-11-30' },
    { id: 'opp-sales-p5', accountId: acct3.id, name: 'Umbrella Starter Kit', amount: 9000, close: '2026-08-31' },
  ];
  for (const o of prospectOpps) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, orgId: ORG_ID, accountId: o.accountId, name: o.name, amount: o.amount, expectedCloseDate: new Date(o.close), stageKey: 'Prospect', forecastCategory: 'Pipeline' },
    });
  }

  // 5 Qualified
  const qualifiedOpps = [
    { id: 'opp-sales-q1', accountId: acct1.id, name: 'Globex Analytics Premium', amount: 85000, close: '2026-07-31' },
    { id: 'opp-sales-q2', accountId: acct1.id, name: 'Globex Security Module', amount: 45000, close: '2026-08-15' },
    { id: 'opp-sales-q3', accountId: acct2.id, name: 'Initech Enterprise Tier', amount: 110000, close: '2026-07-15' },
    { id: 'opp-sales-q4', accountId: acct2.id, name: 'Initech Compliance Tools', amount: 28000, close: '2026-08-01' },
    { id: 'opp-sales-q5', accountId: acct3.id, name: 'Umbrella Pro Plan', amount: 22000, close: '2026-07-30' },
  ];
  for (const o of qualifiedOpps) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, orgId: ORG_ID, accountId: o.accountId, name: o.name, amount: o.amount, expectedCloseDate: new Date(o.close), stageKey: 'Qualified', forecastCategory: 'BestCase' },
    });
  }

  // 5 Proposal
  const proposalOpps = [
    { id: 'opp-sales-pr1', accountId: acct1.id, name: 'Globex Full Suite Deal', amount: 220000, close: '2026-06-30' },
    { id: 'opp-sales-pr2', accountId: acct1.id, name: 'Globex Data Lake Connector', amount: 75000, close: '2026-06-15' },
    { id: 'opp-sales-pr3', accountId: acct2.id, name: 'Initech Platform Expansion', amount: 95000, close: '2026-05-31' },
    { id: 'opp-sales-pr4', accountId: acct2.id, name: 'Initech Support Premium', amount: 40000, close: '2026-06-01' },
    { id: 'opp-sales-pr5', accountId: acct3.id, name: 'Umbrella Business Plan', amount: 32000, close: '2026-05-15' },
  ];
  for (const o of proposalOpps) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, orgId: ORG_ID, accountId: o.accountId, name: o.name, amount: o.amount, expectedCloseDate: new Date(o.close), stageKey: 'Proposal', forecastCategory: 'Commit' },
    });
  }

  // 5 Negotiation
  const negotiationOpps = [
    { id: 'opp-sales-n1', accountId: acct1.id, name: 'Globex Enterprise Agreement', amount: 350000, close: '2026-04-30' },
    { id: 'opp-sales-n2', accountId: acct1.id, name: 'Globex SSO Integration', amount: 55000, close: '2026-05-01' },
    { id: 'opp-sales-n3', accountId: acct2.id, name: 'Initech Multi-Year Deal', amount: 180000, close: '2026-04-15' },
    { id: 'opp-sales-n4', accountId: acct2.id, name: 'Initech Custom Onboarding', amount: 25000, close: '2026-04-20' },
    { id: 'opp-sales-n5', accountId: acct3.id, name: 'Umbrella 2-Year Contract', amount: 48000, close: '2026-05-10' },
  ];
  for (const o of negotiationOpps) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, orgId: ORG_ID, accountId: o.accountId, name: o.name, amount: o.amount, expectedCloseDate: new Date(o.close), stageKey: 'Negotiation', forecastCategory: 'Commit' },
    });
  }

  // 3 ClosedWon
  const closedWonOpps = [
    { id: 'opp-sales-cw1', accountId: acct1.id, name: 'Globex Pilot Expansion', amount: 120000, close: '2026-02-28' },
    { id: 'opp-sales-cw2', accountId: acct2.id, name: 'Initech Initial License', amount: 65000, close: '2026-01-31' },
    { id: 'opp-sales-cw3', accountId: acct3.id, name: 'Umbrella Kickoff Deal', amount: 15000, close: '2026-03-01' },
  ];
  for (const o of closedWonOpps) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, orgId: ORG_ID, accountId: o.accountId, name: o.name, amount: o.amount, expectedCloseDate: new Date(o.close), stageKey: 'ClosedWon', forecastCategory: 'ClosedWon' },
    });
  }

  // 2 ClosedLost
  const closedLostOpps = [
    { id: 'opp-sales-cl1', accountId: acct2.id, name: 'Initech Legacy Migration', amount: 90000, close: '2026-01-15' },
    { id: 'opp-sales-cl2', accountId: acct3.id, name: 'Umbrella Advanced Add-on', amount: 20000, close: '2026-02-01' },
  ];
  for (const o of closedLostOpps) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, orgId: ORG_ID, accountId: o.accountId, name: o.name, amount: o.amount, expectedCloseDate: new Date(o.close), stageKey: 'ClosedLost', forecastCategory: 'Omitted' },
    });
  }

  // ── 8. Quotes with discounts >= 20% (threshold) for Proposal/Negotiation opps ──
  // These quotes have high discounts requiring SalesDirector approval — created directly as Pending
  const highDiscountQuotes = [
    {
      id: 'quote-sales-hd1',
      opportunityId: 'opp-sales-pr1', // Globex Full Suite Deal
      lineItems: [{ productKey: 'full-suite', quantity: 1, unitPrice: 220000 }],
      discountPercent: 22,
      marginPercent: 38,
      nonStandardTerms: ['Custom SLA', 'Dedicated CSM'],
      approvalStatus: 'Pending',
      submittedBy: 'user-ae1',
    },
    {
      id: 'quote-sales-hd2',
      opportunityId: 'opp-sales-pr3', // Initech Platform Expansion
      lineItems: [{ productKey: 'platform-expansion', quantity: 1, unitPrice: 95000 }],
      discountPercent: 25,
      marginPercent: 35,
      nonStandardTerms: ['Net-60 Payment'],
      approvalStatus: 'Pending',
      submittedBy: 'user-ae2',
    },
    {
      id: 'quote-sales-hd3',
      opportunityId: 'opp-sales-n1', // Globex Enterprise Agreement
      lineItems: [{ productKey: 'enterprise-agreement', quantity: 1, unitPrice: 350000 }],
      discountPercent: 30,
      marginPercent: 30,
      nonStandardTerms: ['Multi-year lock-in', 'Volume discount clause'],
      approvalStatus: 'Pending',
      submittedBy: 'user-ae1',
    },
    {
      id: 'quote-sales-hd4',
      opportunityId: 'opp-sales-n3', // Initech Multi-Year Deal
      lineItems: [{ productKey: 'multi-year', quantity: 3, unitPrice: 60000 }],
      discountPercent: 21,
      marginPercent: 40,
      nonStandardTerms: ['Annual price lock'],
      approvalStatus: 'Pending',
      submittedBy: 'user-ae2',
    },
    {
      id: 'quote-sales-hd5',
      opportunityId: 'opp-sales-pr2', // Globex Data Lake Connector
      lineItems: [{ productKey: 'data-lake-connector', quantity: 1, unitPrice: 75000 }],
      discountPercent: 20,
      marginPercent: 42,
      nonStandardTerms: [],
      approvalStatus: 'Pending',
      submittedBy: 'user-ae1',
    },
  ];

  for (const q of highDiscountQuotes) {
    await prisma.quote.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        opportunityId: q.opportunityId,
        lineItems: q.lineItems as any,
        discountPercent: q.discountPercent,
        marginPercent: q.marginPercent,
        nonStandardTerms: q.nonStandardTerms,
        approvalStatus: q.approvalStatus,
        submittedBy: q.submittedBy,
      },
    });
  }

  // Also create some standard (below-threshold) quotes for variety
  await prisma.quote.upsert({
    where: { id: 'quote-sales-std1' },
    update: {},
    create: {
      id: 'quote-sales-std1',
      opportunityId: 'opp-sales-n2', // Globex SSO Integration
      lineItems: [{ productKey: 'sso', quantity: 1, unitPrice: 55000 }] as any,
      discountPercent: 10,
      marginPercent: 55,
      nonStandardTerms: [],
      approvalStatus: 'Approved',
      submittedBy: 'user-ae1',
      approvedBy: 'user-sm',
    },
  });
  await prisma.quote.upsert({
    where: { id: 'quote-sales-std2' },
    update: {},
    create: {
      id: 'quote-sales-std2',
      opportunityId: 'opp-sales-pr4', // Initech Support Premium
      lineItems: [{ productKey: 'support-premium', quantity: 1, unitPrice: 40000 }] as any,
      discountPercent: 5,
      marginPercent: 60,
      nonStandardTerms: [],
      approvalStatus: 'NotRequired',
    },
  });

  // ── 9. Compliance-gated outbound attempts via dispatch ─────────────────────────
  // Attempting to contact OptOut and Unknown contacts — these will be blocked or flagged
  console.log('Recording compliance-gated outbound attempts...');

  // Attempt 1: contact with OptOut consent (cont-sales-4 = dan@initech.com)
  await dispatch({
    eventType: 'compliance.outbound_attempted',
    entityId: 'cont-sales-4',
    payload: { channel: 'Email', opportunityId: 'opp-sales-pr3' },
    organizationId: ORG_ID,
    userId: 'user-ae2',
    roles: ['AE'],
  });

  // Attempt 2: contact with Unknown consent (cont-sales-5 = eve@umbrella.com)
  await dispatch({
    eventType: 'compliance.outbound_attempted',
    entityId: 'cont-sales-5',
    payload: { channel: 'Email', opportunityId: 'opp-sales-n5' },
    organizationId: ORG_ID,
    userId: 'user-ae2',
    roles: ['AE'],
  });

  // Attempt 3: contact with DNC flag (cont-sales-6 = frank@umbrella.com, doNotContact: true)
  await dispatch({
    eventType: 'compliance.outbound_attempted',
    entityId: 'cont-sales-6',
    payload: { channel: 'Phone', opportunityId: 'opp-sales-p5' },
    organizationId: ORG_ID,
    userId: 'user-ae1',
    roles: ['AE'],
  });

  // ── 10. ComplianceOverrideRequested directly via prisma AuditEvent ─────────────
  await prisma.auditEvent.upsert({
    where: { id: 'audit-sales-override-1' },
    update: {},
    create: {
      id: 'audit-sales-override-1',
      orgId: ORG_ID,
      who: 'user-ae1',
      what: 'ComplianceOverrideRequested: AE requested DNC override for frank@umbrella.com to pursue Umbrella Basic Plan',
      when: new Date(),
      entityType: 'contact',
      entityId: 'cont-sales-6',
      policyId: POLICY_ID,
      policyVersion: '1.0',
    },
  });

  // ── Summary output ────────────────────────────────────────────────────────────
  console.log('');
  console.log('=== DEMO SEED COMPLETE ===');
  console.log(`Org ID: ${ORG_ID}`);
  console.log('Users:');
  console.log('  Admin:          user-admin (admin@acme.com)         roles: [Admin]');
  console.log('  Sales Manager:  user-sm (sarah@acme.com)            roles: [SalesManager]');
  console.log('  AE1:            user-ae1 (john@acme.com)            roles: [AE]');
  console.log('  AE2:            user-ae2 (lisa@acme.com)            roles: [AE]');
  console.log('  Compliance:     user-comp (compliance@acme.com)     roles: [Compliance, ComplianceOfficer]');
  console.log('');
  console.log('Opportunities seeded: 25');
  console.log('  Prospect:    5 (opp-sales-p1 through p5)');
  console.log('  Qualified:   5 (opp-sales-q1 through q5)');
  console.log('  Proposal:    5 (opp-sales-pr1 through pr5)');
  console.log('  Negotiation: 5 (opp-sales-n1 through n5)');
  console.log('  ClosedWon:   3 (opp-sales-cw1 through cw3)');
  console.log('  ClosedLost:  2 (opp-sales-cl1 through cl2)');
  console.log('');
  console.log('Quotes seeded:');
  console.log('  5 high-discount quotes (>=20%) in Pending approval state');
  console.log('  2 standard quotes (Approved/NotRequired)');
  console.log('');
  console.log('Compliance events:');
  console.log('  3 outbound attempts dispatched (OptOut, Unknown, DNC contacts)');
  console.log('  1 ComplianceOverrideRequested written directly to audit log');
  console.log('');
  console.log('Example curl commands:');
  console.log('  # Get org profile');
  console.log(`  curl "https://vertical-crm-production.up.railway.app/api/admin/org" \\`);
  console.log(`    -H "X-Org-Id: ${ORG_ID}" -H "X-User-Id: user-admin" -H "X-User-Roles: Admin"`);
  console.log('');
  console.log('  # Activate policy');
  console.log(`  curl -X POST https://vertical-crm-production.up.railway.app/api/admin/policy/activate \\`);
  console.log(`    -H "X-Org-Id: ${ORG_ID}" -H "X-User-Id: user-admin" -H "X-User-Roles: Admin" \\`);
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d @docs/saas-policy.json');
  console.log('');
  console.log('  # Query audit log');
  console.log(`  curl "https://vertical-crm-production.up.railway.app/api/audit?entityType=opportunity" \\`);
  console.log(`    -H "X-Org-Id: ${ORG_ID}" -H "X-User-Id: user-sm" -H "X-User-Roles: SalesManager"`);
  console.log('');
  console.log('  # Export CSV');
  console.log(`  curl "https://vertical-crm-production.up.railway.app/api/audit/export.csv" \\`);
  console.log(`    -H "X-Org-Id: ${ORG_ID}" -H "X-User-Id: user-sm" -H "X-User-Roles: SalesManager" \\`);
  console.log('    -o audit-export.csv');
  console.log('');
  console.log('  # List users (Admin only)');
  console.log(`  curl "https://vertical-crm-production.up.railway.app/api/admin/users" \\`);
  console.log(`    -H "X-Org-Id: ${ORG_ID}" -H "X-User-Id: user-admin" -H "X-User-Roles: Admin"`);
  console.log('');
  console.log('  # Get quotes pending approval');
  console.log(`  curl "https://vertical-crm-production.up.railway.app/api/quotes/by-opportunity/opp-sales-n1" \\`);
  console.log(`    -H "X-Org-Id: ${ORG_ID}" -H "X-User-Id: user-sm" -H "X-User-Roles: SalesManager"`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
