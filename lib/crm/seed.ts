import { SEED_ENQUIRY_DAYS_AGO, SEED_QUOTE_LINKS, seedEnquiryNumbers, seedQuoteId } from "./seed-links";
import type { Client, Contact, Enquiry, EnquiryEvent, EnquiryStatus, LeadSource } from "./types";

/*
 * Demo clients and enquiries for the temporary browser storage. They reference the demo quotations
 * through the fixed ids in seed-links.ts. Replace with real data from the API later.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function contact(id: string, name: string, role: Contact["role"], phone: string, email: string, primary = false): Contact {
  return { id, name, role, phone, email, primary };
}

interface ClientSeed {
  id: string;
  name: string;
  contacts: Contact[];
  leadSource: LeadSource;
  referredBy?: string;
  city: string;
  state: string;
  address?: string;
  gstin?: string;
  notes?: string;
  active?: boolean;
  createdDaysAgo: number;
}

const CLIENTS: ClientSeed[] = [
  {
    id: "c_thermax",
    name: "Thermax Ltd.",
    contacts: [
      contact("ct_thermax_1", "Mr. Mukesh Shukla", "purchase", "9822012345", "mukesh.shukla@thermaxglobal.com", true),
      contact("ct_thermax_2", "Ms. Anita Rao", "consultant", "9822098765", "anita.rao@thermaxglobal.com"),
    ],
    leadSource: "existing",
    city: "Pune",
    state: "Maharashtra",
    address: "D-13, MIDC Industrial Area, Chinchwad",
    gstin: "27AAACT1234A1Z5",
    notes: "Contract & Const, Management team handles all site infra orders.",
    createdDaysAgo: 400,
  },
  {
    id: "c_dra",
    name: "Dineshchandra R Agarwal Infracon Pvt. Ltd.",
    contacts: [contact("ct_dra_1", "Mr. Abdul Hannan", "owner", "9436012345", "abdul.hannan@draipl.com", true)],
    leadSource: "referral",
    referredBy: "Mr. Sanjay Mehta (Afcons)",
    city: "Agartala",
    state: "Tripura",
    createdDaysAgo: 370,
  },
  {
    id: "c_kalyani",
    name: "Kalyani Steels Ltd.",
    contacts: [contact("ct_kalyani_1", "Mr. Prakash Joshi", "purchase", "9890011223", "prakash.joshi@kalyanisteels.com", true)],
    leadSource: "google",
    city: "Pune",
    state: "Maharashtra",
    createdDaysAgo: 160,
  },
  {
    id: "c_mahindra",
    name: "Mahindra Logistics Ltd.",
    contacts: [
      contact("ct_mahindra_1", "Ms. Neha Kulkarni", "purchase", "9820033445", "neha.kulkarni@mahindralogistics.com", true),
      contact("ct_mahindra_2", "Mr. Vikas Nair", "owner", "9820011002", ""),
    ],
    leadSource: "website",
    city: "Mumbai",
    state: "Maharashtra",
    createdDaysAgo: 120,
  },
  {
    id: "c_lnt",
    name: "L&T Construction",
    contacts: [contact("ct_lnt_1", "Mr. S. Raghavan", "purchase", "9840055667", "s.raghavan@lntecc.com", true)],
    leadSource: "trade_show",
    city: "Chennai",
    state: "Tamil Nadu",
    createdDaysAgo: 80,
  },
  {
    id: "c_bharat",
    name: "Bharat Forge Ltd.",
    contacts: [contact("ct_bharat_1", "Mr. Amit Deshpande", "owner", "9850077889", "amit.deshpande@bharatforge.com", true)],
    leadSource: "cold_call",
    city: "Pune",
    state: "Maharashtra",
    createdDaysAgo: 30,
  },
  {
    id: "c_afcons",
    name: "Afcons Infrastructure Ltd.",
    contacts: [contact("ct_afcons_1", "Mr. Rohan Mehta", "consultant", "9819099001", "rohan.mehta@afcons.com", true)],
    leadSource: "consultant",
    city: "Mumbai",
    state: "Maharashtra",
    createdDaysAgo: 20,
  },
  {
    id: "c_tata",
    name: "Tata Projects Ltd.",
    contacts: [contact("ct_tata_1", "Mr. K. Srinivas", "purchase", "9849012121", "k.srinivas@tataprojects.com", true)],
    leadSource: "website",
    city: "Hyderabad",
    state: "Telangana",
    createdDaysAgo: 10,
  },
  {
    id: "c_green",
    name: "Green Valley Agro Farms",
    contacts: [contact("ct_green_1", "Mr. Suresh Patil", "owner", "9922334455", "", true)],
    leadSource: "social",
    city: "Nashik",
    state: "Maharashtra",
    createdDaysAgo: 12,
  },
  {
    id: "c_sunrise",
    name: "Sunrise Cold Chain Pvt. Ltd.",
    contacts: [contact("ct_sunrise_1", "Ms. Hetal Shah", "owner", "9925566778", "hetal@sunrisecold.in", true)],
    leadSource: "trade_show",
    city: "Ahmedabad",
    state: "Gujarat",
    notes: "Went with a competitor; keep for future cold storage enquiries.",
    active: false,
    createdDaysAgo: 140,
  },
];

export function seedClients(now: number): Client[] {
  return CLIENTS.map((c) => {
    const t = new Date(now - c.createdDaysAgo * DAY).toISOString();
    return {
      id: c.id,
      name: c.name,
      contacts: c.contacts,
      leadSource: c.leadSource,
      leadSourceOther: "",
      referredBy: c.referredBy ?? "",
      address: c.address ?? "",
      city: c.city,
      state: c.state,
      gstin: c.gstin ?? "",
      notes: c.notes ?? "",
      active: c.active ?? true,
      createdAt: t,
      createdBy: "u_admin",
      updatedAt: t,
    };
  });
}

/** A step in the demo history: hours ago, then the event (status change, link, note …). */
type Step = [hoursAgo: number, event: Omit<EnquiryEvent, "id" | "at" | "userId"> & { userId?: string }];

interface EnquirySeed {
  id: string;
  clientId: string;
  contactId: string;
  projectName: string;
  siteLocation: string;
  buildingType: Enquiry["buildingType"];
  buildingTypeOther?: string;
  scope: Enquiry["scope"];
  size?: Partial<Enquiry["size"]>;
  description: string;
  assignedTo?: string;
  expectedInDays?: number;
  steps: Step[];
  followUpToday?: boolean;
  finalised?: Enquiry["finalised"];
  declined?: Enquiry["declined"];
  statusBeforeDecline?: EnquiryStatus;
}

const linkStep = (hoursAgo: number, offer: string, rev: string): Step => {
  const id = seedQuoteId(offer, rev);
  return [hoursAgo, { type: "quotation_linked", quotationId: id, revision: SEED_QUOTE_LINKS[id].revision }];
};
const statusStep = (hoursAgo: number, from: EnquiryStatus, to: EnquiryStatus, comment?: string, auto = false): Step => [
  hoursAgo,
  { type: "status", from, to, comment, automatic: auto || undefined, userId: auto ? "system" : undefined },
];

const ENQUIRIES: EnquirySeed[] = [
  {
    id: "e_agartala",
    clientId: "c_dra",
    contactId: "ct_dra_1",
    projectName: "TR Agartala Bypass Project – site infra",
    siteLocation: "Agartala, Tripura",
    buildingType: "other",
    buildingTypeOther: "Site offices, quarters & stores",
    scope: "supply_erection",
    description: "17 structures for the bypass project camp: office, quarters, kitchens, lab, stores, godowns, hutments.",
    steps: [
      linkStep(24 * 358, "71", "0"),
      statusStep(24 * 358, "enquiry", "quotation_created", undefined, true),
      statusStep(24 * 355, "quotation_created", "quotation_sent", "Sent by email with Excel cost break-up."),
      statusStep(24 * 340, "quotation_sent", "finalised", "LOI received for priced structures."),
    ],
    finalised: { quotationId: seedQuoteId("71", "0"), poNumber: "DRA/LOI/2023/118", poDate: "" },
  },
  {
    id: "e_poly",
    clientId: "c_thermax",
    contactId: "ct_thermax_1",
    projectName: "Poly houses at RIL, Nagpur",
    siteLocation: "Nagpur, Maharashtra",
    buildingType: "poly_house",
    scope: "supply_erection",
    size: { areaSqft: 14000 },
    description: "PSA balloon shed, hammer & shredder sheds and feed conveyor shed as per drawings TB007C200/201.",
    assignedTo: "u_priya",
    steps: [
      linkStep(24 * 158, "13", "00"),
      statusStep(24 * 158, "enquiry", "quotation_created", undefined, true),
      statusStep(24 * 157, "quotation_created", "quotation_sent"),
      statusStep(24 * 145, "quotation_sent", "finalised", "PO received after technical discussion."),
    ],
    finalised: { quotationId: seedQuoteId("13", "00"), poNumber: "THX/PO/4471", poDate: "" },
  },
  {
    id: "e_stairs",
    clientId: "c_thermax",
    contactId: "ct_thermax_1",
    projectName: "Stairs & railings – RIL Nagpur",
    siteLocation: "Nagpur, Maharashtra",
    buildingType: "other",
    buildingTypeOther: "Stairs & railings",
    scope: "supply_erection",
    description: "Approx. 125 MT of stairs, platforms and railings for the same site.",
    assignedTo: "u_priya",
    expectedInDays: 10,
    steps: [
      linkStep(24 * 155, "14", "00"),
      statusStep(24 * 155, "enquiry", "quotation_created", undefined, true),
      statusStep(24 * 150, "quotation_created", "quotation_sent"),
      [24 * 4, { type: "note", comment: "Client says approval is with their project head; call again next week." }],
    ],
  },
  {
    id: "e_kalyani",
    clientId: "c_kalyani",
    contactId: "ct_kalyani_1",
    projectName: "Warehouse at Chakan",
    siteLocation: "Chakan, Pune, Maharashtra",
    buildingType: "warehouse",
    scope: "supply_erection",
    size: { length: 40, width: 20, height: 9 },
    description: "Finished-goods warehouse with roofing and gutters.",
    assignedTo: "u_rahul",
    expectedInDays: 5,
    steps: [
      linkStep(24 * 140, "15", "00"),
      statusStep(24 * 140, "enquiry", "quotation_created", undefined, true),
      statusStep(24 * 139, "quotation_created", "quotation_sent"),
      statusStep(24 * 136, "quotation_sent", "revision_requested", "Asked for lower steel rate and 58 MT instead of 60 MT."),
      linkStep(24 * 133, "15", "01"),
      statusStep(24 * 133, "revision_requested", "revision_created", undefined, true),
      statusStep(24 * 130, "revision_created", "revision_sent"),
      [2 * 24, { type: "note", comment: "Purchase committee meeting on Friday." }],
    ],
  },
  {
    id: "e_mahindra",
    clientId: "c_mahindra",
    contactId: "ct_mahindra_1",
    projectName: "Mezzanine floor – Bhiwandi DC",
    siteLocation: "Bhiwandi, Thane, Maharashtra",
    buildingType: "other",
    buildingTypeOther: "Mezzanine floor",
    scope: "supply_erection",
    size: { length: 30, width: 15 },
    description: "Steel mezzanine inside existing warehouse.",
    assignedTo: "u_rahul",
    steps: [
      linkStep(24 * 90, "16", "00"),
      statusStep(24 * 20, "enquiry", "on_hold", "Client paused the project until the next quarter's budget."),
    ],
    followUpToday: true,
  },
  {
    id: "e_lnt",
    clientId: "c_lnt",
    contactId: "ct_lnt_1",
    projectName: "Metro Depot Site Camp",
    siteLocation: "Sriperumbudur, Tamil Nadu",
    buildingType: "other",
    buildingTypeOther: "Site camp buildings",
    scope: "supply_erection",
    description: "Site office, staff quarters, labour hutments and store.",
    assignedTo: "u_sneha",
    steps: [
      linkStep(24 * 60, "17", "00"),
      statusStep(24 * 60, "enquiry", "quotation_created", undefined, true),
      statusStep(24 * 58, "quotation_created", "quotation_sent"),
      statusStep(24 * 3, "quotation_sent", "revision_requested", "Reduce staff quarters from 10 to 8 and recheck rate per sq ft."),
    ],
  },
  {
    id: "e_bharat",
    clientId: "c_bharat",
    contactId: "ct_bharat_1",
    projectName: "Canteen building – Mundhwa",
    siteLocation: "Mundhwa, Pune, Maharashtra",
    buildingType: "factory",
    scope: "supply_erection",
    size: { length: 25, width: 12, height: 6 },
    description: "Employee canteen next to forge shop 3. Drawing awaited from client.",
    assignedTo: "u_sneha",
    steps: [[24 * 12, { type: "note", comment: "Waiting for the architectural drawing." }]],
  },
  {
    id: "e_sunrise",
    clientId: "c_sunrise",
    contactId: "ct_sunrise_1",
    projectName: "Cold storage – Changodar",
    siteLocation: "Changodar, Ahmedabad, Gujarat",
    buildingType: "cold_storage",
    scope: "supply",
    size: { areaSqft: 12000 },
    description: "PUF panel cold storage with ante-room.",
    steps: [
      statusStep(24 * 100, "enquiry", "declined", "They finalised with a competitor offering PUF panels in-house."),
    ],
    declined: { reason: "competitor", competitor: "Everest Industries", other: "", note: "" },
    statusBeforeDecline: "enquiry",
  },
  {
    id: "e_afcons",
    clientId: "c_afcons",
    contactId: "ct_afcons_1",
    projectName: "Samruddhi Expressway Package 12 camp",
    siteLocation: "Nashik, Maharashtra",
    buildingType: "other",
    buildingTypeOther: "Project office & quarters",
    scope: "supply_erection",
    description: "Project office, engineer quarters and mess.",
    assignedTo: "u_priya",
    expectedInDays: 20,
    steps: [linkStep(5, "19", "00")],
  },
  {
    id: "e_green",
    clientId: "c_green",
    contactId: "ct_green_1",
    projectName: "Poly house – Nashik farm",
    siteLocation: "Dindori, Nashik, Maharashtra",
    buildingType: "poly_house",
    scope: "supply",
    size: { areaSqft: 20000 },
    description: "Naturally ventilated poly house for capsicum. Needs subsidy-compliant specs.",
    steps: [[24 * 9, { type: "note", comment: "Shared NHB subsidy spec sheet on WhatsApp." }]],
  },
  {
    id: "e_thermax3",
    clientId: "c_thermax",
    contactId: "ct_thermax_2",
    projectName: "Boiler house shed – Shirwal",
    siteLocation: "Shirwal, Satara, Maharashtra",
    buildingType: "shed",
    scope: "supply_erection",
    size: { length: 30, width: 18, height: 12 },
    description: "Boiler house shed with crane girder provision. Enquiry came through Ms. Anita Rao (consultant).",
    assignedTo: "u_priya",
    expectedInDays: 30,
    steps: [],
  },
];

const dateOnly = (t: number) => new Date(t).toISOString().slice(0, 10);

export function seedEnquiries(now: number): Enquiry[] {
  const numbers = seedEnquiryNumbers(now);
  return ENQUIRIES.map((s, i) => {
    const created = now - SEED_ENQUIRY_DAYS_AGO[s.id] * DAY;
    let status: EnquiryStatus = "enquiry";
    const history: EnquiryEvent[] = [
      { id: `ev_${s.id}_0`, at: new Date(created).toISOString(), userId: "u_admin", type: "created", to: "enquiry" },
    ];
    let last = created;
    s.steps.forEach(([hoursAgo, ev], j) => {
      const at = now - hoursAgo * HOUR;
      last = Math.max(last, at);
      if (ev.type === "status" && ev.to) status = ev.to;
      history.push({ ...ev, id: `ev_${s.id}_${j + 1}`, at: new Date(at).toISOString(), userId: ev.userId ?? s.assignedTo ?? "u_admin" });
    });
    const linkedRevisions = s.steps.filter(([, ev]) => ev.type === "quotation_linked").length;
    const finalisedAt = s.steps.find(([, ev]) => ev.to === "finalised")?.[0];
    return {
      id: s.id,
      number: numbers[s.id] ?? `ENQ-SEED-${i}`,
      clientId: s.clientId,
      contactId: s.contactId,
      enquiryDate: dateOnly(created),
      projectName: s.projectName,
      siteLocation: s.siteLocation,
      buildingType: s.buildingType,
      buildingTypeOther: s.buildingTypeOther ?? "",
      scope: s.scope,
      scopeOther: "",
      size: { length: null, width: null, height: null, areaSqft: null, ...s.size },
      description: s.description,
      leadSource: "",
      leadSourceOther: "",
      assignedTo: s.assignedTo ?? "",
      expectedDecisionDate: s.expectedInDays ? dateOnly(now + s.expectedInDays * DAY) : "",
      attachments: [],
      notes: "",
      status,
      statusBeforeDecline: s.statusBeforeDecline ?? null,
      followUpDate: s.followUpToday ? dateOnly(now) : "",
      finalised: s.finalised && finalisedAt !== undefined ? { ...s.finalised, poDate: dateOnly(now - finalisedAt * HOUR) } : null,
      declined: s.declined ?? null,
      nextRevision: linkedRevisions,
      history,
      createdAt: new Date(created).toISOString(),
      createdBy: "u_admin",
      updatedAt: new Date(last).toISOString(),
    };
  });
}
