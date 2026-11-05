// Seed plan, transcribed from the roadmap (Parts 5, 8 and 12).
// This is read-only reference data that lives in code, not in your saved data,
// so fixing a typo here never breaks an export. Your own records (sessions,
// cards, artifacts, people, reviews) live in store.js.
//
// Corrections from the plan review are applied here:
// - Exercise 14 sits in Week 7's Apply block (not Practice).
// - Exercise 10 is Optional in Week 6; exercises 2, 13, 19 and 20 are unscheduled.
// - Week 1 is 11 h: Day 1 is 1 h (it was a Thanksgiving Monday before the start moved to Nov 2) and Day 4 is a Learn day.
// - Conditional items ("if you attend", "if confirmed") are marked `conditional`,
//   which is different from `optional`.
// - The bridge says "finish and publish Project 2" by its last day (Feb 7).

/** @typedef {'learn'|'practice'|'build'|'publish'|'capstone'} BlockType */

/**
 * Plan text version. Bump it when plan text changes. Saved ticks are keyed by item id,
 * and existing ids never change (new items get new ids), so a ticked item stays ticked.
 * If an id ever has to change, list it in PLAN_ID_RENAMES and saved ticks move with it.
 *   2: revised roadmap (zero trust and cloud security foundations; extras as Optional items)
 *   3: one Design item per week (kind 'design', after Evidence); extra time on top of the 12 h
 *   4: wording only: Saturday focus lines say "write up and share" instead of "publish" (no id changed)
 *   5: the curriculum redesigned for a product designer (same 60-day timeline, same days and hours).
 *      Week 1 is rewritten from Day 1 but keeps its item ids; other items have new ids.
 *      Ticks on items that no longer exist are kept in your data, just not shown.
 */
export const PLAN_VERSION = 5;
/** { oldId: newId } for any item whose id changed in a later version. Empty so far. */
export const PLAN_ID_RENAMES = {};
/** Every item id that existed in each earlier plan version. A check proves none were removed. */
export const PLAN_ID_HISTORY = {
  1: [
    'w1-learn-1', 'w1-read-1', 'w1-read-2', 'w1-practice-1', 'w1-build-1',
    'w1-apply-1', 'w1-network-1', 'w1-network-2', 'w1-network-3', 'w1-evidence-1',
    'w2-learn-1', 'w2-read-1', 'w2-read-2', 'w2-read-3', 'w2-practice-1',
    'w2-practice-2', 'w2-practice-3', 'w2-build-1', 'w2-apply-1', 'w2-network-1',
    'w2-evidence-1', 'w3-learn-1', 'w3-read-1', 'w3-read-2', 'w3-read-3',
    'w3-practice-1', 'w3-practice-2', 'w3-build-1', 'w3-apply-1', 'w3-network-1',
    'w3-network-2', 'w3-evidence-1', 'w4-learn-1', 'w4-read-1', 'w4-read-2',
    'w4-practice-1', 'w4-practice-2', 'w4-build-1', 'w4-apply-1', 'w4-network-1',
    'w4-evidence-1', 'w5-learn-1', 'w5-read-1', 'w5-read-2', 'w5-practice-1',
    'w5-build-1', 'w5-apply-1', 'w5-network-1', 'w5-evidence-1', 'w6-learn-1',
    'w6-read-1', 'w6-read-2', 'w6-practice-1', 'w6-practice-2', 'w6-practice-3',
    'w6-build-1', 'w6-apply-1', 'w6-network-1', 'w6-evidence-1', 'w7-learn-1',
    'w7-read-1', 'w7-practice-1', 'w7-practice-2', 'w7-build-1', 'w7-apply-1',
    'w7-network-1', 'w7-evidence-1', 'w8-learn-1', 'w8-read-1', 'w8-read-2',
    'w8-practice-1', 'w8-practice-2', 'w8-build-1', 'w8-apply-1', 'w8-network-1',
    'w8-evidence-1',
  ],
  2: [
    'w1-learn-1', 'w1-read-1', 'w1-read-2', 'w1-read-3', 'w1-practice-1',
    'w1-build-1', 'w1-apply-1', 'w1-network-1', 'w1-network-2', 'w1-network-3',
    'w1-evidence-1', 'w2-learn-1', 'w2-read-1', 'w2-read-2', 'w2-read-3',
    'w2-practice-1', 'w2-practice-2', 'w2-practice-3', 'w2-build-1', 'w2-apply-1',
    'w2-network-1', 'w2-evidence-1', 'w3-learn-1', 'w3-read-1', 'w3-read-2',
    'w3-read-3', 'w3-practice-1', 'w3-practice-2', 'w3-build-1', 'w3-apply-1',
    'w3-network-1', 'w3-network-2', 'w3-evidence-1', 'w3-evidence-2', 'w4-learn-1',
    'w4-read-1', 'w4-read-2', 'w4-read-3', 'w4-practice-1', 'w4-practice-2',
    'w4-build-1', 'w4-apply-1', 'w4-network-1', 'w4-evidence-1', 'w5-learn-1',
    'w5-read-1', 'w5-read-2', 'w5-read-3', 'w5-practice-1', 'w5-practice-2',
    'w5-build-1', 'w5-apply-1', 'w5-network-1', 'w5-evidence-1', 'w5-evidence-2',
    'w6-learn-1', 'w6-learn-2', 'w6-read-1', 'w6-read-2', 'w6-read-3',
    'w6-practice-1', 'w6-practice-2', 'w6-practice-3', 'w6-practice-4', 'w6-build-1',
    'w6-apply-1', 'w6-apply-2', 'w6-network-1', 'w6-evidence-1', 'w6-evidence-2',
    'w7-learn-1', 'w7-read-1', 'w7-practice-1', 'w7-practice-2', 'w7-build-1',
    'w7-learn-2', 'w7-apply-2', 'w7-apply-1', 'w7-network-1', 'w7-evidence-1',
    'w8-learn-1', 'w8-read-1', 'w8-read-2', 'w8-read-3', 'w8-read-4',
    'w8-learn-2', 'w8-practice-1', 'w8-practice-2', 'w8-build-1', 'w8-apply-1',
    'w8-network-1', 'w8-evidence-1',
  ],
};

/** Whether a plan item is Optional, given your own choices (`data.optionalOverrides`). Your choice wins over the plan's. */
export function itemIsOptional(item, overrides) {
  const o = overrides?.[`item:${item.id}`];
  return typeof o?.optional === 'boolean' ? o.optional : Boolean(item.optional);
}

/** Text for the extra time on a Design item, for example "about 3 h, on top of the 12 h". */
export function extraTimeLabel(item) {
  if (!item.extraMinutes) return '';
  const h = item.extraMinutes / 60;
  return `about ${Number.isInteger(h) ? h : h.toFixed(1)} h, on top of the 12 h`;
}

/**
 * Moves saved ticks to renamed item ids. Nothing is ever removed, and a tick already on the
 * new id is kept. With no renames (today) it returns the same ticks.
 */
export function renameChecks(weekChecks, renames = PLAN_ID_RENAMES) {
  const out = { ...weekChecks };
  for (const [oldId, newId] of Object.entries(renames)) {
    if (out[oldId] && !out[newId]) {
      out[newId] = out[oldId];
      delete out[oldId];
    }
  }
  return out;
}

export const PLAN_START = '2026-11-02'; // Day 1, Monday
export const PLAN_END = '2026-12-31'; // Day 60, Thursday
export const BRIDGE_START = '2027-01-01';
export const BRIDGE_REST_START = '2027-01-14';
export const BRIDGE_REST_END = '2027-01-22';
export const BRIDGE_END = '2027-02-07';
export const APPLICATIONS_START = '2027-01-26'; // a Tuesday
export const APPLICATIONS_END = '2027-04-21';
export const PROJECT1_GATE = '2026-12-12'; // Day 41, Saturday
export const FEB_REVIEW_WEEK = '2027-03-08'; // Monday of the review week

export const BLOCK_LABELS = {
  learn: 'Learn',
  practice: 'Hands-on lab',
  build: 'Design project',
  publish: 'Write up and share',
  capstone: 'Final project',
  bridge: 'Bridge',
  applications: 'Job search',
};

/** Which week items each block type works on (shown on the Today view). */
export const BLOCK_ITEM_KINDS = {
  learn: ['learn', 'read'],
  practice: ['practice'],
  build: ['build'],
  publish: ['apply', 'evidence', 'design'],
  capstone: [],
};

export const ITEM_KIND_LABELS = {
  learn: 'Learn',
  read: 'Read',
  practice: 'Lab',
  build: 'Design project',
  apply: 'Product study',
  network: 'Networking (evenings, not study time)',
  evidence: 'Portfolio piece',
  design: 'Design exercise (extra time)',
};

/**
 * PlanWeek: one study week.
 * - number, title, start (Monday)
 * - budget: planned hours per block; the total is the week's budget
 * - items: the checklist (WeekItem: id, kind, text, exercises?, optional?, conditional?, flagship?, extraMinutes?)
 *   `extraMinutes` is time on top of the week's budget (Design items); it is never added to the budget
 * - days: PlanDay seeds, in order (Sundays are not listed; they are rest days)
 * - notes: plan notes shown with the week
 *
 * PlanDay: { day, date, block, focus, hours, holiday? }
 *   `date` is the date printed in the roadmap. The date checks verify that it
 *   matches Day 1 + (day − 1), so a transcription slip shows up as a failure.
 */
export const WEEKS = [
  {
    number: 1,
    title: "Identity basics and the people you design for",
    start: '2026-11-02',
    budget: { learn: 5, practice: 2, build: 2, publish: 2 },
    items: [
      { id: 'w1-learn-1', kind: 'learn', text: 'The field in plain words: identity, access and networks; who you are versus what you may do (authentication, authorization, accounting); passwords, factors, sessions and tokens; accounts over time (joiner, mover, leaver); what can go wrong' },
      { id: "w1-read-1", kind: "read", text: "Professor Messer's identity and access management videos (Security+ section 4.6; 45 minutes is enough)" },
      { id: 'w1-read-2', kind: 'read', text: "The Threat Modeling Manifesto and Shostack's beginner's guide to threat modelling" },
      { id: 'w1-read-3', kind: 'read', text: 'NIST Cybersecurity Framework 2.0 overview and one Quick Start Guide', optional: true, extraMinutes: 60 },
      { id: 'w1-practice-1', kind: 'practice', text: 'Exercise 1: be the IT admin: set up a company in Keycloak with users, groups and roles, then sign in as an employee', exercises: [1] },
      { id: 'c5-w1-build-1', kind: 'build', text: 'Exercise 2: a people map for an identity product: who uses it, who buys it, who you will work with', exercises: [2] },
      { id: 'w1-apply-1', kind: 'apply', text: 'Read the admin getting-started guides for Okta and 1Password; list what an admin must do on their first day' },
      { id: 'w1-network-1', kind: 'network', text: 'Join #owasp-vancouver on MARS Slack' },
      { id: 'w1-network-2', kind: 'network', text: 'Follow 15 practitioners (for example Aaron Parecki, Justin Richer, Pamela Dingle, Dick Hardt, Adam Shostack, Clint Gibler)' },
      { id: 'c5-w1-evidence-1', kind: 'evidence', text: 'An admin console teardown (Keycloak and one product of your choice): what admins see first, what confuses, what you would change' },
      { id: 'w1-design-1', kind: 'design', text: 'A one-page picture of identity at a company: people, accounts, groups, apps and rules', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 1, date: '2026-11-02', block: 'learn', focus: "Welcome: identity and access in plain words", hours: 1 },
      { day: 2, date: '2026-11-03', block: 'learn', focus: "Who you are and what you may do: sign-in basics", hours: 2 },
      { day: 3, date: '2026-11-04', block: 'practice', focus: "Exercise 1: be the IT admin in Keycloak", hours: 2 },
      { day: 4, date: '2026-11-05', block: 'learn', focus: "Accounts over time, and what can go wrong", hours: 2 },
      { day: 5, date: '2026-11-06', block: 'build', focus: "Exercise 2: the people you design for and work with", hours: 2 },
      { day: 6, date: '2026-11-07', block: 'publish', focus: "Admin console teardown; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 2,
    title: "How networks work, explained for designers",
    start: '2026-11-09',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'c5-w2-learn-1', kind: 'learn', text: 'IP addresses, ports and DNS; HTTPS and TLS; firewalls and NAT; what a VPN does and why classic VPNs frustrate people' },
      { id: 'c5-w2-read-1', kind: 'read', text: 'MDN: how the internet works, then what an IP address, a port, DNS and TLS are (short pages, in that order)' },
      { id: 'c5-w2-read-2', kind: 'read', text: 'Tailscale: “How Tailscale works” and “How NAT traversal works” (skim the second; the pictures matter most)' },
      { id: 'c5-w2-practice-1', kind: 'practice', text: 'Exercise 3: put Tailscale on two of your devices and connect them; note every moment you hesitated', exercises: [3] },
      { id: 'c5-w2-practice-2', kind: 'practice', text: 'Exercise 4: draw your tailnet as a diagram; try MagicDNS and share one device with a friend', exercises: [4] },
      { id: 'c5-w2-build-1', kind: 'build', text: 'Exercise 5: redesign the first-run onboarding of a networking product: from sign-up to ’two devices talk’', exercises: [5] },
      { id: 'c5-w2-apply-1', kind: 'apply', text: 'Compare the first run of Tailscale, the Cloudflare One Client (WARP) and ZeroTier: steps, words, where people get stuck' },
      { id: 'c5-w2-network-1', kind: 'network', text: 'Ask two developers or IT admins how they explain a VPN to a non-technical colleague' },
      { id: 'c5-w2-evidence-1', kind: 'evidence', text: 'Onboarding teardown and redesign: before and after, with the reasoning' },
      { id: 'c5-w2-design-1', kind: 'design', text: 'A network map that a non-network person can read', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 8, date: '2026-11-09', block: 'learn', focus: "The internet in plain words: IP addresses, ports, DNS", hours: 2 },
      { day: 9, date: '2026-11-10', block: 'learn', focus: "HTTPS and TLS, firewalls and NAT, and what a VPN does", hours: 2 },
      { day: 10, date: '2026-11-11', block: 'practice', focus: "Exercise 3: connect two devices with Tailscale", hours: 2 },
      { day: 11, date: '2026-11-12', block: 'practice', focus: "Exercise 4: map your tailnet; MagicDNS and sharing", hours: 2 },
      { day: 12, date: '2026-11-13', block: 'build', focus: "Exercise 5: redesign a networking product onboarding", hours: 2 },
      { day: 13, date: '2026-11-14', block: 'publish', focus: "Onboarding teardown; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 3,
    title: "Zero trust and identity-based access",
    start: '2026-11-16',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'c5-w3-learn-1', kind: 'learn', text: 'Zero trust in plain words (NIST SP 800-207, BeyondCorp); VPN vs zero-trust network access; policy decision and enforcement points; device posture; access policies: groups, tags, ACLs and grants; RBAC vs ABAC' },
      { id: 'c5-w3-read-1', kind: 'read', text: 'A summary of NIST SP 800-207 and Google’s BeyondCorp overview' },
      { id: 'c5-w3-read-2', kind: 'read', text: 'Tailscale docs: access control (ACLs and grants), tags, ACL tests and device posture' },
      { id: 'c5-w3-practice-1', kind: 'practice', text: 'Exercise 6: write an access policy for a fictional 20-person startup and test it with ACL tests', exercises: [6] },
      { id: 'c5-w3-practice-2', kind: 'practice', text: 'Exercise 7: sign in to your tailnet through an identity provider and try a device posture rule', exercises: [7] },
      { id: 'c5-w3-build-1', kind: 'build', text: 'Case study 1 kickoff: research why access policies go wrong (docs, forums, GitHub issues, two admin conversations)', flagship: true },
      { id: 'c5-w3-apply-1', kind: 'apply', text: 'Teardown: how Tailscale, Cloudflare Zero Trust and Twingate let admins write and review access rules' },
      { id: 'c5-w3-network-1', kind: 'network', text: 'Recruit 3 to 5 IT admins or platform engineers for short conversations in weeks 3 to 8' },
      { id: 'c5-w3-evidence-1', kind: 'evidence', text: 'Case study 1 problem statement: users, the pain, evidence, and what ’better’ would mean' },
      { id: 'c5-w3-design-1', kind: 'design', text: '“Who can reach what”: a one-screen answer for an admin', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 15, date: '2026-11-16', block: 'learn', focus: "Zero trust in plain words: check every request", hours: 2 },
      { day: 16, date: '2026-11-17', block: 'learn', focus: "Access policies: groups, tags, ACLs and grants", hours: 2 },
      { day: 17, date: '2026-11-18', block: 'practice', focus: "Exercise 6: write and test an access policy", hours: 2 },
      { day: 18, date: '2026-11-19', block: 'practice', focus: "Exercise 7: SSO sign-in and device posture", hours: 2 },
      { day: 19, date: '2026-11-20', block: 'build', focus: "Case study 1 kickoff: why access policies go wrong", hours: 2 },
      { day: 20, date: '2026-11-21', block: 'publish', focus: "Case study 1 problem statement; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 4,
    title: "Sign-in, SSO and accounts at work",
    start: '2026-11-23',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'c5-w4-learn-1', kind: 'learn', text: 'OAuth 2.0 and OpenID Connect (the valet key); SAML single sign-on; SCIM provisioning and offboarding; MFA, passkeys and phishing resistance; account recovery; WCAG 2.2 accessible authentication' },
      { id: 'c5-w4-read-1', kind: 'read', text: 'oauth.com (the guide chapters) and an OpenID Connect overview' },
      { id: 'c5-w4-read-2', kind: 'read', text: 'passkeys.dev and the recovery sections of NIST SP 800-63B-4' },
      { id: 'c5-w4-practice-1', kind: 'practice', text: 'Exercise 8: sign in to a sample app through Keycloak with OIDC and watch the redirects in dev tools', exercises: [8] },
      { id: 'c5-w4-practice-2', kind: 'practice', text: 'Exercise 9: turn on TOTP and passkeys in Keycloak; note every step a person must take', exercises: [9] },
      { id: 'c5-w4-build-1', kind: 'build', text: 'Exercise 10: redesign the SSO and SCIM setup flow an admin follows to connect their company’s identity provider', exercises: [10] },
      { id: 'c5-w4-apply-1', kind: 'apply', text: 'Score three real account-recovery flows on safety and on accessibility' },
      { id: 'c5-w4-network-1', kind: 'network', text: 'Two short conversations: “How do you explain SSO to a new colleague?”' },
      { id: 'c5-w4-evidence-1', kind: 'evidence', text: 'SSO setup flow redesign, with a consent-screen audit' },
      { id: 'c5-w4-design-1', kind: 'design', text: 'Account recovery that is both safe and kind', extraMinutes: 180, optional: true },
    ],
    days: [
      { day: 22, date: '2026-11-23', block: 'learn', focus: "OAuth 2.0 and OpenID Connect in plain words", hours: 2 },
      { day: 23, date: '2026-11-24', block: 'learn', focus: "SAML single sign-on and SCIM provisioning", hours: 2 },
      { day: 24, date: '2026-11-25', block: 'practice', focus: "Exercise 8: an OIDC sign-in, step by step", hours: 2 },
      { day: 25, date: '2026-11-26', block: 'practice', focus: "Exercise 9: MFA, passkeys and recovery", hours: 2 },
      { day: 26, date: '2026-11-27', block: 'build', focus: "Exercise 10: redesign the SSO and SCIM setup flow", hours: 2 },
      { day: 27, date: '2026-11-28', block: 'publish', focus: "SSO setup redesign; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 5,
    title: "Containers and Kubernetes security for designers",
    start: '2026-11-30',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'c5-w5-learn-1', kind: 'learn', text: 'Containers, images and Kubernetes objects (pods, nodes, namespaces, labels, services); east-west traffic; Kubernetes network policy and why everything is allowed by default; Calico; service mesh and mutual TLS' },
      { id: 'c5-w5-read-1', kind: 'read', text: 'Kubernetes docs: the overview, pods, services and network policies' },
      { id: 'c5-w5-read-2', kind: 'read', text: 'Calico docs: getting started and network policy; one Tigera blog post on policy recommendations' },
      { id: 'c5-w5-practice-1', kind: 'practice', text: 'Exercise 11: run a local cluster (kind or minikube) with Calico and deploy a small demo app', exercises: [11] },
      { id: 'c5-w5-practice-2', kind: 'practice', text: 'Exercise 12: write a network policy, break the app on purpose, then fix it; note how you found the cause', exercises: [12] },
      { id: 'c5-w5-build-1', kind: 'build', text: 'Case study 2 kickoff: research why platform engineers find network policies hard', flagship: true },
      { id: 'c5-w5-apply-1', kind: 'apply', text: 'Teardown: how Tigera (Calico), Cilium and a cloud console show Kubernetes traffic and policy' },
      { id: 'c5-w5-network-1', kind: 'network', text: 'Talk to one platform or DevOps engineer about the last time a policy broke something' },
      { id: 'c5-w5-evidence-1', kind: 'evidence', text: 'Case study 2 problem statement and the journey of a platform engineer securing a cluster' },
      { id: 'c5-w5-design-1', kind: 'design', text: 'A traffic picture of a cluster a newcomer can read', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 29, date: '2026-11-30', block: 'learn', focus: "Containers and Kubernetes in plain words", hours: 2 },
      { day: 30, date: '2026-12-01', block: 'learn', focus: "Kubernetes networking and network policy", hours: 2 },
      { day: 31, date: '2026-12-02', block: 'practice', focus: "Exercise 11: a local cluster with Calico", hours: 2 },
      { day: 32, date: '2026-12-03', block: 'practice', focus: "Exercise 12: break and fix a network policy", hours: 2 },
      { day: 33, date: '2026-12-04', block: 'build', focus: "Case study 2 kickoff: why network policies are hard", hours: 2 },
      { day: 34, date: '2026-12-05', block: 'publish', focus: "Case study 2 problem statement; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 6,
    title: "Seeing and responding: logs, alerts and incidents",
    start: '2026-12-07',
    budget: { learn: 4, practice: 4, build: 2, publish: 2 },
    items: [
      { id: 'c5-w6-learn-1', kind: 'learn', text: 'Logs, flow logs and metrics; what a security operations team does; alert fatigue; detection and MITRE ATT&CK in plain words; the incident-response lifecycle (NIST SP 800-61); OWASP Top 10 for context' },
      { id: 'c5-w6-read-1', kind: 'read', text: 'NIST SP 800-61 (the lifecycle summary) and the MITRE ATT&CK overview' },
      { id: 'c5-w6-read-2', kind: 'read', text: 'Calico or Tailscale flow-log docs, and one article on alert fatigue' },
      { id: 'c5-w6-practice-1', kind: 'practice', text: 'Exercise 13: read flow logs from your cluster or tailnet and find one connection that should not be there', exercises: [13] },
      { id: 'c5-w6-practice-2', kind: 'practice', text: 'Exercise 14: a tabletop for ’a stolen laptop’: what the admin sees, decides and does, minute by minute', exercises: [14] },
      { id: 'c5-w6-build-1', kind: 'build', text: 'Exercise 15: design an alert triage view that cuts noise and says what to do next', exercises: [15] },
      { id: 'c5-w6-apply-1', kind: 'apply', text: 'Teardown of one security product’s alert or audit-log screens: what helps a tired analyst, what does not' },
      { id: 'c5-w6-network-1', kind: 'network', text: 'Ask a security engineer which alerts they ignore, and why' },
      { id: 'c5-w6-evidence-1', kind: 'evidence', text: 'Alert triage view and the tabletop write-up' },
      { id: 'c5-w6-design-1', kind: 'design', text: 'An incident timeline an executive can follow', extraMinutes: 120, optional: true },
    ],
    days: [
      { day: 36, date: '2026-12-07', block: 'learn', focus: "Logs, flow logs, alerts and the people who read them", hours: 2 },
      { day: 37, date: '2026-12-08', block: 'learn', focus: "Detection and incident response in plain words", hours: 2 },
      { day: 38, date: '2026-12-09', block: 'practice', focus: "Exercise 13: find the odd connection in flow logs", hours: 2 },
      { day: 39, date: '2026-12-10', block: 'practice', focus: "Exercise 14: tabletop: a stolen laptop", hours: 2 },
      { day: 40, date: '2026-12-11', block: 'build', focus: "Exercise 15: an alert triage view", hours: 2 },
      { day: 41, date: '2026-12-12', block: 'publish', focus: "Triage view and tabletop; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 7,
    title: "Enterprise trust: least privilege, governance and policy as code",
    start: '2026-12-14',
    budget: { learn: 4, practice: 2, build: 4, publish: 2 },
    items: [
      { id: 'c5-w7-learn-1', kind: 'learn', text: 'Least privilege; admin roles and delegation; just-in-time access and access reviews; audit logs; SOC 2 and ISO 27001 as controls and evidence; policy as code and GitOps; how security products are bought' },
      { id: 'c5-w7-read-1', kind: 'read', text: 'Tailscale docs on GitOps for the policy file, and one article on just-in-time access' },
      { id: 'c5-w7-read-2', kind: 'read', text: 'An introduction to SOC 2 for product teams' },
      { id: 'c5-w7-practice-1', kind: 'practice', text: 'Exercise 16: keep your tailnet policy in git with a pull request and a test before it goes live', exercises: [16] },
      { id: 'c5-w7-build-1', kind: 'build', text: 'Case study 1: concepts, flows and a prototype: a policy editor that shows who can reach what before you save', flagship: true },
      { id: 'c5-w7-build-2', kind: 'build', text: 'Case study 1: test the prototype with two people and change it' },
      { id: 'c5-w7-apply-1', kind: 'apply', text: 'Teardown: how one product handles admin roles and access reviews' },
      { id: 'c5-w7-network-1', kind: 'network', text: 'Share your case study 1 draft with one practitioner for feedback' },
      { id: 'c5-w7-evidence-1', kind: 'evidence', text: 'Case study 1 draft: problem, research, design, test, what changed' },
    ],
    days: [
      { day: 43, date: '2026-12-14', block: 'learn', focus: "Least privilege, roles, reviews and audit", hours: 2 },
      { day: 44, date: '2026-12-15', block: 'learn', focus: "Compliance and policy as code, in plain words", hours: 2 },
      { day: 45, date: '2026-12-16', block: 'practice', focus: "Exercise 16: an access policy managed in git", hours: 2 },
      { day: 46, date: '2026-12-17', block: 'build', focus: "Case study 1: concepts, flows and prototype", hours: 2 },
      { day: 47, date: '2026-12-18', block: 'build', focus: "Case study 1: test and improve", hours: 2 },
      { day: 48, date: '2026-12-19', block: 'publish', focus: "Case study 1 draft; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 8,
    title: "Machine identities, AI agents and designing for safety",
    start: '2026-12-21',
    budget: { learn: 4, practice: 2, build: 4, publish: 2 },
    items: [
      { id: 'c5-w8-learn-1', kind: 'learn', text: 'Non-human identities: service accounts, API keys, secrets and workload identity (SPIFFE); AI agents and MCP authorization; delegated access and human approval; prompt injection in plain words; security UX: warnings, safe defaults and confirming dangerous actions' },
      { id: 'c5-w8-read-1', kind: 'read', text: 'SPIFFE overview, the OWASP Top 10 for LLM applications, and the MCP authorization spec (overview only)' },
      { id: 'c5-w8-practice-1', kind: 'practice', text: 'Exercise 17: a security UX review of one product against warnings, defaults and destructive-action patterns', exercises: [17] },
      { id: 'c5-w8-build-1', kind: 'build', text: 'Case study 2: concepts, flows and a prototype: from observed traffic to a recommended policy, staged before it is enforced', flagship: true },
      { id: 'c5-w8-build-2', kind: 'build', text: 'Case study 2: test the prototype with two people and change it' },
      { id: 'c5-w8-apply-1', kind: 'apply', text: 'Read two real job posts (one Tailscale-like, one Tigera-like) and list the skills your case studies show' },
      { id: 'c5-w8-network-1', kind: 'network', text: 'Share your case study 2 draft with one practitioner for feedback' },
      { id: 'c5-w8-evidence-1', kind: 'evidence', text: 'Case study 2 draft: problem, research, design, test, what changed' },
    ],
    days: [
      { day: 50, date: '2026-12-21', block: 'learn', focus: "Machine identities, secrets and workload identity", hours: 2 },
      { day: 51, date: '2026-12-22', block: 'learn', focus: "AI agents, delegated access and approvals", hours: 2 },
      { day: 52, date: '2026-12-23', block: 'practice', focus: "Exercise 17: a security UX review", hours: 2 },
      { day: 53, date: '2026-12-24', block: 'build', focus: "Case study 2: concepts, flows and prototype", hours: 2 },
      { day: 54, date: '2026-12-25', block: 'build', focus: "Case study 2: test and improve", hours: 2 },
      { day: 55, date: '2026-12-26', block: 'publish', focus: "Case study 2 draft; write up and share", hours: 2 },
    ],
    notes: [],
  },
  {
    number: 9,
    title: "Capstone: two case studies and your story",
    start: '2026-12-28',
    budget: { capstone: 8 },
    items: [
    ],
    days: [
      { day: 57, date: '2026-12-28', block: 'capstone', focus: "Polish case study 1: story, outcome, honest labels", hours: 2 },
      { day: 58, date: '2026-12-29', block: 'capstone', focus: "Polish case study 2: story, outcome, honest labels", hours: 2 },
      { day: 59, date: '2026-12-30', block: 'capstone', focus: "Portfolio page, LinkedIn and resume for identity and security roles", hours: 2 },
      { day: 60, date: '2026-12-31', block: 'capstone', focus: "Interview practice: a live design exercise and a retrospective", hours: 2 },
    ],
    notes: [],
  },
];

/**
 * Exercise: the 17 designer exercises of the 60-day curriculum (version 5), each in its week.
 */
export const EXERCISES = [
  { n: 1, title: "Be the IT admin: set up a company in Keycloak", tool: "Keycloak in Docker", learn: "What an admin configures (users, groups, roles, apps) and the words they use", hours: 2, artifact: "Screenshots with notes on every confusing moment", schedule: 'week', week: 1 },
  { n: 2, title: "A people map for an identity product", tool: "Paper or FigJam; product websites and job posts", learn: "Who uses, who buys, who decides, who you will work with", hours: 2, artifact: "One-page people map", schedule: 'week', week: 1 },
  { n: 3, title: "Connect two devices with Tailscale", tool: "Tailscale (free plan) on a laptop and a phone", learn: "What a tailnet is; where first-time users hesitate", hours: 2, artifact: "Annotated screenshots of the first run", schedule: 'week', week: 2 },
  { n: 4, title: "Map your tailnet", tool: "Tailscale admin console, MagicDNS, sharing", learn: "Devices, users, names and sharing as an admin sees them", hours: 2, artifact: "A diagram of your tailnet", schedule: 'week', week: 2 },
  { n: 5, title: "Redesign a networking product onboarding", tool: "Figma; your Exercise 3 notes", learn: "Designing for \"it works\" moments and recoverable errors", hours: 2, artifact: "Before and after flow with reasoning", schedule: 'week', week: 2 },
  { n: 6, title: "Write and test an access policy", tool: "Tailscale policy file with ACL tests", learn: "Groups, tags, grants; testing access before it goes live", hours: 2, artifact: "The policy, its tests and what surprised you", schedule: 'week', week: 3 },
  { n: 7, title: "SSO sign-in and device posture", tool: "Tailscale with an identity provider; posture docs", learn: "How identity and device signals decide access", hours: 2, artifact: "Notes on what an admin must understand", schedule: 'week', week: 3 },
  { n: 8, title: "An OIDC sign-in, step by step", tool: "A sample app with Keycloak; browser dev tools", learn: "Redirects, codes and tokens, and what each screen means", hours: 2, artifact: "Annotated sequence of the sign-in", schedule: 'week', week: 4 },
  { n: 9, title: "MFA, passkeys and recovery", tool: "Keycloak authentication settings", learn: "Enrolment, fallback and recovery from the user’s side", hours: 2, artifact: "Enrolment and recovery flow screenshots", schedule: 'week', week: 4 },
  { n: 10, title: "Redesign the SSO and SCIM setup flow", tool: "Figma; vendor setup guides", learn: "Turning a long technical setup into a guided, checkable flow", hours: 2, artifact: "Redesigned setup flow", schedule: 'week', week: 4 },
  { n: 11, title: "A local Kubernetes cluster with Calico", tool: "kind or minikube, Calico, a demo app", learn: "Pods, services and namespaces you can see and touch", hours: 2, artifact: "Setup notes and a cluster diagram", schedule: 'week', week: 5 },
  { n: 12, title: "Break and fix a network policy", tool: "kubectl and Calico network policy", learn: "Why default-allow is risky and default-deny is scary", hours: 2, artifact: "What broke, how you found it, how a tool could help", schedule: 'week', week: 5 },
  { n: 13, title: "Find the odd connection in flow logs", tool: "Calico or Tailscale flow logs", learn: "Reading traffic data; what a real analyst looks for", hours: 2, artifact: "Notes on the signals that mattered", schedule: 'week', week: 6 },
  { n: 14, title: "Tabletop: a stolen laptop", tool: "Paper; your tailnet and identity provider", learn: "The people, decisions and screens in a real incident", hours: 2, artifact: "Minute-by-minute tabletop write-up", schedule: 'week', week: 6 },
  { n: 15, title: "An alert triage view", tool: "Figma", learn: "Reducing noise; saying what to do next", hours: 2, artifact: "Triage view with rationale", schedule: 'week', week: 6 },
  { n: 16, title: "An access policy managed in git", tool: "GitHub, Tailscale GitOps action or Terraform", learn: "Review, test and roll back access changes", hours: 2, artifact: "Pull request with a test", schedule: 'week', week: 7 },
  { n: 17, title: "A security UX review", tool: "One product of your choice", learn: "Warnings, safe defaults and confirming dangerous actions", hours: 2, artifact: "Review with three improvements", schedule: 'week', week: 8 },
];

/** Bridge period (Jan 1 – Feb 7). Sundays are rest days here too. */
export const BRIDGE_PHASES = [
  {
    start: '2027-01-01',
    end: '2027-01-13',
    rest: false,
    title: 'Publish both case studies',
    focus: 'Put case studies 1 and 2 on your portfolio site, with honest labels for what was built, simulated or only designed. About 16 hours across these two weeks.',
  },
  {
    start: '2027-01-14',
    end: '2027-01-22',
    rest: true,
    title: 'Rest',
    focus: 'Optional reading only.',
  },
  {
    start: '2027-01-23',
    end: '2027-02-07',
    rest: false,
    title: 'Feedback and targeting',
    focus: 'Get feedback on both case studies from two practitioners and improve them by Feb 7; build the target list of companies. The full application system starts Tue Jan 26.',
  },
];

/** Part 12 weekly system, from Jan 26 (keyed by weekday, 1 = Monday). */
export const APPLICATION_WEEK = {
  1: { focus: 'Radar (1 h): scan alerts, score postings, pick 4–6. Learning (1 h).', output: 'Shortlist in the tracker' },
  2: { focus: 'Tailor and submit 2–3 applications', output: 'Resume and note per role' },
  3: { focus: 'Outreach (1 h): 3 messages to practitioners, hiring managers or recruiters. Project work (1 h).', output: '3 messages sent' },
  4: { focus: 'Tailor and submit 2–3 applications; send referral asks', output: '1–2 referral asks' },
  5: { focus: 'Interview preparation, plus a 20-minute weekly review of the scorecard', output: 'Updated tracker and prep notes' },
  6: { focus: 'Case-study improvement or learning (one improvement a week)', output: 'One improvement published' },
};

/** Part 12 interview-preparation timeline (shown alongside the weekly system). */
export const INTERVIEW_PREP = [
  { start: '2027-01-26', end: '2027-02-01', text: 'Write 8 STAR stories; practise walking through case studies 1 and 2 in five minutes each.' },
  { start: '2027-02-02', end: '2027-02-15', text: 'Practise concept explanations aloud, recorded; run two mock interviews with practitioners from your network.' },
  { start: '2027-02-16', end: '2027-04-21', text: 'One mock per week; update stories from real interview feedback.' },
];

/**
 * ScorecardTargets (used by the Stage 5 dashboard). Ranges keep both ends;
 * pacing uses the low end, as agreed in the plan review.
 */
export const SCORECARD_TARGETS = [
  { by: '2026-12-31', hours: 100, artifacts: 9, conversations: 15, applications: [3, 6], referralAsks: [2, 3] },
  { by: '2027-02-21', artifacts: 12, conversations: 25, applications: [20, 30], referralAsks: [10, 10] },
];
