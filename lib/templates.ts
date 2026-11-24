import type { BoqItem, Clause, MatrixRow, ScopeBlock, ScopeBlockKind, WorkScopeItem } from "./types";

/*
 * Default wording used in every quotation. Text was taken from the existing Word
 * quotations with typos corrected. {{tokens}} are filled from form values
 * (see lib/template.ts for the list of available tokens).
 */

export const SALUTATIONS = ["Dear Sir,", "Dear Madam,", "Dear Sir/Madam,"];

export const SUBJECT_SUGGESTIONS = [
  "Supply and installation of Prefab Buildings structures",
  "Supply and installation of Prefab structures for stairs and railing",
  "Design, Fabrication, and Installation of Prefabricated Buildings",
];

export const UOM_OPTIONS = ["MT", "SQM", "SQF", "RM", "RMT", "Nos", "Set", "Lumpsum"];

export const COVER_LETTER_PARAGRAPHS = [
  "I am writing to express my gratitude for the opportunity to submit a proposal for your project. As the representative of Poojary Prefab Pvt. Ltd., I assure you of our commitment to providing high-quality services and products to our clients.",
  "We have carefully reviewed your inquiry and have prepared a proposal based on PPPL's standard design criteria and material specifications. While the overall dimensions and layout are in accordance with your inquiry, we have ensured that our proposal meets your project's specific requirements.",
  "Poojary Prefab Pvt. Ltd. is a small-scale manufacturing unit registered under the MSME Act 2006 and is also a government purchase enlisted vendor. We take pride in delivering exceptional services while adhering to the highest quality standards.",
  "We have attached our terms and conditions for your review, and we are more than happy to discuss any questions or concerns you may have regarding our proposal or our services.",
  "Thank you for considering our proposal, and we look forward to the opportunity to work with you and your team.",
];

export const COVER_LETTER_BODY = COVER_LETTER_PARAGRAPHS.join("\n\n");

export const COVER_LETTER_CLOSING = "Sincerely,";

export const PRICING_INTRO =
  "We have attached the quotation we prepared in response to your inquiry. We believe that this quote is the best possible offer that we can provide for the services.";

export const BOQ_HEADING =
  "Scope of the work: Design, manufacture, supply, installation and commissioning of Pre-fabricated Metal building as per the drawing";
export const BOQ_SUPPLY_LABEL = "Supply";
export const BOQ_INSTALL_LABEL = "Installation at the site + transportation";

export const PRICING_NOTE_BOQ = "GST @{{gstRate}}% as shown above. HSN code: {{hsnCode}}.";
export const PRICING_NOTE_AREA = "";
export const AREA_EXCEL_NOTE = "Detailed cost break-up: refer attached Excel sheet.";

export interface LibraryItem {
  key: string;
  label: string;
  item: Omit<BoqItem, "id">;
  workScopeKey?: string;
}

export const BOQ_LIBRARY: LibraryItem[] = [
  {
    key: "steel",
    label: "Prefabricated Structural Steel",
    workScopeKey: "steel",
    item: {
      title: "Prefabricated Structural Steel:",
      description:
        "Procurement of steel sections, fabrication, painting and transporting to the site, erection at site, installation & commissioning of all structural steel works for Prefabricated Structures of mentioned size using Indian standard Angles, Channels, Medium Beams, steel plates, pipes, hollow rectangular tubes, Chequered plates, Platform, gratings, including painting (Primer 1 coat of zinc Phosphate epoxy primer each 75 micron app. and finish coat of polyurethane/Epoxy 50 DFT micron of approved color and make) to all surface complete as per detailed and fabrication drawings and specification. The quantity includes the cost of gusset plates, stiffener plates, connecting bolts, fasteners, washers, electrodes, anchor bolts for column base, connecting plates including preparation of fabrication drawings etc.",
      sizeLine: "Shed Size: __ x __ x __ meters. Steel quantity is approximate and may vary; actual quantity will be given after shop drawing.",
      uom: "MT",
      qty: null,
      supplyRate: null,
      installRate: null,
    },
  },
  {
    key: "roof",
    label: "Roof cover",
    workScopeKey: "roof",
    item: {
      title: "Roof cover:",
      description:
        "Providing and fixing of 0.50 mm TCT, 250 MPa, SMP colour coated Galvanized trapezoidal profile sheets (JSW / AMNS equivalent make) complete with HSD screws.",
      sizeLine: "Plinth area: __ SQM",
      uom: "SQM",
      qty: null,
      supplyRate: null,
      installRate: null,
    },
  },
  {
    key: "gutter",
    label: "Gutter",
    workScopeKey: "roof",
    item: {
      title: "Gutter:",
      description:
        "Supply and fixing of roof gutters 300x300x300 mm with 150 mm dia PVC round down pipe till the ground level.",
      sizeLine: "",
      uom: "RM",
      qty: null,
      supplyRate: null,
      installRate: null,
    },
  },
  {
    key: "custom",
    label: "Blank custom item",
    item: { title: "", description: "", sizeLine: "", uom: "Nos", qty: null, supplyRate: null, installRate: null },
  },
];

export interface WorkScopeLibraryItem {
  key: string;
  label: string;
  item: Omit<WorkScopeItem, "id">;
}

export const WORK_SCOPE_LIBRARY: WorkScopeLibraryItem[] = [
  {
    key: "steel",
    label: "Steel Structure",
    item: {
      heading: "Steel Structure:",
      bullets: [
        "Procurement of steel from reputable manufacturers: SAIL/JSW/AMNS/TATA/APOLLO or equivalent.",
        "Fabrication/manufacturing of all structural steel components as per detailed fabrication drawings.",
        "Transportation of fabricated steel components to the construction site.",
        "Installation of structural steel elements, including columns, trusses, tie beams, purlins, bracings, staircases, and handrails.",
      ].join("\n"),
    },
  },
  {
    key: "roof",
    label: "Roof and Gutters",
    item: {
      heading: "Roof and Gutters:",
      bullets:
        "Supply & installation of 0.50 mm thick PPGI trapezoidal sheets laid over the purlins using HSD screws. Bubble sheet insulation included.",
    },
  },
  {
    key: "wall",
    label: "Wall Panels",
    item: {
      heading: "Wall Panels:",
      bullets:
        "Supply & installation of 50 mm thick interlocking, insulated, two hour fire rated aerated concrete wall panels.",
    },
  },
  { key: "custom", label: "Blank custom heading", item: { heading: "", bullets: "" } },
];

export const WORK_SCOPE_TITLE = "Work Scope for Steel Structure and Prefabricated Building Construction";

const STEEL_SPEC = `Prefabricated steel is a type of building construction that utilizes pre-engineered steel components to create a building structure. It involves fabricating steel components in a factory-controlled environment, which are then shipped to the construction site for assembly. Here is a detailed specification description for prefabricated steel for building construction:
1. Steel: The prefabricated steel components will be made of high-quality, structural steel, conforming to the ASTM A36 standard or equivalent, which is low-carbon steel with good strength and flexibility.
2. Design: The design of the prefabricated steel components will be based on the engineering requirements for the building, including wind loads, seismic loads, and other relevant factors. The design will conform to the latest building codes and regulations.
3. Manufacturing: The prefabricated steel components will be manufactured in a factory-controlled environment using state-of-the-art equipment and processes. The manufacturing process will conform to the latest quality control standards to ensure the highest level of quality.
4. Coating: The steel components will be coated with a high-quality, durable coating to protect against corrosion and provide a long service life. The coating will be a minimum of {{coatingMicrons}} microns thick and conform to the ASTM A653 standard or equivalent, consisting of one coat of rust-proof solution, one coat of epoxy primer, and two coats of Epoxy paint.
5. Connection Details: As specified in the engineering drawings, the prefabricated steel components will be connected using high-strength bolts or welds. The connection details will be designed to provide the necessary strength and stability for the building.
6. Accessories: The prefabricated steel components will come with all necessary accessories, such as anchor bolts, clips, fasteners, and other components required for assembly.
7. Assembly: The prefabricated steel components will be shipped to the construction site for assembly. The assembly process will be simple, fast, and efficient and will require minimal on-site labor and equipment.
8. Testing: The prefabricated steel components will undergo rigorous testing and inspection during and after manufacturing to ensure that they meet the highest quality standards.
9. Warranty: The prefabricated steel components will come with a manufacturer's warranty, which will cover any defects in materials or workmanship for a period of {{warrantyPeriod}}.

In summary, prefabricated steel for building construction is a high-quality, durable, and efficient way to build a structure. The use of prefabricated steel components can save time and money on construction while providing a safe and reliable building solution. The specifications for prefabricated steel components should conform to the highest quality standards and be designed and manufactured to meet the specific requirements of the building. The steel quantity includes the main structure, railings, and stairs, per the drawing. The steel quantity in the quotation is taken as per the thumb rule. Actual quantity may vary at the time of structural design.`;

const DESIGN_SCOPE = `The scope of structural design charges includes the following tasks:
1. Review of architectural plans and project specifications: The structural engineer will review the architectural drawings and project specifications to understand the requirements of the building design, including the location of walls, roof design, and structural framing system.
2. Structural Analysis: The structural engineer will perform structural analysis to determine the type and size of materials needed for building construction. This analysis will consider the design loads, including dead loads (e.g., the weight of the building itself), live loads (e.g., people, furniture), and environmental loads (e.g., wind, snow, earthquake) that the building may experience.
3. Design and Calculation: Based on the structural analysis, the structural engineer will design and calculate the structural components of the building, including columns, beams, slabs, and foundation, to ensure that they can withstand the anticipated loads and stresses. The calculations will also take into account the materials that will be used. The structural design will be calculated as per the applicable IS code and using specialized software. The output from the software will be provided to the client for record-keeping along with the design package.
4. Connection Details: The structural engineer will provide detailed connection details for the structural components of the building, including bolts, welds, and other fasteners. These details will ensure that the structural components are connected in a way that provides adequate strength and stability.
5. Site Visits: The structural engineer will visit the construction site to ensure that the structural design is being implemented correctly and to address any issues that arise during the construction process. The scope of the structural design charges typically includes {{siteVisitsWords}} site visits, with additional visits charged separately.
6. Stability Certificate: The structural engineer will issue a stability certificate upon completion of the building to certify that the structural design is in compliance with applicable building codes and regulations. This certificate can be used as proof of compliance for future reference.`;

const VOLATILITY = `Please note that steel rates are subject to high volatility. The present rates have been considered for the quotation. However, any increase or decrease in rates by {{volatilityPct}}% or more, either above or below the current rates, will be adjusted accordingly and either paid as extra or reversed.`;

const WALL_PANEL = `Wall Panels: 50 mm thick interlocking, insulated, two hour fire rated aerated concrete wall panels made by 2 nos 5 mm thick cement bonded particle boards and infill using aerated concrete and EPS beads.

Note: The specifications provided are based on the given requirements.`;

export const SCOPE_BLOCK_DEFAULTS: Record<Exclude<ScopeBlockKind, "custom">, { label: string; title: string; text: string }> = {
  boqNote: {
    label: "BOQ note",
    title: "",
    text: "This BOQ includes specific details for each item, including the type of work, materials used, specifications, and tentative quantities. Order should be in lumpsum.",
  },
  workScope: { label: "Work scope (headings & bullets)", title: WORK_SCOPE_TITLE, text: "" },
  ratesNote: {
    label: "Rates inclusive note",
    title: "",
    text: "Note: The rates are inclusive of all materials, labor, transportation, and other incidental costs unless otherwise specified.",
  },
  billingNote: {
    label: "Billing & measurement note",
    title: "",
    text: "Note: Billing & measurement will be lumpsum unit. The BOQ is to understand the cost.",
  },
  designScope: { label: "Structural design scope", title: "", text: DESIGN_SCOPE },
  steelSpec: { label: "Prefabricated steel specification", title: "", text: STEEL_SPEC },
  volatility: { label: "Steel price volatility clause", title: "", text: VOLATILITY },
  wallPanel: { label: "Wall panel specification", title: "", text: WALL_PANEL },
};

export const SCOPE_BLOCK_ORDER: Exclude<ScopeBlockKind, "custom">[] = [
  "boqNote",
  "workScope",
  "ratesNote",
  "billingNote",
  "designScope",
  "steelSpec",
  "volatility",
  "wallPanel",
];

export function defaultScopeBlock(kind: Exclude<ScopeBlockKind, "custom">, enabled: boolean, id: string): ScopeBlock {
  const d = SCOPE_BLOCK_DEFAULTS[kind];
  return { id, kind, label: d.label, title: d.title, text: d.text, enabled };
}

export const CLAUSE_DEFAULTS: Omit<Clause, "id" | "enabled">[] = [
  {
    key: "scope",
    title: "Scope of Work and Cost:",
    text: "The rate quoted above represents the cost of the work as described in this quotation and in accordance with the Bill of Quantities (BOQ). It includes labour charges and supervision charges for on-site erection. This cost is derived based on the terms and conditions listed herein. Any changes to the terms and conditions requested by the client will result in a revised quotation. The scope of the work is limited to the above items. This is a lumpsum quote. BOQ is to understand the scope and cost.",
  },
  {
    key: "rateFactors",
    title: "",
    text: `The factors typically considered in the calculation of rates in the Bill of Quantity (BOQ) for construction and project-based industries:
- Procurement costs of materials, fabrication, transportation, loading and unloading charges are essential expenses that go into acquiring the necessary materials.
- The site installation team, including the project manager, supervisors, and laborers, is necessary to complete the project.
- Food, traveling, and other allowances are standard expenses that companies typically cover for their employees who are working on-site.
- Government labor compliances are regulations that companies must follow to ensure the safety and protection of their employees, including complying with the Employee Provident Fund (EPF), Employee State Insurance (ESI), professional tax, and labor welfare fund.
- Transit and contractor's all-risk insurances are necessary to protect the project and the company from any potential damages or losses during transit and installation.
- Contingency and miscellaneous costs can include unexpected expenses that may arise during the project, such as unforeseen delays or natural disasters.
- The contractor's profit is the amount of money the contractor makes on the project.
- The measurement for this project is on a lump sum basis, which includes all the necessary components required to complete the project as per the approved drawings. In the event that any changes are made to the approved drawings at the site, the contractor shall not be responsible for any waste components, as the components have been manufactured as per the approved drawings. The client shall reimburse any additional materials required due to changes made at the site at the bill of quantity (BOQ) rate plus the actual transportation cost incurred.`,
  },
  {
    key: "taxes",
    title: "Taxes:",
    text: "The quoted rate excludes the Goods and Services Tax (GST), which will be charged at the prevailing rate of {{gstRate}}%.",
  },
  {
    key: "clientObligations",
    title: "Client Obligations:",
    text: "The client is responsible for providing free electricity (one-point single-phase connection on the foundation), construction water if required, and a secured space to store materials at the site. The client must also obtain all required clearances/permissions for the work at the site from the Government or Local Bodies as per prevailing rules.",
  },
  {
    key: "safety",
    title: "Safety Requirements:",
    text: "Poojary Prefab adheres to the general safety requirements for on-site installation of prefabricated structures, including safety shoes, safety helmets, reflective aprons, safety belts for laborers and supervisors, and a first aid kit (PPE). Safety officers if required will be provided on a chargeable basis{{safetyChargePhrase}}. The cost is not accounted in this quote.",
  },
  {
    key: "insurance",
    title: "Insurance:",
    text: "Poojary Prefab provides coverage under the Employees' State Insurance Corporation (ESIC), Employees' Provident Fund (EPF), labour welfare fund (MLWF), or Workmen Compensation Act Insurance. {{insuranceSentence}}",
  },
  {
    key: "delayedWork",
    title: "Delayed Work:",
    text: "If work is postponed due to site conditions after the deployment of laborers, the client must reimburse the actual cost of salary and travel to and from the site from our office. No delay charges are applicable if the project is delayed due to the client-related delay.",
  },
  {
    key: "warranty",
    title: "Warranty:",
    text: "Poojary Prefab provides a {{warrantyPeriod}} warranty against quality for prefabricated structures. This warranty does not cover damage due to misuse, accidents, or natural calamities. The warranty certificate will be issued on the company's letterhead only. The client must check the quality of major items used in prefabricated structures, such as steel and cement products, before dispatching them from our workshop/godown.",
  },
  {
    key: "payment",
    title: "Payment Terms:",
    text: `Payment is the essence of the contract. The payment terms are as follows:
- A {{advancePct}}% advance payment, plus GST (Goods and Services Tax), as the materials are customized items ordered by the client. This is due to the fact that the materials are specifically designed, procured, and manufactured according to the client's specific requirements, making it difficult for the Seller to resell or repurpose the materials if the client decides to cancel the order.
- In addition, the contractor should plan for longer lead times in order to ensure that materials can be ordered and delivered in time for the project. This is because the materials' delivery depends on the manufacturer's delivery schedule, which may be subject to delays or other factors outside of the Seller's control.
- Overall, the Seller is taking measures to protect themselves from financial losses and other risks associated with custom orders while emphasizing the importance of clear communication and planning between the Seller and the client to ensure a successful project outcome.
- {{inspectionPct}}% of the total cost plus GST against the materials inspection and quality check at our factory on a pro-rata basis of the quantity and rate of the dispatchable materials.
- {{balancePct}}% balance labour charges against the running bill of the work completion certificate certified by the project manager or client's representative or PMC on a weekly basis. All payments must be released within {{paymentReleaseDays}} working days after the submission of the Invoices.`,
  },
  { key: "tds", title: "", text: "TDS as applicable as per the Income Tax Act." },
  { key: "retention", title: "", text: "No Retention, No Security Deposit or EMD." },
  {
    key: "timelines",
    title: "Supply and Completion of Work:",
    text: `Timely completion is the essence of the contract. Poojary Prefab will make every effort to complete the work as per the schedule, subject to the force majeure clause, site, and local conditions.
- The structural package will be submitted for approval within {{designDays}} working days.{{designQuotePhrase}} The supply of prefabricated materials will {{supplyVerb}} within {{supplyDays}} working days from the date of the order{{advancePhrase}} for the first lot and subsequent lots as per the site requirement. This is after approval of the structural design by the client.
- The work completion will be within {{completionDays}} working days after receipt of materials at the site, subject to site readiness and clearance from the client{{rainPhrase}}. This timeline is for the above-quoted quantity.`,
  },
  {
    key: "forceMajeure",
    title: "Force Majeure:",
    text: "Poojary Prefab will not be held accountable for delays in material dispatch or delivery (after dispatch) resulting from circumstances outside its control, such as strikes, acts of war, revolution, riot or civil disturbance, trade sanctions or restrictions, occurrences of meteorological or geophysical nature, etc., to the extent that these affect transport, its suppliers, and its subcontractors.{{covidSentence}} It is possible that the project timeline may extend beyond the initial schedule due to various factors, such as changes in drawings or specifications, delays in site readiness, natural calamities, government orders, payment issues, and other such reasons. In light of these possibilities, it is recommended that the contractor not be subject to any penalties.",
  },
  {
    key: "changes",
    title: "Changes and Revision:",
    text: "Any change and/or revision to the above-stated scope of supply may lead to a variation in the price and the delivery period. The terms and conditions related to any changes and revisions shall be agreed upon in writing and signed by both parties. A change must not hold payment for work completed in the original contract.",
  },
  {
    key: "cancellation",
    title: "Cancellation of Orders:",
    text: "The Seller will not accept any order cancellation or penalty. In the event of an order cancellation, the advance amount shall be liable to forfeiture, and the Buyer shall compensate the Seller for all losses, expenses, and costs incurred in connection therewith. The terms and conditions related to the cancellation of orders shall be agreed upon in writing and signed by both parties. In the event that the project is stalled for any reason, the client shall reimburse the contractor for the actual installation, demobilization costs, and dismantling costs, if applicable, as per the mutually agreed-upon rates.",
  },
  {
    key: "jurisdiction",
    title: "Jurisdiction/Arbitration:",
    text: "Any disputes whatsoever touching or arising out of the contract shall be referred to the Industrial Facilitation Council under the Ministry of Micro, Small and Medium Enterprises (MSME) as per the MSME Act 2006, or third-party reconciliation, or Sole Arbitration of the person accepted by Poojary Prefab Pvt. Ltd. The said Arbitration will be under the Arbitration and Conciliation Act, 1996, or the Statutory modification thereof, and the place of Arbitration will be at {{arbitrationPlace}}. The language used for Arbitration shall be English, and the award passed by the arbitrator shall be final and binding on both parties. Poojary Prefab Private Limited is a micro-manufacturing unit under MSME Act.",
  },
  {
    key: "clarity",
    title: "",
    text: `In order to ensure that the quotation terms are unambiguous, it is important to include all relevant information in the contract/order, including any terms and conditions that may be relevant to the transaction. This may include clauses related to payment terms, warranties, indemnification, dispute resolution, and other important details.

By taking the time to establish clear quotation terms, both parties can avoid misunderstandings and disputes down the line, which can help to ensure a successful and mutually beneficial transaction.`,
  },
  {
    key: "validity",
    title: "",
    text: "Please note that the quotation is valid for a period of {{validityDays}} days from the date of this quotation (i.e. up to {{validUntil}}).",
  },
];

export const TERMS_CLOSING =
  "If you have any further questions or concerns, please do not hesitate to contact us. We appreciate your consideration and look forward to the opportunity to work with you.";

export const MATRIX_DEFAULTS: Omit<MatrixRow, "id">[] = [
  { description: "Design of prefabricated structure", client: false, pppl: true },
  { description: "Design review and approval", client: true, pppl: false },
  { description: "Building permissions/commencement certificates", client: true, pppl: false },
  { description: "Foundation as per the design at the site", client: true, pppl: false },
  { description: "Procurement of raw materials for the prefab structure as per the order", client: false, pppl: true },
  { description: "Fabrication of structure components", client: false, pppl: true },
  { description: "Painting and finishing as per order scope", client: false, pppl: true },
  { description: "Quality inspection at the factory", client: true, pppl: true },
  { description: "Transportation of components to the site", client: false, pppl: true },
  { description: "Arrange site security, illumination, electrical, and water at the site", client: true, pppl: false },
  { description: "Safety induction, permits, if any", client: true, pppl: false },
  { description: "Assembly of prefabricated structure on site", client: false, pppl: true },
  { description: "Installation of electrical and plumbing systems", client: false, pppl: true },
  { description: "Snag list rectification, if any", client: false, pppl: true },
  { description: "Handover, completion certificate", client: true, pppl: true },
];

export const SHED_INTRO = "Drawings referred as per the drawing sent by you with inquiry.";
export const SHED_TITLE = "Shed details";
export const PHOTOS_TITLE = "Photo of similar Buildings:";
