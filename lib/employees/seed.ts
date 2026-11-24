import { DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS } from "./config";
import { formatEmployeeCode } from "./rules";
import type { Employee, EmploymentType, Login, Lookups, SalaryEntry } from "./types";

/*
 * Demo employees and logins for the temporary browser store. The ids of the first five match the
 * user ids already used by the CRM demo data (assigned to / created by).
 * Demo passwords: Admin@123 / Staff@123 (stored only as hashes).
 */

const ADMIN_HASH = "pbkdf2$100000$N2alFJuPdyarJlRePDRtCQ==$a+lB0xl4KbETVJqnWExtp+l0IIzKIlBICZKv69LtjbM=";
const STAFF_HASH = "pbkdf2$100000$WGCq3jMZuwSsk5788Se/xA==$AcCE3FpNUTX5Hb8lVjJDbrtxLk9tauKUpe6+bbQygm0=";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

interface Seed {
  id: string;
  fullName: string;
  mobile: string;
  dob?: string;
  gender?: Employee["gender"];
  bloodGroup?: Employee["bloodGroup"];
  address?: string;
  designation: string;
  department: string;
  employmentType: EmploymentType;
  dateOfJoining: string;
  /** [payType, amount, effectiveFrom] oldest first */
  salary: [SalaryEntry["payType"], number, string][];
  emergency?: [string, string, string];
  leaving?: Employee["leaving"];
  login?: { username: string; role: Login["role"]; hash: string; enabled?: boolean; mustChange?: boolean; lastLoginDaysAgo?: number };
}

const SEEDS: Seed[] = [
  {
    id: "u_admin",
    fullName: "Naresh S Poojary",
    mobile: "9545550702",
    dob: "1975-03-14",
    gender: "male",
    bloodGroup: "B+",
    address: "Wagholi, Pune",
    designation: "Director",
    department: "Admin",
    employmentType: "permanent",
    dateOfJoining: "2010-06-01",
    salary: [["monthly", 150000, "2010-06-01"]],
    emergency: ["Sunita Poojary", "Spouse", "9545550703"],
    login: { username: "admin@poojary.net", role: "admin", hash: ADMIN_HASH, lastLoginDaysAgo: 0 },
  },
  {
    id: "u_staff",
    fullName: "Vaishali Joshi",
    mobile: "9764770700",
    gender: "female",
    designation: "Accounts",
    department: "Admin",
    employmentType: "permanent",
    dateOfJoining: "2018-08-01",
    salary: [["monthly", 30000, "2018-08-01"]],
    login: { username: "staff@poojary.net", role: "staff", hash: STAFF_HASH, lastLoginDaysAgo: 1 },
  },
  {
    id: "u_priya",
    fullName: "Priya Deshmukh",
    mobile: "9850011221",
    dob: "1994-07-22",
    gender: "female",
    bloodGroup: "O+",
    address: "Kharadi, Pune",
    designation: "Sales",
    department: "Sales",
    employmentType: "permanent",
    dateOfJoining: "2021-02-15",
    salary: [
      ["monthly", 35000, "2021-02-15"],
      ["monthly", 42000, "2025-04-01"],
    ],
    emergency: ["Rajesh Deshmukh", "Father", "9850011222"],
    login: { username: "priya@poojary.net", role: "staff", hash: STAFF_HASH, lastLoginDaysAgo: 0 },
  },
  {
    id: "u_rahul",
    fullName: "Rahul Jadhav",
    mobile: "9850022331",
    gender: "male",
    designation: "Sales",
    department: "Sales",
    employmentType: "probation",
    dateOfJoining: "2026-07-01",
    salary: [["monthly", 28000, "2026-07-01"]],
    login: { username: "rahul@poojary.net", role: "staff", hash: STAFF_HASH, lastLoginDaysAgo: 2 },
  },
  {
    id: "u_sneha",
    fullName: "Sneha Kale",
    mobile: "9850033441",
    gender: "female",
    designation: "Estimation",
    department: "Design",
    employmentType: "permanent",
    dateOfJoining: "2023-01-09",
    salary: [["monthly", 38000, "2023-01-09"]],
    login: { username: "sneha@poojary.net", role: "staff", hash: STAFF_HASH, mustChange: true },
  },
  {
    id: "e_ganesh",
    fullName: "Ganesh Pawar",
    mobile: "9890044551",
    bloodGroup: "A+",
    designation: "Welder",
    department: "Production",
    employmentType: "daily_wage",
    dateOfJoining: "2022-11-01",
    salary: [
      ["daily", 800, "2022-11-01"],
      ["daily", 900, "2025-11-01"],
    ],
    emergency: ["Laxmi Pawar", "Wife", "9890044552"],
  },
  {
    id: "e_sunil",
    fullName: "Sunil More",
    mobile: "9890055661",
    designation: "Erection supervisor",
    department: "Erection",
    employmentType: "contract",
    dateOfJoining: "2024-03-01",
    salary: [["monthly", 32000, "2024-03-01"]],
  },
  {
    id: "e_kavita",
    fullName: "Kavita Shinde",
    mobile: "9890066771",
    gender: "female",
    designation: "Accounts",
    department: "Accounts",
    employmentType: "permanent",
    dateOfJoining: "2020-05-18",
    salary: [["monthly", 36000, "2020-05-18"]],
    login: { username: "kavita@poojary.net", role: "staff", hash: STAFF_HASH, enabled: false, lastLoginDaysAgo: 60 },
  },
  {
    id: "e_amit",
    fullName: "Amit Kulkarni",
    mobile: "9890077881",
    designation: "Design",
    department: "Design",
    employmentType: "permanent",
    dateOfJoining: "2019-09-02",
    salary: [["monthly", 45000, "2019-09-02"]],
    leaving: { date: "2026-06-30", reason: "resigned", other: "" },
  },
  {
    id: "e_meera",
    fullName: "Meera Kulkarni",
    mobile: "9890088991",
    gender: "female",
    designation: "Accounts",
    department: "Accounts",
    employmentType: "permanent",
    dateOfJoining: "2023-06-12",
    salary: [
      ["monthly", 30000, "2023-06-12"],
      ["monthly", 34000, "2026-04-01"],
    ],
    login: { username: "accounts@poojary.net", role: "accountant", hash: STAFF_HASH, lastLoginDaysAgo: 1 },
  },
];

export function seedPeople(now: number): { employees: Employee[]; logins: Login[]; lookups: Lookups } {
  const employees: Employee[] = SEEDS.map((s, i) => {
    const created = iso(new Date(s.dateOfJoining).getTime());
    const history: Employee["history"] = [{ id: `ev_${s.id}_0`, at: created, userId: "u_admin", type: "created" }];
    s.salary.slice(1).forEach(([, , from], j) =>
      history.push({ id: `ev_${s.id}_s${j}`, at: iso(new Date(from).getTime()), userId: "u_admin", type: "salary", comment: `Effective ${from}` }),
    );
    if (s.leaving)
      history.push({ id: `ev_${s.id}_l`, at: iso(new Date(s.leaving.date).getTime()), userId: "u_admin", type: "deactivated", comment: "Resigned" });
    return {
      id: s.id,
      code: formatEmployeeCode(i + 1),
      fullName: s.fullName,
      mobile: s.mobile,
      dob: s.dob ?? "",
      gender: s.gender ?? "",
      bloodGroup: s.bloodGroup ?? "",
      address: s.address ?? "",
      designation: s.designation,
      department: s.department,
      employmentType: s.employmentType,
      dateOfJoining: s.dateOfJoining,
      status: s.leaving ? "inactive" : "active",
      leaving: s.leaving ?? null,
      salary: s.salary.map(([payType, amount, effectiveFrom], j) => ({
        id: `sal_${s.id}_${j}`,
        payType,
        amount,
        effectiveFrom,
        createdAt: iso(new Date(effectiveFrom).getTime()),
        createdBy: "u_admin",
      })),
      emergencyContact: s.emergency ? { name: s.emergency[0], relation: s.emergency[1], phone: s.emergency[2] } : { name: "", relation: "", phone: "" },
      documents: [],
      history,
      createdAt: created,
      createdBy: "u_admin",
      updatedAt: history[history.length - 1].at,
    };
  });
  const logins: Login[] = SEEDS.filter((s) => s.login).map((s) => {
    const l = s.login!;
    return {
      employeeId: s.id,
      username: l.username,
      role: l.role,
      enabled: l.enabled ?? !s.leaving,
      passwordHash: l.hash,
      mustChangePassword: l.mustChange ?? false,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: l.lastLoginDaysAgo !== undefined ? iso(now - l.lastLoginDaysAgo * DAY - 3 * 3600_000) : null,
      passwordChangedAt: null,
      sessionVersion: 1,
      createdAt: iso(new Date(s.dateOfJoining).getTime()),
    };
  });
  return {
    employees,
    logins,
    lookups: { designations: [...DEFAULT_DESIGNATIONS], departments: [...DEFAULT_DEPARTMENTS], nextEmployeeNumber: SEEDS.length + 1 },
  };
}

/** Accounts listed on the login page while demo data is in use. */
export const DEMO_ACCOUNTS = [
  { username: "admin@poojary.net", password: "Admin@123", label: "Admin (Naresh S Poojary)" },
  { username: "priya@poojary.net", password: "Staff@123", label: "Staff (Priya Deshmukh)" },
  { username: "rahul@poojary.net", password: "Staff@123", label: "Staff (Rahul Jadhav)" },
  { username: "accounts@poojary.net", password: "Staff@123", label: "Accountant (Meera Kulkarni)" },
  { username: "sneha@poojary.net", password: "Staff@123", label: "Staff – must change password on first login" },
];

