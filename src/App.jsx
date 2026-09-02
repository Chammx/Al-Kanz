import React, { useEffect, useMemo, useState } from "react";
import { databases, ID, Query } from "./lib/appwrite";

// Appwrite compatibility layer for the existing Al Kanz UI.
// It keeps the existing CRUD code readable while removing Supabase.
const hasSupabase = true;

// ---------------------------------------------------------------------------
// Appwrite compatibility layer
// ---------------------------------------------------------------------------
// The original UI was written around Supabase's `from(...).select()/insert()`
// API.  To avoid forcing you to create 10+ Appwrite schemas immediately, this
// adapter stores each logical table as a row in one physical Appwrite table:
//   database: al-kanz-db
//   table:    app_state
//   columns:  table_name, payload
// The rest of the UI can keep using the existing Supabase-style calls.

const STATE_DATABASE_ID = "al-kanz-db";
const STATE_TABLE_ID = "app_state";

const mapAppwriteRow = (row) => ({
  ...row,
  id: row.id || row.$id,
  created_at: row.created_at || row.$createdAt,
  updated_at: row.updated_at || row.$updatedAt,
});

const normalizeData = (table, data) => {
  const value = { ...data };
  if (table === "audit_logs" && value.details && typeof value.details !== "string") {
    value.details = JSON.stringify(value.details);
  }
  if (table === "expenses") {
    delete value.account;
    delete value.reference;
  }
  if (table === "money_transfers") delete value.reference;
  if (table === "transactions") {
    delete value.expense_id;
    delete value.transfer_id;
  }
  return value;
};

const getNestedValue = (row, field) => {
  if (field === "id") return row.id || row.$id;
  if (field === "created_at") return row.created_at || row.$createdAt;
  if (field === "updated_at") return row.updated_at || row.$updatedAt;
  return row[field];
};

function createAppwriteQuery(table) {
  let operation = "select";
  let payload = {};
  const filters = [];
  let orderBy = null;
  let limitCount = null;
  let single = false;
  let maybeSingle = false;

  const builder = {
    select() { return builder; },
    eq(field, value) {
      filters.push({ type: "eq", field, value });
      return builder;
    },
    ilike(field, value) {
      filters.push({ type: "ilike", field, value });
      return builder;
    },
    order(field, { ascending = true } = {}) {
      orderBy = { field, ascending };
      return builder;
    },
    limit(n) {
      limitCount = Number(n);
      return builder;
    },
    single() { single = true; return builder; },
    maybeSingle() { maybeSingle = true; return builder; },
    insert(data) {
      operation = "insert";
      payload = Array.isArray(data) ? data[0] : data;
      return builder;
    },
    update(data) {
      operation = "update";
      payload = data;
      return builder;
    },
    async execute() {
      try {
        const result = await databases.listRows({
          databaseId: STATE_DATABASE_ID,
          tableId: STATE_TABLE_ID,
          queries: [],
          total: false,
        });

        let stateRows = (result.rows || []).filter((r) => r.table_name === table);
        let rows = stateRows.map((r) => {
          let data = {};
          try { data = r.payload ? JSON.parse(r.payload) : {}; } catch { data = {}; }
          return mapAppwriteRow({
            ...data,
            $id: r.$id,
            $createdAt: r.$createdAt,
            $updatedAt: r.$updatedAt,
          });
        });

        for (const filter of filters) {
          rows = rows.filter((row) => {
            const actual = getNestedValue(row, filter.field);
            if (filter.type === "eq") {
              return String(actual ?? "") === String(filter.value ?? "");
            }
            return String(actual ?? "").toLowerCase().includes(
              String(filter.value ?? "").replace(/^%|%$/g, "").toLowerCase()
            );
          });
        }

        if (orderBy) {
          const { field, ascending } = orderBy;
          rows.sort((a, b) => {
            const av = getNestedValue(a, field);
            const bv = getNestedValue(b, field);
            const ad = new Date(av).getTime();
            const bd = new Date(bv).getTime();
            const comparableA = Number.isNaN(ad) ? String(av ?? "") : ad;
            const comparableB = Number.isNaN(bd) ? String(bv ?? "") : bd;
            if (comparableA < comparableB) return ascending ? -1 : 1;
            if (comparableA > comparableB) return ascending ? 1 : -1;
            return 0;
          });
        }

        if (limitCount != null) rows = rows.slice(0, limitCount);

        if (operation === "select") {
          if (single) {
            if (!rows[0]) return { data: null, error: { message: `No ${table} row found` } };
            return { data: rows[0], error: null };
          }
          if (maybeSingle) return { data: rows[0] || null, error: null };
          return { data: rows, error: null };
        }

        if (operation === "insert") {
          const clean = normalizeData(table, payload);
          const row = await databases.createRow({
            databaseId: STATE_DATABASE_ID,
            tableId: STATE_TABLE_ID,
            rowId: ID.unique(),
            data: {
              table_name: table,
              payload: JSON.stringify(clean),
            },
          });
          return {
            data: mapAppwriteRow({ ...clean, $id: row.$id, $createdAt: row.$createdAt, $updatedAt: row.$updatedAt }),
            error: null,
          };
        }

        if (operation === "update") {
          if (!rows[0]) return { data: null, error: { message: `No ${table} row matched update` } };
          const physical = await databases.getRow({
            databaseId: STATE_DATABASE_ID,
            tableId: STATE_TABLE_ID,
            rowId: rows[0].id,
          });
          let existing = {};
          try { existing = physical.payload ? JSON.parse(physical.payload) : {}; } catch { existing = {}; }
          const merged = normalizeData(table, { ...existing, ...payload });
          const row = await databases.updateRow({
            databaseId: STATE_DATABASE_ID,
            tableId: STATE_TABLE_ID,
            rowId: rows[0].id,
            data: { table_name: table, payload: JSON.stringify(merged) },
          });
          return {
            data: mapAppwriteRow({ ...merged, $id: row.$id, $createdAt: row.$createdAt, $updatedAt: row.$updatedAt }),
            error: null,
          };
        }
      } catch (error) {
        console.error(`Appwrite ${operation} ${table} failed:`, error);
        return { data: null, error };
      }
    },
    then(resolve, reject) { return builder.execute().then(resolve, reject); },
  };

  return builder;
}

const supabase = { from: createAppwriteQuery };

import {
  LayoutDashboard,
  Wrench,
  Users,
  Package,
  Truck,
  UserRound,
  Receipt,
  BarChart3,
  Wallet,
  Settings,
  ShieldCheck,
  FileText,
  ArrowLeftRight,
  Plus,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  Sofa,
  Armchair,
  Car,
  Scissors,
  Clock3,
  CheckCircle2,
  CircleDollarSign,
  CalendarDays,
  MoreHorizontal,
  ArrowUpRight,
  Phone,
  MapPin,
  X,
  Menu,
  ClipboardList,
  CreditCard,
  Banknote,
  TrendingUp,
  AlertCircle,
  Eye,
  Edit3,
  Trash2,
  Save,
  LogOut,
  Lock,
  UserCog,
  Layers3,
  Database,
  ReceiptText,
  Printer,
  Sparkles,
  Download,
  SlidersHorizontal,
  RefreshCw,
  MessageCircle,
  Smartphone,
  Mail,
  Copy,
} from "lucide-react";

/* ============================================================
   AL KANZ UPHOLSTERY
   COMPLETE SINGLE-FILE APPLICATION
============================================================ */

const INITIAL_JOBS = [
  {
    id: "AK-1048",
    customer: "Ahmed Rahman",
    phone: "+971 50 123 4567",
    item: "3-Seater Sofa",
    work: "Full Leather Replacement",
    material: "Premium Leather",
    amount: 28000,
    paid: 12000,
    status: "In Progress",
    progress: 75,
    date: "21 Aug 2026",
  },
  {
    id: "AK-1047",
    customer: "Nabeel Ahmed",
    phone: "+971 52 234 5678",
    item: "Leather Recliner",
    work: "Repair & Stitching",
    material: "Brown Leather",
    amount: 12000,
    paid: 5000,
    status: "In Progress",
    progress: 55,
    date: "21 Aug 2026",
  },
  {
    id: "AK-1046",
    customer: "Sameer Khan",
    phone: "+971 55 345 6789",
    item: "Office Sofa Set",
    work: "Fabric Replacement",
    material: "Velvet Fabric",
    amount: 18500,
    paid: 10000,
    status: "Ready",
    progress: 100,
    date: "20 Aug 2026",
  },
  {
    id: "AK-1045",
    customer: "Faris Traders",
    phone: "+971 4 345 6789",
    item: "6 Dining Chairs",
    work: "Seat Upholstery",
    material: "Synthetic Leather",
    amount: 9000,
    paid: 9000,
    status: "Delivered",
    progress: 100,
    date: "19 Aug 2026",
  },
];

const INITIAL_CUSTOMERS = [
  {
    id: 1,
    name: "Ahmed Rahman",
    phone: "+971 50 123 4567",
    location: "Dubai",
    jobs: 3,
    outstanding: 16000,
  },
  {
    id: 2,
    name: "Nabeel Ahmed",
    phone: "+971 52 234 5678",
    location: "Dubai",
    jobs: 2,
    outstanding: 7000,
  },
  {
    id: 3,
    name: "Sameer Khan",
    phone: "+971 55 345 6789",
    location: "Sharjah",
    jobs: 4,
    outstanding: 8500,
  },
  {
    id: 4,
    name: "Faris Traders",
    phone: "+971 4 345 6789",
    location: "Dubai",
    jobs: 6,
    outstanding: 0,
  },
];

const INITIAL_MATERIALS = [
  {
    id: 1,
    name: "Premium Black Leather",
    category: "Leather",
    unit: "Meter",
    stock: 42,
    price: 850,
  },
  {
    id: 2,
    name: "Brown Automotive Leather",
    category: "Leather",
    unit: "Meter",
    stock: 28,
    price: 950,
  },
  {
    id: 3,
    name: "Grey Velvet",
    category: "Fabric",
    unit: "Meter",
    stock: 65,
    price: 420,
  },
  {
    id: 4,
    name: "High Density Foam",
    category: "Foam",
    unit: "Sheet",
    stock: 18,
    price: 1200,
  },
];

const INITIAL_SUPPLIERS = [
  {
    id: 1,
    name: "Leather World",
    phone: "+971 4 321 1122",
    material: "Leather",
    balance: 18500,
  },
  {
    id: 2,
    name: "Modern Fabrics",
    phone: "+971 4 322 2233",
    material: "Fabric",
    balance: 7200,
  },
  {
    id: 3,
    name: "Foam House",
    phone: "+971 4 323 3344",
    material: "Foam",
    balance: 4500,
  },
];

const INITIAL_SUPERADMIN = {
  id: "sa-1",
  name: "Super Admin",
  username: "superadmin",
  password: "admin123",
  role: "Super Admin",
  isSuperAdmin: true,
  email: "admin@alkanzupholstery.com",
  phone: "+971 50 000 0000",
  status: "Active",
};

const INITIAL_STAFF = [
  {
    id: 1,
    name: "Mohammed Afsal",
    username: "mohammed",
    password: "staff123",
    role: "Master Upholsterer",
    isSuperAdmin: false,
    phone: "+971 50 456 7890",
    email: "mohammed@alkanzupholstery.com",
    status: "Active",
    salary: 6500,
    salaryPeriod: "Monthly",
    attendance: 98,
    performance: 95,
  },
  {
    id: 2,
    name: "Shameer",
    username: "shameer",
    password: "staff123",
    role: "Leather Technician",
    isSuperAdmin: false,
    phone: "+971 52 567 8901",
    email: "shameer@alkanzupholstery.com",
    status: "Active",
    salary: 5500,
    salaryPeriod: "Monthly",
    attendance: 92,
    performance: 90,
  },
  {
    id: 3,
    name: "Riyas",
    username: "riyas",
    password: "staff123",
    role: "Stitching Specialist",
    isSuperAdmin: false,
    phone: "+971 55 678 9012",
    email: "riyas@alkanzupholstery.com",
    status: "On Leave",
    salary: 4800,
    salaryPeriod: "Monthly",
    attendance: 88,
    performance: 85,
  },
];

const NAVIGATION = [
  {
    section: "WORKSPACE",
    items: [
      {
        name: "Dashboard",
        icon: LayoutDashboard,
      },
      {
        name: "Customers",
        icon: Users,
      },
      {
        name: "Materials",
        icon: Package,
      },
      {
        name: "Suppliers",
        icon: Truck,
      },
      {
        name: "Staff",
        icon: UserRound,
      },
    ],
  },
  {
    section: "BILLING",
    items: [
      { name: "Billing", icon: Receipt, children: ["Main", "Transactions", "Invoices", "Payments"] },
      { name: "Quotations", icon: FileText, children: ["New Quotation", "All Quotations"] },
    ],
  },
  {
    section: "FINANCE",
    items: [
      {
        name: "Reports",
        icon: BarChart3,
      },
      {
        name: "Accounts",
        icon: Wallet,
        children: ["Ledger", "Expenses", "Move Money"],
      },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      {
        name: "Settings",
        icon: Settings,
        children: ["User", "Audit & Security"],
      },
    ],
  },
];

const QUICK_NAV = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Customers", icon: Users },
  { name: "Quotations", icon: FileText },
  { name: "Billing", icon: Receipt },
  { name: "Reports", icon: BarChart3 },
  { name: "Accounts", icon: Wallet },
];

const money = (value) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const LOCAL_KEY = "al-kanz-uae-data-v2";

const safeParse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
};

const loadLocalData = () => {
  const raw = safeParse(localStorage.getItem(LOCAL_KEY), null);
  return raw || {
    jobs: INITIAL_JOBS,
    customers: INITIAL_CUSTOMERS,
    materials: INITIAL_MATERIALS,
    suppliers: INITIAL_SUPPLIERS,
    staff: INITIAL_STAFF,
    payments: [],
    expenses: [],
    transfers: [],
    transactions: [],
  };
};

const auditLocal = (action, entity, id, details = {}) => {
  const data = loadLocalData();
  const logs = data.auditLogs || [];
  logs.unshift({
    id: Date.now().toString(),
    action,
    entity,
    entityId: id,
    details,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...data, auditLogs: logs.slice(0, 500) }));
};

const mapJob = (row) => ({
  ...row,
  id: row.job_number || row.id,
  customer: row.customer_name || row.customer || "",
  phone: row.phone || "",
  whatsapp: row.whatsapp || row.phone || "",
  email: row.email || "",
  address: row.address || "",
  item: row.item || "",
  description: row.description || "",
  work: row.work || "",
  material: row.material || "",
  colour: row.colour || "",
  quantity: Number(row.quantity || 1),
  unitPrice: Number(row.unit_price || row.unitPrice || 0),
  materialCost: Number(row.material_cost || 0),
  labour: Number(row.labour || 0),
  otherCharges: Number(row.other_charges || 0),
  discount: Number(row.discount || 0),
  amount: Number(row.amount || row.total || 0),
  total: Number(row.total || row.amount || 0),
  paid: Number(row.paid || 0),
  balance: Math.max(0, Number(row.total || row.amount || 0) - Number(row.paid || 0)),
  vat: Number(row.vat || 0),
  vatRate: Number(row.vat_rate || 0),
  paymentMethod: row.payment_method || row.paymentMethod || "",
  quotationId: row.quotation_id || row.quotationId || "",
  status: row.status || "Received",
  progress: Number(row.progress || 0),
  deliveryDate: row.delivery_date || "",
  notes: row.notes || "",
  items: Array.isArray(row.items) ? row.items : [],
  invoice_type: row.invoice_type || "repair",
  date: row.created_at ? new Date(row.created_at).toLocaleDateString("en-AE", { day:"2-digit", month:"short", year:"numeric", timeZone:"Asia/Dubai" }) : (row.date || ""),
  dbId: row.id,
});

const mapCustomer = (row) => ({
  ...row,
  id: row.id,
  name: row.name,
  phone: row.phone || "",
  whatsapp: row.whatsapp || row.phone || "",
  email: row.email || "",
  location: row.location || "Dubai",
  address: row.address || "",
  notes: row.notes || "",
  jobs: Number(row.jobs_count || row.jobs || 0),
  outstanding: Number(row.outstanding || 0),
});

const mapMaterial = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  unit: row.unit,
  stock: Number(row.stock || 0),
  price: Number(row.price || 0),
});

const mapSupplier = (row) => ({
  ...row,
  id: row.id, name: row.name, phone: row.phone || "", email: row.email || "", address: row.address || "", location: row.location || "Dubai", notes: row.notes || "", material: row.material || "", balance: Number(row.balance || 0)
});

const mapStaff = (row) => ({
  ...row,
  id: row.id, name: row.name || "", role: row.role || "Upholsterer", phone: row.phone || "", email: row.email || "",
  username: row.username || "", password: row.password || "",
  isSuperAdmin: row.is_superadmin === "true" || row.isSuperAdmin === true || row.is_superadmin === true || row.role === "Super Admin",
  address: row.address || "", emergencyContact: row.emergency_contact || row.emergencyContact || "", joiningDate: row.joining_date || row.joiningDate || "",
  bank: row.bank || "", iban: row.iban || "", salary: Number(row.salary || 0), salaryPeriod: row.salary_period || row.salaryPeriod || "Monthly",
  attendance: Number(row.attendance || 0), performance: Number(row.performance || 0), status: row.status || "Active", notes: row.notes || "",
});

/* ============================================================
   AUTHENTICATION / LOGIN PAGE
============================================================ */

function LoginPage({ onLogin, staffList = [] }) {
  const [loginMode, setLoginMode] = useState("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleQuickLogin = (u, p, mode) => {
    setUsername(u);
    setPassword(p);
    setLoginMode(mode);
    submitLogin(u, p);
  };

  const submitLogin = (uVal, pVal) => {
    const userToTest = uVal !== undefined ? uVal : username;
    const passToTest = pVal !== undefined ? pVal : password;
    
    setError("");
    if (!userToTest.trim() || !passToTest.trim()) {
      setError("Please enter both username/ID and password.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const cleanUser = userToTest.trim().toLowerCase();
      
      if ((cleanUser === "superadmin" || cleanUser === "admin") && passToTest === "admin123") {
        const adminUser = {
          id: "sa-1",
          name: "Super Admin",
          username: "superadmin",
          role: "Super Admin",
          isSuperAdmin: true,
          email: "admin@alkanzupholstery.com"
        };
        onLogin(adminUser);
        setLoading(false);
        return;
      }

      const matchedStaff = staffList.find(
        (s) => (s.username && s.username.toLowerCase() === cleanUser) ||
               (s.email && s.email.toLowerCase() === cleanUser) ||
               (s.name && s.name.toLowerCase() === cleanUser)
      );

      if (matchedStaff) {
        if (matchedStaff.status === "Disabled" || matchedStaff.status === "Inactive") {
          setError("This staff account is currently disabled. Please contact Super Admin.");
          setLoading(false);
          return;
        }

        if (matchedStaff.password && matchedStaff.password !== passToTest) {
          setError("Invalid password. Please try again.");
          setLoading(false);
          return;
        }

        const isSA = !!matchedStaff.isSuperAdmin || matchedStaff.role === "Super Admin" || matchedStaff.role === "Manager";
        const userSession = {
          id: matchedStaff.id,
          name: matchedStaff.name,
          username: matchedStaff.username || matchedStaff.name.toLowerCase().replace(/\s+/g, ""),
          role: matchedStaff.role || (isSA ? "Super Admin" : "Staff"),
          isSuperAdmin: isSA,
          email: matchedStaff.email || "",
          phone: matchedStaff.phone || ""
        };
        onLogin(userSession);
        setLoading(false);
        return;
      }

      setError("Invalid username or password. Try superadmin / admin123 or staff credentials.");
      setLoading(false);
    }, 350);
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo-wrap">
            <div className="login-logo-icon"><Sofa size={28} /></div>
            <div>
              <h2>AL KANZ UPHOLSTERY</h2>
              <p>UAE WORKSHOP MANAGEMENT SYSTEM</p>
            </div>
          </div>
        </div>

        <div className="login-card card">
          <div className="login-tabs">
            <button
              type="button"
              className={`login-tab ${loginMode === "admin" ? "active" : ""}`}
              onClick={() => { setLoginMode("admin"); setError(""); }}
            >
              <ShieldCheck size={16} /> Super Admin
            </button>
            <button
              type="button"
              className={`login-tab ${loginMode === "staff" ? "active" : ""}`}
              onClick={() => { setLoginMode("staff"); setError(""); }}
            >
              <Users size={16} /> Staff Login
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submitLogin(); }}>
            {error && (
              <div className="login-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label>
                {loginMode === "admin" ? "Super Admin Username / Email" : "Staff ID or Username"}
              </label>
              <div className="login-input-wrap">
                <UserCog size={18} />
                <input
                  type="text"
                  placeholder={loginMode === "admin" ? "e.g. superadmin" : "e.g. mohammed"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label>Password</label>
              <div className="login-input-wrap">
                <Lock size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <Eye size={16} />
                </button>
              </div>
            </div>

            <button type="submit" className="primary-button login-submit" disabled={loading}>
              {loading ? "Authenticating..." : `Sign in as ${loginMode === "admin" ? "Super Admin" : "Staff"}`}
            </button>
          </form>

          <div className="login-quick-demo">
            <span>QUICK DEMO ACCESSS</span>
            <div className="quick-buttons">
              <button
                type="button"
                className="quick-btn admin-quick"
                onClick={() => handleQuickLogin("superadmin", "admin123", "admin")}
              >
                <ShieldCheck size={14} /> Super Admin Demo
              </button>
              <button
                type="button"
                className="quick-btn staff-quick"
                onClick={() => handleQuickLogin("mohammed", "staff123", "staff")}
              >
                <Users size={14} /> Staff Demo (Mohammed)
              </button>
            </div>
          </div>
        </div>

        <div className="login-footer">
          <small>Al Kanz Upholstery Workshop · Dubai, UAE</small>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => safeParse(localStorage.getItem("al-kanz-session"), null));

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem("al-kanz-session", JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("al-kanz-session");
  };

  const [page, setPage] = useState("Dashboard");
  const [jobs, setJobs] = useState(() => loadLocalData().jobs || INITIAL_JOBS);
  const [customers, setCustomers] = useState(() => loadLocalData().customers || INITIAL_CUSTOMERS);
  const [materials, setMaterials] = useState(() => loadLocalData().materials || INITIAL_MATERIALS);
  const [suppliers, setSuppliers] = useState(() => loadLocalData().suppliers || INITIAL_SUPPLIERS);
  const [staff, setStaff] = useState(() => loadLocalData().staff || INITIAL_STAFF);
  const [payments, setPayments] = useState(() => loadLocalData().payments || []);
  const [expenses, setExpenses] = useState(() => loadLocalData().expenses || []);
  const [transfers, setTransfers] = useState(() => loadLocalData().transfers || []);
  const [transactions, setTransactions] = useState(() => loadLocalData().transactions || []);
  const [auditLogs, setAuditLogs] = useState(() => loadLocalData().auditLogs || []);
  const [loadingData, setLoadingData] = useState(false);
  const [dbReady, setDbReady] = useState(hasSupabase);

  const [openSections, setOpenSections] = useState(() => new Set(["Billing", "Quotations"]));

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("al-kanz-theme") || "day");
  const [modal, setModal] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [search, setSearch] = useState("");
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [entityPreview, setEntityPreview] = useState(null);
  const [quotations, setQuotations] = useState(() => safeParse(localStorage.getItem("al-kanz-quotations"), []));

  useEffect(() => {
    const local = loadLocalData();
    if (!hasSupabase) return;

    const loadRemote = async () => {
      setLoadingData(true);
      try {
        const [j, c, m, s, st, p, e, tr, tx, al] = await Promise.all([
          supabase.from("jobs").select("*").order("created_at", { ascending: false }),
          supabase.from("customers").select("*").order("created_at", { ascending: false }),
          supabase.from("materials").select("*").order("created_at", { ascending: false }),
          supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
          supabase.from("staff").select("*").order("created_at", { ascending: false }),
          supabase.from("payments").select("*").order("paid_at", { ascending: false }),
          supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
          supabase.from("money_transfers").select("*").order("transfer_date", { ascending: false }),
          supabase.from("transactions").select("*").order("transaction_date", { ascending: false }),
          supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500),
        ]);
        const err = [j,c,m,s,st,p,e,tr,tx,al].find(x => x.error);
        if (err?.error) throw err.error;

        setJobs((j.data || []).map(mapJob));
        setCustomers((c.data || []).map(mapCustomer));
        setMaterials((m.data || []).map(mapMaterial));
        setSuppliers((s.data || []).map(mapSupplier));
        setStaff((st.data || []).map(mapStaff));
        setPayments(p.data || []);
        setExpenses(e.data || []);
        setTransfers(tr.data || []);
        setTransactions((tx.data && tx.data.length) ? tx.data : (local.transactions || []));
        setAuditLogs(al.data || []);
        setDbReady(true);
      } catch (error) {
        console.error("Al Kanz database load failed:", error);
        setDbReady(false);
      } finally {
        setLoadingData(false);
      }
    };
    loadRemote();
  }, []);

  useEffect(() => {
    const data = { jobs, customers, materials, suppliers, staff, payments, expenses, transfers, transactions, auditLogs };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  }, [jobs, customers, materials, suppliers, staff, payments, expenses, transfers, transactions, auditLogs]);

  useEffect(() => {
    localStorage.setItem("al-kanz-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("al-kanz-quotations", JSON.stringify(quotations));
  }, [quotations]);

  const totalSales = jobs.reduce(
  (a, b) => a + Number(b.amount || 0),
  0
);

const totalPaid = jobs.reduce(
  (a, b) => a + Number(b.paid || 0),
  0
);

const outstanding = totalSales - totalPaid;

const totalExpenses = expenses.reduce(
  (a, b) => a + Number(b.amount || 0),
  0
);

const netCash = totalPaid - totalExpenses;

  const activeJobs = jobs.filter(
    (j) => j.status === "In Progress"
  ).length;

  const readyJobs = jobs.filter(
    (j) => j.status === "Ready"
  ).length;

  const getParentSection = (name) => {
    for (const group of NAVIGATION) {
      for (const item of group.items) {
        if (item.children?.includes(name)) return item.name;
      }
    }
    return null;
  };

  const navigate = (name) => {
    const restrictedForStaff = ["Accounts", "Ledger", "Expenses", "Move Money", "Reports", "Audit & Security"];
    if (currentUser && !currentUser.isSuperAdmin && restrictedForStaff.includes(name)) {
      alert("Access Denied: Super Admin permissions required to access financial & security modules.");
      setPage("Dashboard");
      return;
    }

    setPage(name);
    setSidebarOpen(false);

    // Child navigation never collapses its parent. Each expandable
    // section remembers its own open/closed state independently.
    const parent = getParentSection(name);
    if (parent) {
      setOpenSections((prev) => {
        const next = new Set(prev);
        next.add(parent);
        return next;
      });
    }

    setNotificationOpen(false);
    setAdminMenuOpen(false);

    if (name === "New Repair Job") {
      setModal("job");
    }
  };

  const addJob = async (job) => {
    const id = `AK-${1050 + jobs.length}`;
    const newJob = {
      ...job,
      id,
      date: new Date().toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }),
      progress: 5,
      status: "Received",
      paid: Number(job.paid || 0),
      amount: Number(job.amount || 0),
    };

    setJobs(prev => [newJob, ...prev]);
    setModal(null);
    setPage("Active Jobs");

    if (hasSupabase) {
      try {
        let customerId = null;
        const existing = await supabase.from("customers").select("id").eq("phone", job.phone).limit(1).maybeSingle();
        if (existing.data?.id) customerId = existing.data.id;
        else {
          const created = await supabase.from("customers").insert({ name: job.customer, phone: job.phone, location: "Dubai", jobs_count: 0 }).select("id").single();
          if (created.error) throw created.error;
          customerId = created.data.id;
        }
        const row = {
          job_number: id, customer_id: customerId, customer_name: job.customer, phone: job.phone,
          item: job.item, description: job.description || "", work: job.work, material: job.material || "",
          colour: job.colour || "", quantity: Number(job.quantity || 1), material_cost: Number(job.materialCost || 0),
          labour: Number(job.labour || 0), other_charges: Number(job.otherCharges || 0), discount: Number(job.discount || 0),
          amount: Number(job.amount || 0), paid: Number(job.paid || 0), status: "Received", progress: 5,
          delivery_date: job.deliveryDate || null, notes: job.notes || "",
        };
        const saved = await supabase.from("jobs").insert(row).select("*").single();
        if (saved.error) throw saved.error;
        if (Number(job.paid || 0) > 0) {
          const pay = await supabase.from("payments").insert({ job_id: saved.data.id, customer_id: customerId, amount: Number(job.paid), payment_method: "Cash", notes: "Advance payment" }).select("*").single();
          if (pay.error) throw pay.error;
          await supabase.from("transactions").insert({ transaction_type: "Income", description: `Advance · ${job.customer} · ${id}`, amount: Number(job.paid), account: "Cash", job_id: saved.data.id, customer_id: customerId, payment_id: pay.data.id });
        }
        await supabase.from("audit_logs").insert({ action: "Created repair job", entity_type: "job", entity_id: saved.data.id, details: { job_number: id } });
      } catch (error) {
        console.error("Job save failed:", error);
        alert("Job saved locally, but cloud sync failed. Check Appwrite settings.");
      }
    }
    auditLocal("Created repair job", "job", id, { customer: job.customer });
  };

  const updateJobStatus = async (jobId, status) => {
    setJobs(prev => prev.map(job => job.id === jobId ? { ...job, status } : job));
    if (hasSupabase) {
      const { error } = await supabase.from("jobs").update({ status, updated_at: new Date().toISOString() }).eq("job_number", jobId);
      if (error) console.error("Status update failed:", error);
    }
    auditLocal("Updated job status", "job", jobId, { status });
  };

  const recordPayment = async (jobId, payment) => {
    const amount = Number(payment);
    if (!amount || amount <= 0) return;
    const current = jobs.find(j => j.id === jobId);
    if (!current) return;
    const balance = Math.max(0, Number(current.amount || 0) - Number(current.paid || 0));
    if (amount > balance) { alert("Payment cannot be greater than the balance."); return; }
    const paid = Number(current.paid || 0) + amount;
    setJobs(prev => prev.map(job => job.id === jobId ? { ...job, paid } : job));
    setSelectedJob(prev => prev && prev.id === jobId ? { ...prev, paid } : prev);
    const paymentRow = { id: Date.now().toString(), job_id: jobId, customer: current.customer, amount, payment_method: "Cash", paid_at: new Date().toISOString() };
    setPayments(prev => [paymentRow, ...prev]);
    setTransactions(prev => [{ id: Date.now().toString(), transaction_type: "Income", description: `Payment · ${current.customer} · ${jobId}`, amount, account: "Cash", transaction_date: new Date().toISOString() }, ...prev]);
    if (hasSupabase) {
      try {
        const jobDb = await supabase.from("jobs").select("id,customer_id").eq("job_number", jobId).single();
        if (jobDb.error) throw jobDb.error;
        const pay = await supabase.from("payments").insert({ job_id: jobDb.data.id, customer_id: jobDb.data.customer_id, amount, payment_method: "Cash" }).select("*").single();
        if (pay.error) throw pay.error;
        const upd = await supabase.from("jobs").update({ paid, updated_at: new Date().toISOString() }).eq("id", jobDb.data.id);
        if (upd.error) throw upd.error;
        await supabase.from("transactions").insert({ transaction_type: "Income", description: `Payment · ${current.customer} · ${jobId}`, amount, account: "Cash", job_id: jobDb.data.id, customer_id: jobDb.data.customer_id, payment_id: pay.data.id });
        await supabase.from("audit_logs").insert({ action: "Recorded payment", entity_type: "job", entity_id: jobDb.data.id, details: { job_number: jobId, amount } });
      } catch (error) {
        console.error("Payment sync failed:", error);
        alert("Payment saved locally, but cloud sync failed.");
      }
    }
    auditLocal("Recorded payment", "job", jobId, { amount });
  };

  const saveCustomer = async (customer) => {
    const editing = Boolean(customer.id);
    const record = {
      ...customer,
      id: customer.id || Date.now(),
      jobs: Number(customer.jobs || 0),
      outstanding: Number(customer.outstanding || 0),
      whatsapp: customer.whatsapp || customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
    };
    setCustomers(prev => editing ? prev.map(x => String(x.id) === String(record.id) ? { ...x, ...record } : x) : [record, ...prev]);
    setModal(null);
    if (hasSupabase) {
      try {
        const payload = { name: record.name, phone: record.phone, whatsapp: record.whatsapp, email: record.email, location: record.location || "Dubai", address: record.address, notes: record.notes, jobs_count: record.jobs || 0, outstanding: record.outstanding || 0 };
        const result = editing
          ? await supabase.from("customers").update(payload).eq("id", record.id)
          : await supabase.from("customers").insert(payload);
        if (result.error) throw result.error;
      } catch (error) {
        console.error("Customer save failed:", error);
        alert(editing ? "Customer updated locally, but cloud sync failed." : "Customer saved locally, but cloud sync failed.");
      }
    }
    auditLocal(editing ? "Updated customer" : "Created customer", "customer", record.id, { name: record.name });
  };

  const saveSupplier = async (supplier) => {
    const editing = Boolean(supplier.id);
    const record = { ...supplier, id: supplier.id || Date.now(), balance: Number(supplier.balance || 0) };
    setSuppliers(prev => editing ? prev.map(x => String(x.id) === String(record.id) ? { ...x, ...record } : x) : [record, ...prev]);
    setModal(null);
    if (hasSupabase) {
      try {
        const payload = { name: record.name, phone: record.phone, email: record.email || "", address: record.address || "", location: record.location || "Dubai", notes: record.notes || "", material: record.material || "", balance: record.balance };
        const result = editing ? await supabase.from("suppliers").update(payload).eq("id", record.id) : await supabase.from("suppliers").insert(payload);
        if (result.error) throw result.error;
      } catch (error) {
        console.error("Supplier save failed:", error);
        alert(editing ? "Supplier updated locally, but cloud sync failed." : "Supplier saved locally, but cloud sync failed.");
      }
    }
    auditLocal(editing ? "Updated supplier" : "Created supplier", "supplier", record.id, { name: record.name });
  };

  const saveStaff = async (person) => {
    const editing = Boolean(person.id);
    const record = { ...person, id: person.id || Date.now(), salary: Number(person.salary || 0), attendance: Number(person.attendance || 0), performance: Number(person.performance || 0) };
    setStaff(prev => editing ? prev.map(x => String(x.id) === String(record.id) ? { ...x, ...record } : x) : [record, ...prev]);
    setModal(null);
    if (hasSupabase) {
      try {
        const payload = {
          name: record.name, role: record.role, phone: record.phone, email: record.email || "", address: record.address || "",
          emergency_contact: record.emergencyContact || "", joining_date: record.joiningDate || "", bank: record.bank || "", iban: record.iban || "",
          salary: record.salary, salary_period: record.salaryPeriod || "Monthly", attendance: record.attendance, performance: record.performance,
          status: record.status || "Active", notes: record.notes || "",
        };
        const result = editing ? await supabase.from("staff").update(payload).eq("id", record.id) : await supabase.from("staff").insert(payload);
        if (result.error) throw result.error;
      } catch (error) {
        console.error("Staff save failed:", error);
        alert(editing ? "Staff updated locally, but cloud sync failed." : "Staff saved locally, but cloud sync failed.");
      }
    }
    auditLocal(editing ? "Updated staff member" : "Created staff member", "staff", record.id, { name: record.name });
  };

  const editEntity = (type, record) => {
    setEntityPreview(null);
    setModal({ type, record });
  };

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((job) =>
      [job.customer, job.item, job.work, job.id, job.phone]
        .some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [jobs, search]);

  const globalSearchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    const add = (type, label, meta, target, item) => {
      if (results.length >= 8) return;
      results.push({ type, label, meta, target, item });
    };
    jobs.forEach((x) => {
      if ([x.customer, x.item, x.work, x.id, x.phone].some(v => String(v || "").toLowerCase().includes(q)))
        add("Job", x.customer || "Job", `${x.id} · ${x.item || "Workshop item"}`, "Dashboard", x);
    });
    customers.forEach((x) => {
      if ([x.name, x.phone, x.location].some(v => String(v || "").toLowerCase().includes(q)))
        add("Customer", x.name, `${x.phone || "No phone"} · ${x.location || "Dubai"}`, "Customers", x);
    });
    quotations.forEach((x) => {
      if ([x.id, x.customer, x.item].some(v => String(v || "").toLowerCase().includes(q)))
        add("Quotation", x.id, `${x.customer} · ${money(x.amount)}`, "All Quotations", x);
    });
    transactions.forEach((x) => {
      if ([x.description, x.transaction_type, x.account].some(v => String(v || "").toLowerCase().includes(q)))
        add("Transaction", x.description || "Transaction", `${x.transaction_type || "Income"} · ${money(x.amount)}`, "Transactions", x);
    });
    return results;
  }, [search, jobs, customers, quotations, transactions]);

  if (!currentUser) {
    return (
      <div className={`app theme-${theme} ${theme === "night" ? "theme-dark" : ""}`} data-theme={theme}>
        <LoginPage onLogin={handleLogin} staffList={staff} />
      </div>
    );
  }

  const displayedNav = NAVIGATION.map((group) => {
    if (currentUser?.isSuperAdmin) return group;
    if (group.section === "FINANCE") return null;
    if (group.section === "SYSTEM") {
      return {
        ...group,
        items: group.items.map((item) => (item.name === "Settings" ? { ...item, children: ["User"] } : item)),
      };
    }
    return group;
  }).filter(Boolean);

  const displayedQuickNav = QUICK_NAV.filter(({ name }) => {
    if (currentUser?.isSuperAdmin) return true;
    return !["Reports", "Accounts", "Ledger", "Expenses", "Settings"].includes(name);
  });

  const userInitials = String(currentUser.name || "AK")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <style>{FINAL_CSS}</style>

      <div className={`app theme-${theme} ${theme === "night" ? "theme-dark" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-theme={theme}>
        {/* =====================================================
            SIDEBAR
        ===================================================== */}

        <aside
          className={`sidebar ${
            sidebarOpen ? "sidebar-open" : ""
          }`}
        >
          <div className="brand-area">
            <div className="brand">
              <div className="brand-logo">
                <Sofa size={23} />
              </div>

              <div>
                <strong>AL KANZ</strong>
                <span>UPHOLSTERY</span>
              </div>
            </div>

            <button
              className="mobile-close"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={19} />
            </button>

            <div className="workshop-status">
              <span />
              Workshop Open
            </div>
          </div>

          <div className="nav-scroll">
            {displayedNav.map((group) => (
              <div className="nav-group" key={group.section}>
                <div className="nav-section-title">
                  {group.section}
                </div>

                {group.items.map((item) => {
                  const Icon = item.icon;
                  const hasChildren =
                    item.children &&
                    item.children.length > 0;

                  return (
                    <div key={item.name}>
                      <button
                        className={`nav-item ${
                          page === item.name
                            ? "selected"
                            : ""
                        }`}
                        onClick={() => {
                          if (hasChildren) {
                            setOpenSections((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.name)) next.delete(item.name);
                              else next.add(item.name);
                              return next;
                            });
                            setNotificationOpen(false);
                            setAdminMenuOpen(false);
                          } else {
                            navigate(item.name);
                          }
                        }}
                      >
                        <Icon size={17} />
                        <span>{item.name}</span>

                        {hasChildren && (
                          <ChevronDown
                            size={14}
                            className={
                              openSections.has(item.name)
                                ? "chevron-open"
                                : ""
                            }
                          />
                        )}
                      </button>

                      {hasChildren &&
                        openSections.has(item.name) && (
                          <div className="sub-menu">
                            {item.children.map(
                              (child) => (
                                <button
                                  key={child}
                                  className={
                                    page === child
                                      ? "sub-selected"
                                      : ""
                                  }
                                  onClick={() =>
                                    navigate(child)
                                  }
                                >
                                  <span />
                                  {child}
                                </button>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="sidebar-account">
            <div className="account-card">
              <div className="account-avatar">
                AK
              </div>

              <div>
                <strong>Al Kanz Upholstery</strong>
                <span>Owner account</span>
              </div>

              <MoreHorizontal size={16} />
            </div>

            <button type="button" className="logout" onClick={() => { setAdminMenuOpen(false); setSidebarOpen(false); alert("Demo mode: logout is not connected to authentication yet."); }}>
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <button className="sidebar-overlay" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />
        )}

        {/* =====================================================
            MAIN
        ===================================================== */}

        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="mobile-menu"
                aria-label="Toggle sidebar"
                onClick={() => {
                  if (window.innerWidth <= 850) setSidebarOpen(true);
                  else setSidebarCollapsed(prev => !prev);
                }}
              >
                <Menu size={21} />
              </button>

              <div className="breadcrumb">
                <span>Al Kanz · Dubai</span>
                <ChevronRight size={13} />
                <strong>{page}</strong>
              </div>
            </div>

            <div className="topbar-right">
              <div className="global-search-wrap">
                <div className="global-search">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customers, quotations, transactions..."
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSearch("");
                      if (e.key === "Enter" && globalSearchResults[0]) {
                        navigate(globalSearchResults[0].target);
                        setSearch("");
                      }
                    }}
                  />
                  {search && <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear search"><X size={13}/></button>}
                  <kbd>⌘ K</kbd>
                </div>
                {search && (
                  <div className="global-search-results">
                    <div className="search-results-head"><span>SMART SEARCH</span><small>{globalSearchResults.length} result{globalSearchResults.length === 1 ? "" : "s"}</small></div>
                    {globalSearchResults.length ? globalSearchResults.map((r, i) => (
                      <button type="button" className="search-result" key={`${r.type}-${i}`} onClick={() => { navigate(r.target); setSearch(""); }}>
                        <span className="search-result-icon">{r.type === "Customer" ? <Users size={14}/> : r.type === "Quotation" ? <FileText size={14}/> : r.type === "Transaction" ? <ReceiptText size={14}/> : <ClipboardList size={14}/>}</span>
                        <span><strong>{r.label}</strong><small>{r.type} · {r.meta}</small></span>
                        <ChevronRight size={14}/>
                      </button>
                    )) : <div className="search-empty"><Search size={18}/><strong>No matching records</strong><span>Try a customer, quotation number or transaction.</span></div>}
                  </div>
                )}
              </div>

              <button type="button" className={`ai-help-button ${aiOpen ? "active" : ""}`} onClick={() => { setAiOpen(v => !v); setAdminMenuOpen(false); setNotificationOpen(false); }} title="AI Help">
                <Sparkles size={16}/> <span>AI Help</span>
              </button>

              <div className="notification-wrap">
                <button
                  type="button"
                  className={`notification ${notificationOpen ? "active" : ""}`}
                  aria-label="Open notifications"
                  aria-expanded={notificationOpen}
                  onClick={() => {
                    setNotificationOpen(prev => !prev);
                    setAdminMenuOpen(false);
                  }}
                >
                  <Bell size={18} />
                  <i />
                </button>

                {notificationOpen && (
                  <div className="notification-popover">
                    <div className="popover-title">
                      <div>
                        <span>UPDATES</span>
                        <strong>Notifications</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotificationOpen(false)}
                        aria-label="Close notifications"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="notification-item">
                      <span className="notification-icon"><Bell size={15} /></span>
                      <div>
                        <strong>Workshop is ready</strong>
                        <p>Check today's jobs, payments and expenses.</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="notification-footer"
                      onClick={() => setNotificationOpen(false)}
                    >
                      Mark as viewed
                    </button>
                  </div>
                )}
              </div>

              <div className="admin-menu-wrap">
                <button
                  type="button"
                  className="admin-profile"
                  onClick={() => setAdminMenuOpen((prev) => !prev)}
                  aria-expanded={adminMenuOpen}
                  aria-label="Open Admin menu"
                >
                  <div>{userInitials}</div>
                  <section>
                    <strong>{currentUser.name}</strong>
                    <span>{currentUser.role || (currentUser.isSuperAdmin ? "Super Admin" : "Staff")}</span>
                  </section>
                  <ChevronDown
                    size={14}
                    className={adminMenuOpen ? "chevron-open" : ""}
                  />
                </button>

                {adminMenuOpen && (
                  <div className="admin-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        setAdminMenuOpen(false);
                        navigate("User");
                      }}
                    >
                      <UserCog size={15} />
                      <span>My Profile ({currentUser.username ? `@${currentUser.username}` : "User"})</span>
                    </button>
                    {currentUser.isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminMenuOpen(false);
                          navigate("Settings");
                        }}
                      >
                        <Settings size={15} />
                        <span>Settings</span>
                      </button>
                    )}
                    <button
                      type="button"
                      style={{ color: "var(--danger, #d85858)" }}
                      onClick={() => {
                        setAdminMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      <LogOut size={15} />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <nav className="quick-nav" aria-label="Quick navigation">
            <div className="quick-nav-inner">
              <span className="quick-nav-label">QUICK NAV</span>
              {displayedQuickNav.map(({ name, icon: Icon }) => (
                <button
                  type="button"
                  key={name}
                  className={`quick-nav-button ${page === name ? "active" : ""}`}
                  onClick={() => navigate(name)}
                  title={`Go to ${name}`}
                >
                  <Icon size={15} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="mobile-bottom-nav" aria-label="Mobile navigation">
            {QUICK_NAV.slice(0, 5).map(({ name, icon: Icon }) => (
              <button
                type="button"
                key={name}
                className={page === name ? "active" : ""}
                onClick={() => navigate(name)}
              >
                <Icon size={17} />
                <span>{name === "Quotations" ? "Quotes" : name}</span>
              </button>
            ))}
          </div>

          {aiOpen && (
            <AIHelpPanel
              page={page}
              totalPaid={totalPaid}
              outstanding={outstanding}
              expenses={expenses}
              quotations={quotations}
              jobs={jobs}
              customers={customers}
              materials={materials}
              navigate={(target) => { setAiOpen(false); navigate(target); }}
              close={() => setAiOpen(false)}
            />
          )}

          <div className="content page-motion" key={page} data-page={page}>
            {page === "Dashboard" && (
              <Dashboard
                totalSales={totalSales}
                outstanding={outstanding}
                totalPaid={totalPaid}
                totalExpenses={totalExpenses}
                transactions={transactions}
                quotations={quotations}
                jobs={filteredJobs}
                navigate={navigate}
                setModal={setModal}
              />
            )}

            {(page === "Active Jobs" ||
              page === "Completed Jobs" ||
              page === "Delivered") && (
              <JobsPage
                title={page}
                jobs={filteredJobs}
                setModal={setModal}
                onViewJob={setSelectedJob}
              />
            )}

            {page === "Customers" && (
              <CustomersPage
                customers={customers}
                jobs={jobs}
                payments={payments}
                navigate={navigate}
                setModal={setModal}
                setEntityPreview={setEntityPreview}
                onEdit={(record) => editEntity("customer", record)}
              />
            )}

            {page === "Materials" && (
              <MaterialsPage
                materials={materials}
                setMaterials={setMaterials}
                setModal={setModal}
              />
            )}

            {page === "Suppliers" && (
              <SuppliersPage suppliers={suppliers} jobs={jobs} expenses={expenses} transactions={transactions} setSuppliers={setSuppliers} setModal={setModal} setEntityPreview={setEntityPreview} onEdit={(record) => editEntity("supplier", record)} />
            )}

            {page === "Staff" && (
              <StaffPage staff={staff} setStaff={setStaff} setModal={setModal} setEntityPreview={setEntityPreview} onEdit={(record) => editEntity("staff", record)} />
            )}

            {(page === "New Quotation" || page === "All Quotations" || page === "Quotations") && (
              <QuotationPage
                page={page}
                quotations={quotations}
                setQuotations={setQuotations}
                jobs={jobs}
              />
            )}

            {(page === "Billing" ||
              page === "Main" ||
              page === "Transactions" ||
              page === "Invoices" ||
              page === "Payments") && (
              <BillingPage
                page={page}
                jobs={jobs}
                payments={payments}
                transactions={transactions}
                outstanding={outstanding}
                totalPaid={totalPaid}
                recordPayment={recordPayment}
                customers={customers}
                materials={materials}
                quotations={quotations}
                setJobs={setJobs}
                setPayments={setPayments}
                setTransactions={setTransactions}
              />
            )}

            {page === "Reports" && (
              <ReportsPage
                jobs={jobs}
                totalPaid={totalPaid}
                outstanding={outstanding}
                totalExpenses={totalExpenses}
                netCash={netCash}
                expenses={expenses}
              />
            )}

            {(page === "Accounts" ||
              page === "Ledger" ||
              page === "Expenses" ||
              page === "Move Money") && (
              <AccountsPage
                page={page}
                totalPaid={totalPaid}
                outstanding={outstanding}
                expenses={expenses}
                setExpenses={setExpenses}
                transfers={transfers}
                setTransfers={setTransfers}
                transactions={transactions}
                setTransactions={setTransactions}
                jobs={jobs}
                navigate={navigate}
              />
            )}

            {(page === "Settings" ||
              page === "User" ||
              page === "Audit & Security") && (
              <SettingsPage page={page} theme={theme} setTheme={setTheme} />
            )}
          </div>
        </main>

        {entityPreview && (
          <EntityPreviewModal entity={entityPreview} close={() => setEntityPreview(null)} />
        )}

        {selectedJob && (
          <JobDetailsDrawer
            job={selectedJob}
            close={() => setSelectedJob(null)}
            updateStatus={updateJobStatus}
            recordPayment={recordPayment}
          />
        )}

        {/* =====================================================
            MODALS
        ===================================================== */}

        {modal === "job" && (
          <JobModal
            close={() => setModal(null)}
            save={addJob}
          />
        )}

        {(modal === "customer" || modal?.type === "customer") && (
          <CustomerModal
            close={() => setModal(null)}
            save={saveCustomer}
            initial={modal?.record}
          />
        )}

        {modal === "material" && (
          <MaterialModal
            close={() => setModal(null)}
            save={(material) => {
              const newMaterial = { ...material, id: Date.now() };
              setMaterials((prev) => [newMaterial, ...prev]);
              if (hasSupabase) {
                supabase.from("materials").insert({ name: material.name, category: material.category, unit: material.unit, stock: material.stock, price: material.price }).then(({ error }) => {
                  if (error) { console.error(error); alert("Material saved locally, but cloud sync failed."); }
                });
              }
              auditLocal("Created material", "material", newMaterial.id, { name: material.name });
              setModal(null);
            }}
          />
        )}

        {(modal === "supplier" || modal?.type === "supplier") && (
          <SupplierModal close={() => setModal(null)} save={saveSupplier} initial={modal?.record} />
        )}

        {(modal === "staff" || modal?.type === "staff") && (
          <StaffModal close={() => setModal(null)} save={saveStaff} initial={modal?.record} />
        )}
      </div>
    </>
  );
}

/* ============================================================
   DASHBOARD
============================================================ */

function Dashboard({
  totalSales,
  outstanding,
  totalPaid,
  totalExpenses = 0,
  transactions = [],
  quotations = [],
  jobs = [],
  navigate,
  setModal,
}) {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeQuotations = Array.isArray(quotations) ? quotations : [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const invoiceCount = safeJobs.length;
  const quotationCount = safeQuotations.length;
  const collectionRate = totalSales > 0 ? Math.min(100, (totalPaid / totalSales) * 100) : 0;
  const recentJobs = safeJobs.slice(0, 5);

  return (
    <div className="dashboard-modern">
      <div className="dashboard-topline">
        <div>
          <span className="eyebrow">AL KANZ UPHOLSTERY · DUBAI WORKSHOP</span>
          <h1>Good evening, Al Kanz.</h1>
          <p>Everything you need to run today's upholstery work, billing and collections.</p>
        </div>
        <div className="dashboard-primary-actions">
          <button className="secondary-button dashboard-action" onClick={() => navigate("Customers")}><Users size={16} /> Customers</button>
          <button className="secondary-button dashboard-action" onClick={() => navigate("New Quotation")}><FileText size={16} /> New Quotation</button>
          <button className="primary-button dashboard-action" onClick={() => navigate("Billing")}><Receipt size={16} /> Create Bill</button>
        </div>
      </div>

      <section className="workshop-strip">
        <div className="workshop-strip-main">
          <div className="workshop-badge"><Sofa size={20} /></div>
          <div>
            <strong>Workshop pulse</strong>
            <span>Stay on top of jobs, materials and payments.</span>
          </div>
        </div>
        <div className="workshop-strip-items">
          <div><small>ACTIVE JOBS</small><strong>{safeJobs.filter(j => !["Completed", "Delivered"].includes(j.status)).length}</strong></div>
          <div><small>COLLECTION RATE</small><strong>{Math.round(collectionRate)}%</strong></div>
          <div><small>OUTSTANDING</small><strong>{money(outstanding)}</strong></div>
        </div>
      </section>

      <div className="stats dashboard-stats">
        <Stat icon={Wrench} label="Active jobs" value={safeJobs.length} note="workshop records" color="green" />
        <Stat icon={FileText} label="Invoices" value={invoiceCount} note="billing records" color="blue" />
        <Stat icon={CircleDollarSign} label="Outstanding" value={money(outstanding)} note="pending collection" color="orange" />
        <Stat icon={Banknote} label="Collected" value={money(totalPaid)} note="payments received" color="purple" />
      </div>

      <div className="dashboard-main-grid">
        <section className="card dashboard-card bills-card">
          <CardHeader eyebrow="WORKSHOP BILLING" title="Recent jobs & bills" subtitle="Your latest upholstery work at a glance." action="Open billing" onAction={() => navigate("Billing")} />
          <div className="dashboard-table">
            <div className="dashboard-table-head"><span>JOB / CUSTOMER</span><span>ITEM</span><span>STATUS</span><span>AMOUNT</span><span></span></div>
            {recentJobs.map((job, index) => (
              <button className="dashboard-table-row" key={job.id || index} onClick={() => navigate("Billing")} type="button">
                <span className="job-customer"><i>{String(job.customer || "C").slice(0,1).toUpperCase()}</i><b>{job.customer || "Customer"}</b></span>
                <span>{job.item || job.work || "Upholstery work"}</span>
                <Status status={job.status || "Pending"} />
                <strong>{money(job.amount || 0)}</strong>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!recentJobs.length && <EmptyState icon={Sofa} title="No jobs yet" text="Create a workshop job to see it here." />}
          </div>
          <div className="dashboard-card-footer">
            <button className="text-button" onClick={() => navigate("Active Jobs")}>View all jobs <ChevronRight size={14} /></button>
            <button className="text-button" onClick={() => navigate("Billing")}>Create a bill <Plus size={14} /></button>
          </div>
        </section>

        <section className="card dashboard-card actions-card">
          <CardHeader eyebrow="QUICK ACCESS" title="What do you want to do?" subtitle="Common workshop actions." />
          <div className="dashboard-action-list">
            <QuickAction icon={ReceiptText} title="Create Bill" subtitle="Bill a particular upholstery item" onClick={() => navigate("Billing")} />
            <QuickAction icon={Plus} title="New Job" subtitle="Add a customer upholstery job" onClick={() => setModal("job")} />
            <QuickAction icon={Users} title="Add Customer" subtitle="Save a new customer profile" onClick={() => setModal("customer")} />
            <QuickAction icon={Package} title="Add Material" subtitle="Update workshop inventory" onClick={() => setModal("material")} />
          </div>
          <div className="action-link-row">
            <button onClick={() => navigate("Reports")}><BarChart3 size={15} /> Reports <ArrowUpRight size={13} /></button>
            <button onClick={() => navigate("Accounts")}><Wallet size={15} /> Accounts <ArrowUpRight size={13} /></button>
          </div>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="card dashboard-card activity-card">
          <CardHeader eyebrow="RECENT ACTIVITY" title="Latest transactions" subtitle="Payments and expenses recorded in the workshop." action="View all" onAction={() => navigate("Transactions")} />
          <div className="activity-list">
            {safeTransactions.slice(0, 5).map((tx, index) => {
              const expense = String(tx.transaction_type || "").toLowerCase() === "expense";
              return <div className="activity-row" key={tx.id || index}>
                <div className={`activity-icon ${expense ? "expense" : "income"}`}>{expense ? <ArrowLeftRight size={15} /> : <ArrowUpRight size={15} />}</div>
                <div className="activity-copy"><strong>{tx.description || tx.transaction_type || "Transaction"}</strong><span>{tx.account || "Workshop account"}</span></div>
                <strong className={expense ? "expense" : "income"}>{expense ? "-" : "+"}{money(tx.amount || 0)}</strong>
              </div>;
            })}
            {!safeTransactions.length && <EmptyState icon={Receipt} title="No transactions yet" text="Recorded payments and expenses will appear here." />}
          </div>
        </section>

        <section className="card dashboard-card finance-card">
          <CardHeader eyebrow="FINANCE SNAPSHOT" title="Money at a glance" subtitle="Current workshop position." />
          <div className="finance-hero"><span>Total collected</span><strong>{money(totalPaid)}</strong><div className="mini-progress"><i style={{ width: `${collectionRate}%` }} /></div><small>{Math.round(collectionRate)}% of billed sales collected</small></div>
          <div className="finance-lines">
            <div><span>Invoices</span><strong>{invoiceCount}</strong></div>
            <div><span>Quotations</span><strong>{quotationCount}</strong></div>
            <div><span>Outstanding</span><strong className="orange-text">{money(outstanding)}</strong></div>
            <div><span>Expenses</span><strong>{money(totalExpenses)}</strong></div>
          </div>
          <button className="finance-view-button" onClick={() => navigate("Reports")}>View financial reports <ChevronRight size={15} /></button>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   COMPONENTS
============================================================ */

function Stat({
  icon: Icon,
  label,
  value,
  note,
  color,
}) {
  return (
    <div className={`stat ${color}`}>
      <div className="stat-icon">
        <Icon size={19} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

function CardHeader({
  eyebrow,
  title,
  subtitle,
  action,
  onAction,
}) {
  return (
    <div className="card-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      {action && (
        <button
          className="text-button"
          onClick={onAction}
        >
          {action}
          <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  );
}

function JobCard({ job }) {
  const Icon =
    job.item.toLowerCase().includes("recliner")
      ? Armchair
      : job.item.toLowerCase().includes("car")
      ? Car
      : Sofa;

  const balance = job.amount - job.paid;

  return (
    <div className="job-card">
      <div className="job-product-icon">
        <Icon size={21} />
      </div>

      <div className="job-main">
        <div className="job-top">
          <strong>{job.customer}</strong>
          <Status status={job.status} />
        </div>

        <p>
          {job.item} · {job.work}
        </p>

        <div className="progress">
          <span
            style={{
              width: `${job.progress}%`,
            }}
          />
        </div>

        <small>
          {job.progress}% complete
        </small>
      </div>

      <div className="job-money">
        <strong>{money(job.amount)}</strong>
        <span>{job.id}</span>

        {balance > 0 ? (
          <small>
            Balance {money(balance)}
          </small>
        ) : (
          <small className="paid">Fully paid</small>
        )}
      </div>

      <button className="dots">
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}

function Status({ status }) {
  return (
    <span
      className={`status ${status
        .toLowerCase()
        .replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}

function QuickAction({
  icon: Icon,
  title,
  subtitle,
  onClick,
}) {
  return (
    <button
      className="quick-action"
      onClick={onClick}
    >
      <div className="quick-icon">
        <Icon size={18} />
      </div>

      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      <ArrowUpRight size={15} />
    </button>
  );
}

function Schedule({
  time,
  title,
  customer,
  tag,
}) {
  return (
    <div className="schedule">
      <span className="schedule-time">
        {time}
      </span>

      <div className="schedule-dot" />

      <div>
        <strong>{title}</strong>
        <span>{customer}</span>
      </div>

      <label>{tag}</label>
    </div>
  );
}

function Payment({
  name,
  amount,
  time,
}) {
  return (
    <div className="payment">
      <div className="payment-avatar">
        {name
          .split(" ")
          .map((x) => x[0])
          .join("")
          .slice(0, 2)}
      </div>

      <div>
        <strong>{name}</strong>
        <span>{time}</span>
      </div>

      <b>{amount}</b>
    </div>
  );
}

/* ============================================================
   JOBS PAGE
============================================================ */

function JobsPage({
  title,
  jobs,
  setModal,
  onViewJob,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All status");

  const filtered = jobs.filter((job) => {
    const sectionMatch =
      title === "Active Jobs"
        ? ["Received", "Inspection", "In Progress"].includes(job.status)
        : title === "Completed Jobs"
        ? job.status === "Ready"
        : title === "Delivered"
        ? job.status === "Delivered"
        : true;

    const q = query.toLowerCase();
    const searchMatch =
      !q ||
      `${job.id} ${job.customer} ${job.phone} ${job.item} ${job.work}`
        .toLowerCase()
        .includes(q);

    const statusMatch =
      status === "All status" || job.status === status;

    return sectionMatch && searchMatch && statusMatch;
  });

  return (
    <div className="jobs-page-modern">
      <div className="jobs-page-header">
        <div>
          <div className="jobs-breadcrumb">
            Al Kanz <ChevronRight size={14} /> <strong>{title}</strong>
          </div>
          <div className="jobs-eyebrow">WORKSHOP</div>
          <h1>{title}</h1>
          <p>Manage upholstery and repair work.</p>
        </div>

        <button
          className="jobs-new-button"
          onClick={() => setModal("job")}
        >
          <Plus size={19} />
          New Repair Job
        </button>
      </div>

      <div className="jobs-toolbar-modern">
        <div className="jobs-search-modern">
          <Search size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repair jobs..."
          />
          {query && (
            <button onClick={() => setQuery("")}>×</button>
          )}
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="jobs-status-filter"
        >
          <option>All status</option>
          <option>Received</option>
          <option>Inspection</option>
          <option>In Progress</option>
          <option>Ready</option>
          <option>Delivered</option>
        </select>
      </div>

      <div className="jobs-modern-card">
        <div className="jobs-modern-head">
          <span>JOB</span>
          <span>CUSTOMER</span>
          <span>ITEM / WORK</span>
          <span>STATUS</span>
          <span>AMOUNT</span>
          <span>BALANCE</span>
          <span></span>
        </div>

        {filtered.map((job) => {
          const balance = Math.max(
            0,
            Number(job.amount || 0) - Number(job.paid || 0)
          );

          return (
            <div className="jobs-modern-row" key={job.id}>
              <div className="jobs-id-cell">
                <strong>{job.id}</strong>
                <small>{job.date}</small>
              </div>

              <div className="jobs-customer-cell">
                <strong>{job.customer}</strong>
                <small>{job.phone}</small>
              </div>

              <div className="jobs-work-cell">
                <strong>{job.item}</strong>
                <small>{job.work}</small>
              </div>

              <Status status={job.status} />

              <strong className="jobs-money">
                {money(job.amount)}
              </strong>

              <strong
                className={`jobs-balance ${balance === 0 ? "paid" : ""}`}
              >
                {money(balance)}
              </strong>

              <button
                className="jobs-view-button"
                onClick={() => onViewJob(job)}
                aria-label={`View ${job.id}`}
              >
                <Eye size={19} />
              </button>
            </div>
          );
        })}

        {!filtered.length && (
          <EmptyState
            icon={ClipboardList}
            title="No jobs found"
            text="There are no jobs matching your filters."
          />
        )}

        <div className="jobs-modern-footer">
          Showing {filtered.length} of {jobs.length} jobs
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   JOB DETAILS DRAWER
============================================================ */

function JobDetailsDrawer({
  job,
  close,
  updateStatus,
  recordPayment,
}) {
  const [payment, setPayment] = useState("");
  const [showPayment, setShowPayment] = useState(false);

  const balance = Math.max(
    0,
    Number(job.amount || 0) - Number(job.paid || 0)
  );

  const steps = [
    "Received",
    "Inspection",
    "In Progress",
    "Ready",
    "Delivered",
  ];

  const currentIndex = Math.max(
    0,
    steps.indexOf(job.status)
  );

  const submitPayment = () => {
    const amount = Number(payment);
    if (!amount || amount <= 0) {
      alert("Enter a valid payment amount.");
      return;
    }
    if (amount > balance) {
      alert("Payment cannot be greater than the balance.");
      return;
    }
    recordPayment(job.id, amount);
    setPayment("");
    setShowPayment(false);
  };

  return (
    <>
      <div className="job-drawer-overlay" onClick={close} />

      <aside className="job-drawer">
        <div className="job-drawer-header">
          <div>
            <span>REPAIR JOB</span>
            <h2>{job.id}</h2>
            <p>{job.date}</p>
          </div>

          <button className="job-drawer-close" onClick={close}>
            <X size={22} />
          </button>
        </div>

        <div className="job-drawer-body">
          <div className="job-detail-grid">
            <div className="job-detail-box">
              <div className="job-detail-label">
                <UserRound size={17} /> CUSTOMER
              </div>
              <strong>{job.customer}</strong>
              <p><Phone size={14} /> {job.phone}</p>
            </div>

            <div className="job-detail-box">
              <div className="job-detail-label">
                <Sofa size={17} /> ITEM
              </div>
              <strong>{job.item}</strong>
              <p>{job.work}</p>
            </div>
          </div>

          <div className="job-detail-grid">
            <div className="job-detail-box">
              <div className="job-detail-label">
                <Package size={17} /> MATERIAL
              </div>
              <strong>{job.material || "Not specified"}</strong>
              <p>{job.colour || "Colour not specified"}</p>
              <small>Quantity: {job.quantity || 1}</small>
            </div>

            <div className="job-detail-box">
              <div className="job-detail-label">
                <CalendarDays size={17} /> DELIVERY
              </div>
              <strong>
                {job.deliveryDate || "Not scheduled"}
              </strong>
              <p>Expected delivery</p>
            </div>
          </div>

          <section className="job-detail-section">
            <div className="job-section-title">
              <FileText size={18} /> BILLING BREAKDOWN
            </div>

            <div className="job-money-row">
              <span>Material Cost</span>
              <strong>{money(job.materialCost || 0)}</strong>
            </div>
            <div className="job-money-row">
              <span>Labour Charge</span>
              <strong>{money(job.labour || 0)}</strong>
            </div>
            <div className="job-money-row">
              <span>Other Charges</span>
              <strong>{money(job.otherCharges || 0)}</strong>
            </div>
            <div className="job-money-row discount">
              <span>Discount</span>
              <strong>-{money(job.discount || 0)}</strong>
            </div>

            <div className="job-total-row">
              <span>TOTAL</span>
              <strong>{money(job.amount || 0)}</strong>
            </div>
          </section>

          <section className="job-detail-section">
            <div className="job-section-title">
              <CircleDollarSign size={18} /> PAYMENT
            </div>

            <div className="job-money-row">
              <span>Paid</span>
              <strong className="job-paid">
                {money(job.paid || 0)}
              </strong>
            </div>

            <div className="job-balance-row">
              <span>BALANCE DUE</span>
              <strong>{money(balance)}</strong>
            </div>

            {!showPayment ? (
              <button
                className="job-payment-button"
                onClick={() => setShowPayment(true)}
                disabled={balance === 0}
              >
                <CreditCard size={17} />
                {balance === 0 ? "Fully Paid" : "Record Payment"}
              </button>
            ) : (
              <div className="job-payment-form">
                <label>Payment amount</label>
                <div className="job-payment-input">
                  <span>AED </span>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max={balance}
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                    placeholder="Enter amount"
                  />
                </div>
                <div className="job-payment-actions">
                  <button onClick={() => setShowPayment(false)}>
                    Cancel
                  </button>
                  <button onClick={submitPayment}>
                    Save Payment
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="job-detail-section">
            <div className="job-section-title">
              <ClipboardList size={18} /> JOB STATUS
            </div>

            <div className="job-status-timeline">
              {steps.map((step, index) => {
                const active = index <= currentIndex;
                return (
                  <div
                    className={`job-status-step ${active ? "active" : ""} ${
                      step === job.status ? "current" : ""
                    }`}
                    key={step}
                  >
                    <div className="job-status-dot">
                      {active && <CheckCircle2 size={13} />}
                    </div>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>

            <label className="job-status-label">
              Change status
              <select
                value={job.status}
                onChange={(e) =>
                  updateStatus(job.id, e.target.value)
                }
              >
                {steps.map((step) => (
                  <option key={step}>{step}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="job-detail-section">
            <div className="job-section-title">
              ACTIONS
            </div>

            <div className="job-action-grid">
              <button
                onClick={() =>
                  alert(
                    `Invoice for ${job.id}\nTotal: ${money(job.amount)}\nBalance: ${money(balance)}`
                  )
                }
              >
                <FileText size={17} />
                Create Invoice
              </button>

              <button
                onClick={() =>
                  alert(
                    `Job ${job.id} is currently ${job.status}.`
                  )
                }
              >
                <CheckCircle2 size={17} />
                Job Summary
              </button>
            </div>
          </section>

          <section className="job-detail-section">
            <div className="job-section-title">
              NOTES
            </div>
            <p className="job-notes">
              {job.notes || "No notes added for this job."}
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}

/* ============================================================
   CUSTOMERS
============================================================ */

function CustomersPage({ customers = [], jobs = [], payments = [], setModal, navigate, setEntityPreview, onEdit }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [query, setQuery] = useState("");
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const filtered = safeCustomers.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || [c.name, c.phone, c.email, c.location, c.address].some(v => String(v || "").toLowerCase().includes(q));
  });
  const profile = (customer) => {
    const customerJobs = safeJobs.filter(j => String(j.customerId || j.customer_id || j.customer || "").toLowerCase() === String(customer.id || customer.name).toLowerCase() || String(j.customer || "").toLowerCase() === String(customer.name || "").toLowerCase());
    const jobIds = new Set(customerJobs.map(j => String(j.id || j.jobId)));
    const customerPayments = safePayments.filter(p => String(p.customer_id || p.customerId || p.customer || "").toLowerCase() === String(customer.id || customer.name).toLowerCase() || jobIds.has(String(p.job_id || p.jobId)) || String(p.customer || "").toLowerCase() === String(customer.name || "").toLowerCase());
    const purchases = customerJobs.reduce((sum, j) => sum + Number(j.amount || 0), 0);
    const paid = customerPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) || customerJobs.reduce((sum, j) => sum + Number(j.paid || 0), 0);
    return { customerJobs, customerPayments, purchases, paid, balance: Math.max(0, purchases - paid) };
  };
  return <>
    <PageTitle eyebrow="WORKSHOP · CRM" title="Customers" subtitle="Complete customer profiles, purchase history, jobs, invoices and balances." button="Add Customer" onClick={() => setModal("customer")} />
    <div className="crm-toolbar">
      <div className="crm-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, phone, email or location..."/><span>{filtered.length} customers</span></div>
      <div className="crm-toolbar-stats"><span><strong>{safeCustomers.length}</strong> total</span><span><strong>{safeCustomers.filter(c=>Number(c.outstanding||0)>0).length}</strong> with balance</span></div>
    </div>
    <div className="customer-grid customer-grid-premium">
      {filtered.map((customer) => {
        const p = profile(customer);
        const initials = String(customer.name || "C").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
        return <div className="customer-card customer-card-premium" key={customer.id}>
          <div className="customer-top"><div className="customer-avatar customer-avatar-large">{initials}</div><div className="customer-tier">{p.customerJobs.length > 3 ? "LOYAL" : p.customerJobs.length ? "ACTIVE" : "NEW"}</div><button type="button" className="dots" onClick={()=>setSelectedCustomer(customer)}><MoreHorizontal size={17}/></button></div>
          <h3>{customer.name}</h3>
          <div className="customer-contact-line"><Phone size={14}/><span>{customer.phone || "No phone"}</span></div>
          <div className="customer-contact-line"><Mail size={14}/><span>{customer.email || "No email"}</span></div>
          <div className="customer-contact-line"><MapPin size={14}/><span>{customer.address || customer.location || "Dubai, UAE"}</span></div>
          <div className="customer-finance-grid"><div><small>TOTAL PURCHASES</small><strong>{money(p.purchases || customer.totalPurchases || 0)}</strong></div><div><small>PAID</small><strong className="income">{money(p.paid)}</strong></div><div><small>PENDING</small><strong className={p.balance>0?"orange-text":"income"}>{money(p.balance)}</strong></div></div>
          <div className="customer-card-actions"><button type="button" className="secondary-button" onClick={()=>setSelectedCustomer(customer)}><Eye size={14}/> Full profile</button><button type="button" className="primary-button" onClick={()=>navigate?.("Billing")}><Receipt size={14}/> Create bill</button></div>
        </div>;
      })}
      {!filtered.length && <EmptyState icon={Users} title="No customers found" text="Try another search or add a new customer."/>}
    </div>
    {selectedCustomer && (() => { const p=profile(selectedCustomer); return <div className="modal-backdrop crm-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setSelectedCustomer(null)}><div className="card crm-profile-modal">
      <button className="modal-close" onClick={()=>setSelectedCustomer(null)}><X size={17}/></button>
      <div className="crm-profile-head"><div className="customer-avatar customer-avatar-xl">{String(selectedCustomer.name||"C").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}</div><div><span className="eyebrow">CUSTOMER PROFILE</span><h2>{selectedCustomer.name}</h2><p>{selectedCustomer.location || "Dubai, UAE"} · Customer #{selectedCustomer.id}</p></div></div>
      <div className="crm-contact-grid"><div><small>PHONE</small><strong>{selectedCustomer.phone || "—"}</strong></div><div><small>WHATSAPP</small><strong>{selectedCustomer.whatsapp || selectedCustomer.phone || "—"}</strong></div><div><small>EMAIL</small><strong>{selectedCustomer.email || "—"}</strong></div><div><small>ADDRESS</small><strong>{selectedCustomer.address || selectedCustomer.location || "—"}</strong></div></div>
      <div className="crm-kpis"><div><small>PREVIOUS PURCHASES</small><strong>{money(p.purchases)}</strong></div><div><small>JOBS</small><strong>{p.customerJobs.length}</strong></div><div><small>PAYMENTS</small><strong>{money(p.paid)}</strong></div><div className={p.balance>0?"is-warning":""}><small>PENDING BALANCE</small><strong>{money(p.balance)}</strong></div></div>
      <div className="crm-history-grid"><div><div className="section-mini-head"><strong>Previous jobs & purchases</strong><span>{p.customerJobs.length} records</span></div><div className="crm-history-list">{p.customerJobs.slice(0,8).map(j=><div key={j.id}><span><b>{j.id}</b><small>{j.item || j.work || "Upholstery work"} · {j.date || "—"}</small></span><strong>{money(j.amount)}</strong></div>)}{!p.customerJobs.length&&<EmptyState icon={ClipboardList} title="No previous jobs" text="New work for this customer will appear here."/>}</div></div><div><div className="section-mini-head"><strong>Payment history</strong><span>{p.customerPayments.length} records</span></div><div className="crm-history-list">{p.customerPayments.slice(0,8).map((pay,i)=><div key={pay.id||i}><span><b>{pay.payment_method||"Cash"}</b><small>{pay.paid_at ? new Date(pay.paid_at).toLocaleDateString("en-AE") : "—"}</small></span><strong className="income">+{money(pay.amount)}</strong></div>)}{!p.customerPayments.length&&<EmptyState icon={CreditCard} title="No payments yet" text="Payments recorded against this customer will appear here."/>}</div></div></div>
      <div className="document-actions"><button className="secondary-button" onClick={()=>{setSelectedCustomer(null);onEdit?.(selectedCustomer);}}><Edit3 size={15}/> Edit customer</button><button className="secondary-button" onClick={()=>navigate?.("Billing")}><Receipt size={15}/> Billing</button><button className="primary-button" onClick={()=>setSelectedCustomer(null)}>Done</button></div>
    </div></div>; })()}
  </>;
}

/* ============================================================
   MATERIALS
============================================================ */

function MaterialsPage({
  materials,
  setMaterials,
  setModal,
}) {
  return (
    <>
      <PageTitle
        eyebrow="WORKSHOP"
        title="Materials"
        subtitle="Track leather, fabric, foam and workshop materials."
        button="Add Material"
        onClick={() => setModal("material")}
      />

      <div className="material-grid">
        {materials.map((material) => (
          <div className="material-card" key={material.id}>
            <div className="material-icon">
              <Layers3 size={20} />
            </div>

            <div className="material-info">
              <span>{material.category}</span>
              <h3>{material.name}</h3>
              <p>
                AED {material.price} / {material.unit}
              </p>
            </div>

            <div
              className={`stock ${
                material.stock < 20
                  ? "low-stock"
                  : ""
              }`}
            >
              <strong>{material.stock}</strong>
              <span>{material.unit}s</span>
            </div>

            <button
              className="delete-small"
              onClick={() =>
                setMaterials((prev) =>
                  prev.filter(
                    (x) => x.id !== material.id
                  )
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================================================
   SUPPLIERS
============================================================ */

function SuppliersPage({ suppliers = [], jobs = [], expenses = [], transactions = [], setSuppliers, setModal, setEntityPreview, onEdit }) {
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [query, setQuery] = useState("");
  const safeSuppliers = Array.isArray(suppliers) ? suppliers : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const detail = (supplier) => {
    const name = String(supplier.name || "").toLowerCase();
    const material = String(supplier.material || "").toLowerCase();
    const purchaseRows = safeExpenses.filter(x => [x.supplier,x.description,x.category].some(v => String(v||"").toLowerCase().includes(name) || (material && String(v||"").toLowerCase().includes(material))));
    const paymentRows = safeTransactions.filter(x => String(x.description||"").toLowerCase().includes(name) && /payment|supplier|purchase|paid/.test(String(x.description||"").toLowerCase()));
    const purchases = purchaseRows.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const payments = paymentRows.reduce((sum,x)=>sum+Number(x.amount||0),0);
    return {purchaseRows,paymentRows,purchases,payments,balance:Math.max(0,Number(supplier.balance||0))};
  };
  const filtered=safeSuppliers.filter(s=>{const q=query.toLowerCase().trim();return !q||[s.name,s.phone,s.material,s.email,s.location,s.address].some(v=>String(v||"").toLowerCase().includes(q));});
  return <>
    <PageTitle eyebrow="PROCUREMENT · CRM" title="Suppliers" subtitle="Supplier contacts, materials supplied, purchases, payments and outstanding balances." button="Add Supplier" onClick={()=>setModal("supplier")}/>
    <div className="crm-toolbar"><div className="crm-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search supplier, material, phone or email..."/><span>{filtered.length} suppliers</span></div><div className="crm-toolbar-stats"><span><strong>{safeSuppliers.length}</strong> suppliers</span><span><strong>{money(safeSuppliers.reduce((a,b)=>a+Number(b.balance||0),0))}</strong> payable</span></div></div>
    <div className="supplier-premium-grid">{filtered.map(s=>{const d=detail(s);return <div className="supplier-premium-card" key={s.id}><div className="supplier-card-head"><div className="supplier-logo"><Truck size={20}/></div><span className="supplier-status">{d.balance>0?"PAYABLE":"CLEAR"}</span><button className="dots" onClick={()=>setSelectedSupplier(s)}><MoreHorizontal size={17}/></button></div><h3>{s.name}</h3><p>{s.material || "Workshop materials"}</p><div className="supplier-contact-stack"><span><Phone size={13}/>{s.phone || "No phone"}</span><span><Mail size={13}/>{s.email || "No email"}</span><span><MapPin size={13}/>{s.address || s.location || "Dubai, UAE"}</span></div><div className="supplier-finance"><div><small>PURCHASES</small><strong>{money(d.purchases)}</strong></div><div><small>PAYMENTS</small><strong className="income">{money(d.payments)}</strong></div><div><small>BALANCE</small><strong className={d.balance>0?"orange-text":"income"}>{money(d.balance)}</strong></div></div><button className="secondary-button full-width" onClick={()=>setSelectedSupplier(s)}><Eye size={14}/> View supplier history</button></div>})}{!filtered.length&&<EmptyState icon={Truck} title="No suppliers found" text="Try another search or add a supplier."/>}</div>
    {selectedSupplier&&(()=>{const d=detail(selectedSupplier);return <div className="modal-backdrop crm-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setSelectedSupplier(null)}><div className="card crm-profile-modal supplier-profile-modal"><button className="modal-close" onClick={()=>setSelectedSupplier(null)}><X size={17}/></button><div className="crm-profile-head"><div className="supplier-logo supplier-logo-xl"><Truck size={24}/></div><div><span className="eyebrow">SUPPLIER PROFILE</span><h2>{selectedSupplier.name}</h2><p>{selectedSupplier.material || "Workshop supplier"} · Supplier #{selectedSupplier.id}</p></div></div><div className="crm-contact-grid"><div><small>PHONE</small><strong>{selectedSupplier.phone||"—"}</strong></div><div><small>EMAIL</small><strong>{selectedSupplier.email||"—"}</strong></div><div><small>ADDRESS</small><strong>{selectedSupplier.address||selectedSupplier.location||"—"}</strong></div><div><small>MATERIALS SUPPLIED</small><strong>{selectedSupplier.material||"—"}</strong></div></div><div className="crm-kpis"><div><small>TOTAL PURCHASES</small><strong>{money(d.purchases)}</strong></div><div><small>PAYMENTS MADE</small><strong>{money(d.payments)}</strong></div><div><small>OPEN BALANCE</small><strong className={d.balance>0?"orange-text":"income"}>{money(d.balance)}</strong></div><div><small>STATUS</small><strong>{d.balance>0?"Payment due":"Clear"}</strong></div></div><div className="crm-history-grid"><div><div className="section-mini-head"><strong>Purchase history</strong><span>{d.purchaseRows.length} records</span></div><div className="crm-history-list">{d.purchaseRows.slice(0,8).map((x,i)=><div key={x.id||i}><span><b>{x.category||"Material purchase"}</b><small>{x.description||x.supplier||"Workshop purchase"}</small></span><strong>{money(x.amount)}</strong></div>)}{!d.purchaseRows.length&&<EmptyState icon={Package} title="No purchase records" text="Supplier purchases will appear here when recorded."/>}</div></div><div><div className="section-mini-head"><strong>Payment history</strong><span>{d.paymentRows.length} records</span></div><div className="crm-history-list">{d.paymentRows.slice(0,8).map((x,i)=><div key={x.id||i}><span><b>{x.account||"Payment"}</b><small>{x.transaction_date?new Date(x.transaction_date).toLocaleDateString("en-AE"):"—"}</small></span><strong className="income">-{money(x.amount)}</strong></div>)}{!d.paymentRows.length&&<EmptyState icon={CreditCard} title="No supplier payments" text="Supplier payments will appear here when recorded."/>}</div></div></div><div className="document-actions"><button className="secondary-button" onClick={()=>{setSelectedSupplier(null);onEdit?.(selectedSupplier);}}><Edit3 size={15}/> Edit supplier</button><button className="primary-button" onClick={()=>setSelectedSupplier(null)}>Close</button></div></div></div>})()}
  </>;
}

/* ============================================================
   STAFF
============================================================ */

function StaffPage({ staff = [], setStaff, setModal, setEntityPreview, onEdit }) {
  const safeStaff = Array.isArray(staff) ? staff : [];
  const active = safeStaff.filter((p) => p.status === "Active").length;
  const payroll = safeStaff.filter((p) => p.salaryPeriod === "Monthly").reduce((sum, p) => sum + Number(p.salary || 0), 0);
  const avgPerformance = safeStaff.length ? Math.round(safeStaff.reduce((sum,p)=>sum+Number(p.performance||0),0)/safeStaff.length) : 0;
  const avgAttendance = safeStaff.length ? Math.round(safeStaff.reduce((sum,p)=>sum+Number(p.attendance||0),0)/safeStaff.length) : 0;
  return (
    <>
      <PageTitle eyebrow="TEAM · PAYROLL & CREDENTIALS" title="Staff & Credentials" subtitle="Manage employees, login credentials, salaries, attendance and performance." button="Add Staff" onClick={()=>setModal("staff")} />
      <div className="staff-summary-grid">
        <ReportBox icon={Users} title="Total staff" value={safeStaff.length} note={`${active} active members`} />
        <ReportBox icon={CircleDollarSign} title="Monthly payroll" value={money(payroll)} note="Monthly salary records" />
        <ReportBox icon={TrendingUp} title="Performance" value={`${avgPerformance}%`} note="Average performance" />
        <ReportBox icon={CalendarDays} title="Attendance" value={`${avgAttendance}%`} note="Average attendance" />
      </div>
      <div className="staff-grid staff-grid-rich">
        {safeStaff.map((person)=>{
          const initials=String(person.name||"S").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
          return <div className="staff-card staff-card-rich" key={person.id}>
            <div className="staff-card-top">
              <div className="staff-avatar">{initials}</div>
              <div className="staff-card-badges">
                {person.isSuperAdmin && <span className="badge-superadmin"><ShieldCheck size={11} /> Admin</span>}
                <span className={person.status === "Active" ? "staff-active" : "staff-leave"}>{person.status}</span>
              </div>
            </div>
            <h3>{person.name}</h3>
            <p>{person.role}</p>

            {person.username && (
              <div className="staff-login-info">
                <UserCog size={13} /> <span>ID: <strong>@{person.username}</strong></span>
              </div>
            )}

            <div className="staff-contact-lines">
              <span><Phone size={13}/>{person.phone||"No phone"}</span>
              <span><Mail size={13}/>{person.email||"No email"}</span>
            </div>
            <div className="staff-salary-box">
              <div><small>SALARY</small><strong>{money(person.salary)}</strong></div>
              <span>{person.salaryPeriod}</span>
            </div>
            <div className="staff-metrics">
              <div><small>ATTENDANCE</small><strong>{Number(person.attendance||0)}%</strong></div>
              <div><small>PERFORMANCE</small><strong>{Number(person.performance||0)}%</strong></div>
            </div>
            <div className="customer-card-actions">
              <button type="button" className="secondary-button" onClick={()=>setEntityPreview?.({type:"Staff",...person})}><Eye size={15}/> Profile</button>
              <button type="button" className="primary-button" onClick={()=>onEdit?.(person)}><Edit3 size={15}/> Credentials</button>
            </div>
          </div>;
        })}
        {!safeStaff.length && <EmptyState icon={UserRound} title="No staff members" text="Add your first workshop employee." />}
      </div>
    </>
  );
}

/* ============================================================
   BILLING
============================================================ */

function BillingPage({
  page,
  jobs = [],
  payments = [],
  transactions = [],
  outstanding,
  totalPaid,
  recordPayment,
  customers = [],
  materials = [],
  quotations = [],
  setJobs,
  setPayments,
  setTransactions,
}) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeMaterials = Array.isArray(materials) ? materials : [];
  const safeQuotations = Array.isArray(quotations) ? quotations : [];

  const invoices = safeJobs.map((job) => ({
    ...job,
    id: job.invoice_id || `INV-${String(job.id).replace("AK-", "")}`,
    customer: job.customer || "Customer",
    items: Array.isArray(job.items) && job.items.length
      ? job.items
      : [{
          item: job.item || "Upholstery service",
          description: job.description || job.work || "",
          quantity: Number(job.quantity || 1),
          unitPrice: Number(job.unitPrice || job.amount || 0),
          amount: Number(job.amount || 0),
        }],
    amount: Number(job.total || job.amount || 0),
    paid: Number(job.paid || 0),
    balance: Math.max(0, Number(job.total || job.amount || 0) - Number(job.paid || 0)),
    phone: job.phone || "",
    whatsapp: job.whatsapp || job.phone || "",
    email: job.email || "",
    address: job.address || "",
    paymentMethod: job.paymentMethod || job.payment_method || "",
    quotationId: job.quotationId || job.quotation_id || "",
    status: Number(job.total || job.amount || 0) <= Number(job.paid || 0)
      ? "Paid"
      : Number(job.paid || 0) > 0 ? "Part Paid" : "Unpaid",
  }));

  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBillBuilder, setShowBillBuilder] = useState(false);
  const [postPrintBill, setPostPrintBill] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [billForm, setBillForm] = useState({
    customerId: "",
    customer: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    quotationId: "",
    discount: "0",
    vat: "5",
    paid: "0",
    paymentMethod: "Cash",
  });
  const [billItems, setBillItems] = useState([
    { id: Date.now(), materialId: "", item: "", description: "", quantity: "1", unitPrice: "" },
  ]);

  const resetBillForm = () => {
    setBillForm({
      customerId: "",
      customer: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      quotationId: "",
      discount: "0",
      vat: "5",
      paid: "0",
      paymentMethod: "Cash",
    });
    setBillItems([{ id: Date.now(), materialId: "", item: "", description: "", quantity: "1", unitPrice: "" }]);
    setCustomerSearch("");
  };

  const openBillBuilder = () => {
    resetBillForm();
    setShowBillBuilder(true);
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return safeCustomers
      .filter((customer) => [customer.name, customer.phone, customer.whatsapp, customer.email, customer.address, customer.location]
        .some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [safeCustomers, customerSearch]);

  const selectCustomer = (customer) => {
    setBillForm((form) => ({
      ...form,
      customerId: String(customer.id),
      customer: customer.name || customer.company || "",
      phone: customer.phone || "",
      whatsapp: customer.whatsapp || customer.phone || "",
      email: customer.email || "",
      address: customer.address || customer.location || "",
    }));
    setCustomerSearch(customer.name || "");
  };

  const addItem = () => {
    setBillItems((items) => [
      ...items,
      { id: Date.now() + Math.random(), materialId: "", item: "", description: "", quantity: "1", unitPrice: "" },
    ]);
  };

  const updateItem = (index, key, value) => {
    setBillItems((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    )));
  };

  const removeItem = (index) => {
    setBillItems((items) => items.length <= 1 ? items : items.filter((_, itemIndex) => itemIndex !== index));
  };

  const selectMaterial = (index, materialId) => {
    const material = safeMaterials.find((item) => String(item.id) === String(materialId));
    if (!material) {
      updateItem(index, "materialId", "");
      return;
    }
    setBillItems((items) => items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      materialId: String(material.id),
      item: material.name || "",
      description: `${material.category || "Material"} · ${material.unit || "unit"}`,
      unitPrice: String(material.price || 0),
    } : item));
  };

  const applyQuotation = (quotationId) => {
    const quote = safeQuotations.find((item) => String(item.id) === String(quotationId));
    setBillForm((form) => ({ ...form, quotationId }));
    if (!quote) return;
    setBillItems([{
      id: Date.now(),
      materialId: "",
      item: quote.item || "",
      description: quote.description || "",
      quantity: String(quote.quantity || 1),
      unitPrice: String(quote.unitPrice || 0),
    }]);
    setBillForm((form) => ({
      ...form,
      quotationId,
      customer: form.customer || quote.customer || "",
      phone: form.phone || quote.phone || "",
    }));
  };

  const itemTotals = billItems.map((item) => Math.max(0, Number(item.quantity || 0) * Number(item.unitPrice || 0)));
  const subtotal = itemTotals.reduce((sum, value) => sum + value, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Number(billForm.discount || 0)));
  const taxable = Math.max(0, subtotal - discountAmount);
  const vatAmount = taxable * (Number(billForm.vat || 0) / 100);
  const billTotal = taxable + vatAmount;
  const paidNow = Math.min(billTotal, Math.max(0, Number(billForm.paid || 0)));
  const billBalance = Math.max(0, billTotal - paidNow);

  const quotationStats = {
    total: safeQuotations.length,
    approved: safeQuotations.filter((quote) => ["Approved", "Accepted", "Converted"].includes(quote.status)).length,
    value: safeQuotations.reduce((sum, quote) => sum + Number(quote.amount || 0), 0),
  };

  const collectionBase = safeJobs.reduce((sum, job) => sum + Number(job.amount || job.total || 0), 0);
  const collectionRate = collectionBase > 0 ? Math.min(100, (Number(totalPaid || 0) / collectionBase) * 100) : 0;

  const buildBill = () => {
    const id = `INV-${String(Date.now()).slice(-8)}`;
    const items = billItems
      .filter((item) => item.item.trim() || Number(item.unitPrice || 0) > 0)
      .map((item) => ({
        item: item.item.trim() || "Custom service",
        description: item.description.trim(),
        materialId: item.materialId || "",
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
        amount: Number(item.quantity || 0) * Number(item.unitPrice || 0),
      }));

    return {
      id,
      invoice_id: id,
      customer: billForm.customer.trim(),
      customerId: billForm.customerId,
      phone: billForm.phone.trim(),
      whatsapp: billForm.whatsapp.trim(),
      email: billForm.email.trim(),
      address: billForm.address.trim(),
      quotationId: billForm.quotationId,
      item: items[0]?.item || "Upholstery service",
      description: items[0]?.description || "Professional upholstery work",
      items,
      quantity: items.length === 1 ? items[0].quantity : items.reduce((sum, item) => sum + item.quantity, 0),
      unitPrice: items.length === 1 ? items[0].unitPrice : 0,
      subtotal,
      discount: discountAmount,
      vatRate: Number(billForm.vat || 0),
      vat: vatAmount,
      amount: billTotal,
      total: billTotal,
      paid: paidNow,
      balance: billBalance,
      paymentMethod: billForm.paymentMethod,
      status: paidNow >= billTotal ? "Paid" : paidNow > 0 ? "Part Paid" : "Unpaid",
      date: new Date().toISOString(),
      work: "Upholstery service",
      material: items.map((item) => item.item).join(", "),
      progress: 100,
      invoice_type: "invoice",
    };
  };

  const createBill = async (shouldPrint = false) => {
    if (saving) return;
    if (!billForm.customer.trim()) return alert("Please search and select a customer, or enter a customer name.");
    if (!billItems.some((item) => item.item.trim() && Number(item.unitPrice || 0) > 0)) return alert("Add at least one item with a unit price greater than 0.");

    setSaving(true);
    const bill = buildBill();

    try {
      let customerId = bill.customerId || null;

      if (hasSupabase) {
        if (!customerId && bill.phone) {
          const existing = await supabase.from("customers").select("id").eq("phone", bill.phone).limit(1).maybeSingle();
          customerId = existing.data?.id || null;
        }

        const customerData = {
          name: bill.customer,
          phone: bill.phone,
          whatsapp: bill.whatsapp,
          email: bill.email,
          address: bill.address,
          location: "Dubai",
        };

        if (customerId) {
          const updated = await supabase.from("customers").update(customerData).eq("id", customerId);
          if (updated.error) throw updated.error;
        } else {
          const created = await supabase.from("customers").insert({ ...customerData, jobs_count: 0, outstanding: 0 }).select("id").single();
          if (created.error) throw created.error;
          customerId = created.data.id;
        }

        const jobRow = {
          job_number: bill.id,
          invoice_id: bill.invoice_id,
          customer_id: customerId,
          customer_name: bill.customer,
          phone: bill.phone,
          whatsapp: bill.whatsapp,
          email: bill.email,
          address: bill.address,
          item: bill.item,
          description: bill.description,
          work: bill.work,
          material: bill.material,
          items: bill.items,
          quantity: bill.quantity,
          unit_price: bill.unitPrice,
          amount: bill.total,
          total: bill.total,
          subtotal: bill.subtotal,
          discount: bill.discount,
          vat_rate: bill.vatRate,
          vat: bill.vat,
          paid: bill.paid,
          status: bill.status,
          progress: 100,
          notes: "Created from Billing",
          payment_method: bill.paymentMethod,
          quotation_id: bill.quotationId,
          invoice_type: "invoice",
        };

        const saved = await supabase.from("jobs").insert(jobRow).select("*").single();
        if (saved.error) throw saved.error;

        if (paidNow > 0) {
          const paymentRow = await supabase.from("payments").insert({
            job_id: saved.data.id,
            customer_id: customerId,
            customer: bill.customer,
            amount: paidNow,
            payment_method: bill.paymentMethod,
            paid_at: bill.date,
            notes: `Invoice ${bill.id}`,
          }).select("*").single();
          if (paymentRow.error) throw paymentRow.error;

          const transaction = await supabase.from("transactions").insert({
            transaction_type: "Income",
            description: `Invoice · ${bill.customer} · ${bill.id}`,
            amount: paidNow,
            account: bill.paymentMethod,
            job_id: saved.data.id,
            customer_id: customerId,
            payment_id: paymentRow.data.id,
            transaction_date: bill.date,
          });
          if (transaction.error) throw transaction.error;
        }

        await supabase.from("audit_logs").insert({
          action: "Created invoice",
          entity_type: "invoice",
          entity_id: saved.data.id,
          details: { invoice_id: bill.id, total: bill.total },
        });
      }

      setJobs?.((items) => [bill, ...(Array.isArray(items) ? items : [])]);
      if (paidNow > 0) {
        setPayments?.((items) => [{ id: `PAY-${Date.now()}`, bill_id: bill.id, job_id: bill.id, customer: bill.customer, amount: paidNow, payment_method: bill.paymentMethod, paid_at: bill.date }, ...(Array.isArray(items) ? items : [])]);
        setTransactions?.((items) => [{ id: `TX-${Date.now()}`, transaction_type: "Income", description: `Invoice · ${bill.customer} · ${bill.id}`, amount: paidNow, account: bill.paymentMethod, transaction_date: bill.date }, ...(Array.isArray(items) ? items : [])]);
      }

      setShowBillBuilder(false);
      setSelected(bill);
      setPostPrintBill(bill);
      resetBillForm();

      if (shouldPrint) {
        window.setTimeout(() => {
          document.body.classList.add("printing-invoice");
          window.print();
          window.setTimeout(() => document.body.classList.remove("printing-invoice"), 500);
        }, 250);
      }
    } catch (error) {
      console.error("Invoice creation failed", error);
      alert(`Bill was not saved: ${error?.message || "database error"}`);
    } finally {
      setSaving(false);
    }
  };

  const billMessage = (bill) => [
    "AL KANZ UPHOLSTERY",
    `Invoice: ${bill.id}`,
    `Customer: ${bill.customer}`,
    ...(bill.items || []).map((item, index) => `${index + 1}. ${item.item} × ${item.quantity} = ${money(item.amount)}`),
    `Total: ${money(bill.total)}`,
    `Paid: ${money(bill.paid)}`,
    `Balance: ${money(bill.balance)}`,
    "Thank you for choosing Al Kanz Upholstery.",
  ].join("\n");

  const shareBill = async (bill, channel) => {
    const message = billMessage(bill);
    if (channel === "phone") {
      if (!bill.phone) return alert("No phone number saved.");
      window.location.href = `tel:${bill.phone}`;
      return;
    }
    if (channel === "email") {
      if (!bill.email) return alert("No email saved.");
      window.location.href = `mailto:${bill.email}?subject=${encodeURIComponent(`Al Kanz Invoice ${bill.id}`)}&body=${encodeURIComponent(message)}`;
      return;
    }
    if (channel === "whatsapp") {
      const phone = String(bill.whatsapp || bill.phone || "").replace(/\D/g, "");
      if (!phone) return alert("No WhatsApp number saved.");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (channel === "copy") {
      await navigator.clipboard?.writeText(message);
      alert("Invoice summary copied.");
      return;
    }
    if (channel === "share") {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      doc.setFontSize(18);
      doc.text("AL KANZ UPHOLSTERY", 20, 22);
      doc.setFontSize(10);
      doc.text(`TAX INVOICE · ${bill.id}`, 20, 30);
      doc.text(`Customer: ${bill.customer}`, 20, 40);
      let y = 55;
      (bill.items || []).forEach((item) => { doc.text(`${item.item} | ${item.quantity} × ${money(item.unitPrice)} = ${money(item.amount)}`, 20, y); y += 7; });
      y += 8;
      doc.text(`Subtotal: ${money(bill.subtotal)}`, 130, y); y += 7;
      doc.text(`VAT: ${money(bill.vat)}`, 130, y); y += 7;
      doc.text(`TOTAL: ${money(bill.total)}`, 130, y); y += 7;
      doc.text(`Balance: ${money(bill.balance)}`, 130, y);
      const blob = doc.output("blob");
      const file = new File([blob], `${bill.id}.pdf`, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Al Kanz Invoice ${bill.id}`, text: `${bill.customer} · ${money(bill.total)}`, files: [file] });
      } else {
        doc.save(`${bill.id}.pdf`);
        alert("This browser cannot share a PDF file directly. The PDF was saved instead.");
      }
    }
  };

  const InvoicePaper = ({ bill }) => (
    <div className="invoice-paper-screen">
      <div className="bill-template-header">
        <div className="bill-brand-lockup">
          <div className="bill-brand-mark">AK</div>
          <div><strong>AL KANZ</strong><span>UPHOLSTERY</span><small>Premium upholstery &amp; restoration</small></div>
        </div>
        <div className="bill-title-block"><span>TAX INVOICE</span><strong>{bill.id}</strong><small>{bill.date ? new Date(bill.date).toLocaleDateString("en-AE") : "—"}</small></div>
      </div>
      <div className="bill-accent-line" />
      <div className="bill-company-strip"><span>Dubai, United Arab Emirates</span><span>Upholstery · Repair · Custom Work</span></div>
      <div className="bill-parties">
        <div className="bill-party"><small>BILL TO</small><strong>{bill.customer}</strong><span>{bill.phone || "Phone not provided"}</span><span>{bill.email || "Email not provided"}</span><span>{bill.address || "Dubai, UAE"}</span></div>
        <div className="bill-party bill-party-right"><small>PAYMENT STATUS</small><strong>{bill.status}</strong><span>Payment method: {bill.paymentMethod || "—"}</span><span>Quotation: {bill.quotationId || "Not linked"}</span></div>
      </div>
      <div className="bill-items-table">
        <div className="bill-items-head"><span>DESCRIPTION</span><span>QTY</span><span>UNIT PRICE</span><span>AMOUNT</span></div>
        {(bill.items || []).map((item, index) => (
          <div className="bill-items-row" key={`${bill.id}-${index}`}>
            <div><strong>{item.item}</strong><span>{item.description || "Professional upholstery work"}</span></div>
            <span>{item.quantity}</span><span>{money(item.unitPrice)}</span><strong>{money(item.amount)}</strong>
          </div>
        ))}
      </div>
      <div className="bill-bottom-grid">
        <div className="bill-thanks"><span>THANK YOU</span><strong>Thank you for choosing Al Kanz Upholstery.</strong><p>Please keep this invoice for your records. We appreciate your business.</p></div>
        <div className="bill-total-box"><div><span>SUBTOTAL</span><strong>{money(bill.subtotal)}</strong></div><div><span>DISCOUNT</span><strong>- {money(bill.discount)}</strong></div><div><span>VAT</span><strong>{money(bill.vat)}</strong></div><div className="bill-grand-total"><span>TOTAL</span><strong>{money(bill.total)}</strong></div><div><span>PAID</span><strong>{money(bill.paid)}</strong></div><div className="bill-balance"><span>BALANCE DUE</span><strong>{money(bill.balance)}</strong></div></div>
      </div>
      <div className="bill-template-footer"><span>AL KANZ UPHOLSTERY</span><span>Dubai, UAE</span><span>Thank you for your trust.</span></div>
    </div>
  );

  return (
    <>
      <PageTitle eyebrow="BILLING · UAE" title={page === "Billing" ? "Billing" : page} subtitle="Create, save, print and share professional invoices." />

      {page === "Billing" && (
        <>
          <div className="billing-action-strip">
            <div><span>INVOICE CENTER</span><strong>Fast multi-item billing</strong><small>Search customers and select saved materials. Prices fill automatically.</small></div>
            <button type="button" className="primary-button" onClick={openBillBuilder}><Plus size={15} /> New Bill</button>
          </div>
          <div className="quotation-performance-bar">
            <div><small>QUOTATION PERFORMANCE</small><strong>{quotationStats.approved}/{quotationStats.total} approved</strong></div>
            <div><span>Quoted value</span><strong>{money(quotationStats.value)}</strong></div>
            <div><span>Approval rate</span><strong>{quotationStats.total ? Math.round(quotationStats.approved / quotationStats.total * 100) : 0}%</strong></div>
          </div>
          <div className="billing-machine">
            <div className="billing-machine-screen">
              <div className="machine-topline"><span>AL KANZ BILLING TERMINAL</span><b><i /> ONLINE</b></div>
              <div className="machine-main">
                <div className="bill-create-panel"><small>COLLECTED</small><strong>{money(totalPaid)}</strong><span>{invoices.length} invoices · {money(outstanding)} outstanding</span><button type="button" className="create-bill-button" onClick={openBillBuilder}><ReceiptText size={15} /> Create &amp; Print Bill</button></div>
                <div className="machine-ring" style={{ "--billing-progress": `${collectionRate}%` }}><div><b>{Math.round(collectionRate)}%</b><span>collected</span></div></div>
              </div>
            </div>
          </div>
        </>
      )}

      {page !== "Billing" && (
        <div className="table-card">
          <div className="table-head"><span>INVOICE</span><span>CUSTOMER</span><span>ITEMS</span><span>AMOUNT</span><span>PAID</span><span>BALANCE</span><span>STATUS</span><span /></div>
          {page === "Payments"
            ? safePayments.map((paymentRow, index) => <div className="table-row" key={paymentRow.id || index}><span>{paymentRow.paid_at ? new Date(paymentRow.paid_at).toLocaleDateString("en-AE") : "—"}</span><strong>{paymentRow.customer || "Customer"}</strong><span>{paymentRow.payment_method || "Cash"}</span><strong className="income">+{money(paymentRow.amount)}</strong><span>{paymentRow.reference || "—"}</span></div>)
            : invoices.map((invoice) => <div className="table-row" key={invoice.id}><strong>{invoice.id}</strong><strong>{invoice.customer}</strong><span>{invoice.items.length} item{invoice.items.length === 1 ? "" : "s"}</span><strong>{money(invoice.amount)}</strong><strong>{money(invoice.paid)}</strong><strong>{money(invoice.balance)}</strong><Status status={invoice.status} /><button type="button" className="row-action" onClick={() => setSelected(invoice)}><Eye size={16} /></button></div>)}
        </div>
      )}

      {showBillBuilder && (
        <div className="modal-backdrop bill-builder-backdrop">
          <div className="bill-builder-modal bill-builder-modern">
            <div className="bill-builder-head">
              <div><span className="eyebrow">AL KANZ · NEW INVOICE</span><h2>Create &amp; Print Bill</h2><p>Search the customer, choose saved materials, add unlimited items, link a quotation, then save.</p></div>
              <button type="button" className="job-drawer-close" onClick={() => setShowBillBuilder(false)}><X size={19} /></button>
            </div>

            <div className="bill-builder-grid">
              <div className="bill-form-pane">
                <div className="bill-section-title"><span>01</span><div><strong>Customer</strong><small>Search by name, phone, WhatsApp or email.</small></div></div>
                <label className="field"><span>Search saved customer</span><input autoFocus value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Start typing a customer name..." /></label>
                {filteredCustomers.length > 0 && <div className="customer-search-results">{filteredCustomers.map((customer) => <button type="button" key={customer.id} className="customer-search-option" onClick={() => selectCustomer(customer)}><span className="customer-search-avatar">{String(customer.name || "C").split(" ").map((part) => part[0]).join("").slice(0,2).toUpperCase()}</span><span><strong>{customer.name || customer.company}</strong><small>{customer.phone || "No phone"} · {customer.email || "No email"}</small></span><ChevronRight size={15} /></button>)}</div>}
                <div className="bill-fields two"><label className="field"><span>Customer *</span><input value={billForm.customer} onChange={(event) => setBillForm((form) => ({ ...form, customer:event.target.value }))} /></label><label className="field"><span>Phone</span><input value={billForm.phone} onChange={(event) => setBillForm((form) => ({ ...form, phone:event.target.value }))} /></label></div>
                <div className="bill-fields two"><label className="field"><span>WhatsApp</span><input value={billForm.whatsapp} onChange={(event) => setBillForm((form) => ({ ...form, whatsapp:event.target.value }))} /></label><label className="field"><span>Email</span><input type="email" value={billForm.email} onChange={(event) => setBillForm((form) => ({ ...form, email:event.target.value }))} /></label></div>
                <label className="field"><span>Address</span><input value={billForm.address} onChange={(event) => setBillForm((form) => ({ ...form, address:event.target.value }))} /></label>

                <div className="bill-fields two">
                  <label className="field"><span>Related quotation</span><select value={billForm.quotationId} onChange={(event) => applyQuotation(event.target.value)}><option value="">No quotation</option>{safeQuotations.map((quote) => <option key={quote.id} value={quote.id}>{quote.id} · {quote.customer} · {money(quote.amount)}</option>)}</select></label>
                  <div className="quotation-mini-stat"><small>QUOTATION PERFORMANCE</small><strong>{quotationStats.total ? Math.round(quotationStats.approved / quotationStats.total * 100) : 0}%</strong><span>{quotationStats.approved} approved of {quotationStats.total}</span></div>
                </div>

                <div className="bill-section-title" style={{ marginTop:22 }}><span>02</span><div><strong>Bill items</strong><small>Pick a saved material to auto-fill its unit price.</small></div><button type="button" className="secondary-button" onClick={addItem}><Plus size={14} /> Add item</button></div>
                <div className="bill-items-editor">
                  {billItems.map((item, index) => (
                    <div className="bill-editor-item" key={item.id}>
                      <div className="bill-editor-number">{String(index + 1).padStart(2, "0")}</div>
                      <div className="bill-editor-fields">
                        <label className="field"><span>Material / service</span><select value={item.materialId} onChange={(event) => selectMaterial(index, event.target.value)}><option value="">Custom item</option>{safeMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} · {money(material.price)} / {material.unit}</option>)}</select></label>
                        <label className="field"><span>Description</span><input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} placeholder="Work / material details" /></label>
                        <div className="bill-fields three"><label className="field"><span>Qty</span><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></label><label className="field"><span>Unit price</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} /></label><label className="field"><span>Amount</span><input value={money(itemTotals[index])} readOnly /></label></div>
                      </div>
                      {billItems.length > 1 && <button type="button" className="row-action danger-action" onClick={() => removeItem(index)} title="Remove item"><Trash2 size={15} /></button>}
                    </div>
                  ))}
                </div>

                <div className="bill-fields three"><label className="field"><span>Discount</span><input type="number" min="0" value={billForm.discount} onChange={(event) => setBillForm((form) => ({ ...form, discount:event.target.value }))} /></label><label className="field"><span>VAT</span><select value={billForm.vat} onChange={(event) => setBillForm((form) => ({ ...form, vat:event.target.value }))}><option value="0">0%</option><option value="5">5%</option></select></label><label className="field"><span>Paid now</span><input type="number" min="0" max={billTotal} value={billForm.paid} onChange={(event) => setBillForm((form) => ({ ...form, paid:event.target.value }))} /></label></div>
                <label className="field"><span>Payment method</span><select value={billForm.paymentMethod} onChange={(event) => setBillForm((form) => ({ ...form, paymentMethod:event.target.value }))}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Credit</option></select></label>
              </div>

              <div className="bill-preview-pane">
                <div className="invoice-preview">
                  <div className="invoice-brand"><div><strong>AL KANZ</strong><span>UPHOLSTERY</span></div><b>TAX INVOICE</b></div>
                  <div className="invoice-preview-meta"><div><small>BILL TO</small><strong>{billForm.customer || "Customer name"}</strong><span>{billForm.phone || billForm.email || "Contact details"}</span><span>{billForm.address || "Dubai, UAE"}</span></div><div><small>DATE</small><strong>{new Date().toLocaleDateString("en-AE")}</strong><span>{billForm.quotationId ? `Quote ${billForm.quotationId}` : "New invoice"}</span></div></div>
                  <div className="invoice-preview-items">{billItems.filter((item) => item.item || item.unitPrice).map((item, index) => <div className="invoice-item-preview" key={item.id}><div><small>{String(index + 1).padStart(2, "0")} · DESCRIPTION</small><strong>{item.item || "Item"}</strong><span>{item.description || "Upholstery service"}</span></div><strong>{money(itemTotals[index])}</strong></div>)}</div>
                  <div className="invoice-totals"><span>Subtotal <b>{money(subtotal)}</b></span><span>Discount <b>- {money(discountAmount)}</b></span><span>VAT ({billForm.vat}%) <b>{money(vatAmount)}</b></span><strong>Total <b>{money(billTotal)}</b></strong><span>Paid now <b>{money(paidNow)}</b></span><span>Balance <b>{money(billBalance)}</b></span></div>
                  <div className="invoice-note">Thank you for choosing <b>Al Kanz Upholstery</b>. This invoice will be saved to the workshop database.</div>
                </div>
                <div className="bill-preview-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => createBill(false)}><Save size={16} /> {saving ? "Saving…" : "Save Bill"}</button><button type="button" className="primary-button" disabled={saving} onClick={() => createBill(true)}><Printer size={16} /> {saving ? "Creating…" : "Create & Print Bill"}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {postPrintBill && (
        <div className="modal-backdrop">
          <div className="card post-print-modal">
            <div className="post-print-icon"><CheckCircle2 size={24} /></div>
            <span className="eyebrow">BILL READY</span>
            <h2>{postPrintBill.id}</h2>
            <p>Saved successfully. Use the same invoice template for print, PDF or contact sharing.</p>
            <div className="post-print-recipient"><strong>{postPrintBill.customer}</strong><span>{postPrintBill.phone || "No phone"} · {postPrintBill.email || "No email"}</span></div>
            <div className="post-print-actions"><button type="button" className="share-btn whatsapp" onClick={() => shareBill(postPrintBill, "whatsapp")}><MessageCircle size={17} /> WhatsApp</button><button type="button" className="share-btn" onClick={() => shareBill(postPrintBill, "share")}><ReceiptText size={17} /> Share PDF</button><button type="button" className="share-btn" onClick={() => shareBill(postPrintBill, "phone")}><Phone size={17} /> Phone</button><button type="button" className="share-btn" onClick={() => shareBill(postPrintBill, "email")}><Mail size={17} /> Email</button></div>
            <div className="post-print-footer"><button type="button" className="secondary-button" onClick={() => setPostPrintBill(null)}>Close</button><button type="button" className="primary-button" onClick={() => setSelected(postPrintBill)}><Eye size={16} /> Open Invoice</button></div>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop">
          <div className="invoice-detail-modal">
            <div className="invoice-detail-toolbar"><div><span className="eyebrow">INVOICE DETAILS</span><strong>{selected.id}</strong></div><button type="button" className="job-drawer-close" onClick={() => setSelected(null)}><X size={20} /></button></div>
            <InvoicePaper bill={selected} />
            <div className="invoice-contact-card"><div><small>PHONE</small><strong>{selected.phone || "Not saved"}</strong></div><div><small>WHATSAPP</small><strong>{selected.whatsapp || selected.phone || "Not saved"}</strong></div><div><small>EMAIL</small><strong>{selected.email || "Not saved"}</strong></div></div>
            <div className="invoice-share-center"><div className="share-center-head"><div><span className="eyebrow">SEND INVOICE</span><strong>Same invoice · multiple channels</strong><small>WhatsApp opens the saved customer chat. Share PDF uses the device share sheet when supported.</small></div></div><div className="post-print-actions"><button type="button" className="share-btn whatsapp" onClick={() => shareBill(selected, "whatsapp")}><MessageCircle size={17} /> WhatsApp</button><button type="button" className="share-btn" onClick={() => shareBill(selected, "share")}><ReceiptText size={17} /> Share PDF</button><button type="button" className="share-btn" onClick={() => shareBill(selected, "phone")}><Phone size={17} /> Call</button><button type="button" className="share-btn" onClick={() => shareBill(selected, "email")}><Mail size={17} /> Email</button></div></div>
            <div className="invoice-modal-actions"><button type="button" className="secondary-button" onClick={() => { setPostPrintBill(null); setSelected(null); }}>Close</button><button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={16} /> Print Invoice</button>{Number(selected.balance || 0) > 0 && <><label className="field invoice-payment-field"><span>Record payment</span><input type="number" min="0" max={selected.balance} value={payment} onChange={(event) => setPayment(event.target.value)} /></label><button type="button" className="primary-button" onClick={() => { recordPayment(selected.jobId || selected.id, payment); setPayment(""); setSelected(null); }}><CircleDollarSign size={16} /> Save Payment</button></>}</div>
          </div>
        </div>
      )}

      <div className="print-invoice-sheet">{postPrintBill && <InvoicePaper bill={postPrintBill} />}</div>
    </>
  );
}
/* ============================================================
   REPORTS
============================================================ */

function ReportsPage({ jobs = [], totalPaid, outstanding, totalExpenses = 0, netCash = 0, expenses = [] }) {
  const [period,setPeriod]=useState("12m"); const [view,setView]=useState("overview"); const [status,setStatus]=useState("all"); const [from,setFrom]=useState(""); const [to,setTo]=useState("");
  const safeJobs=Array.isArray(jobs)?jobs:[]; const safeExpenses=Array.isArray(expenses)?expenses:[]; const now=new Date();
  const inPeriod=(raw)=>{const d=new Date(raw);if(Number.isNaN(d.getTime()))return false;if(period==="custom"){const f=from?new Date(`${from}T00:00:00`):null;const t=to?new Date(`${to}T23:59:59`):null;return (!f||d>=f)&&(!t||d<=t);}const days=period==="7d"?7:period==="30d"?30:period==="90d"?90:365;return now-d<=days*86400000;};
  const filtered=safeJobs.filter(j=>inPeriod(j.date||j.created_at||j.deliveryDate)&&(status==="all"||String(j.status||"").toLowerCase()===status));
  const revenue=filtered.reduce((a,b)=>a+Number(b.total||b.amount||0),0); const paid=filtered.reduce((a,b)=>a+Number(b.paid||0),0); const pending=Math.max(0,revenue-paid); const jobCount=filtered.length; const periodExpenses=safeExpenses.filter(x=>inPeriod(x.expense_date||x.created_at)).reduce((a,b)=>a+Number(b.amount||0),0); const periodNet=paid-periodExpenses;
  const statusCounts={received:filtered.filter(j=>String(j.status).toLowerCase()==="received").length,progress:filtered.filter(j=>String(j.status).toLowerCase().includes("progress")).length,ready:filtered.filter(j=>String(j.status).toLowerCase()==="ready").length,delivered:filtered.filter(j=>String(j.status).toLowerCase()==="delivered").length};
  const monthly=Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);return {label:d.toLocaleString("en",{month:"short"}),value:safeJobs.filter(j=>{const x=new Date(j.date||j.created_at);return !Number.isNaN(x.getTime())&&x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear()}).reduce((a,b)=>a+Number(b.total||b.amount||0),0)};});
  const exportCsv=()=>{const rows=[["Invoice/Job","Customer","Amount","Paid","Balance","Status"],...filtered.map(j=>[j.id,j.customer,Number(j.total||j.amount||0),Number(j.paid||0),Math.max(0,Number(j.total||j.amount||0)-Number(j.paid||0)),j.status])].map(r=>r.map(x=>`"${String(x??"").replaceAll('"','""')}"`).join(",")).join("\n");const blob=new Blob([rows],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`al-kanz-${view}-report.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);};
  return <>
    <PageTitle eyebrow="FINANCE · BUSINESS INTELLIGENCE" title="Reports & Insights" subtitle="Revenue, collections, jobs, customers, expenses, profit and workshop performance."/>
    <div className="report-control-panel"><div className="report-view-tabs">{[["overview","Overview"],["revenue","Revenue"],["collections","Collections"],["expenses","Expenses"],["jobs","Jobs"],["customers","Customers"],["profit","Profit & Cash"]].map(([k,l])=><button type="button" key={k} className={view===k?"active":""} onClick={()=>setView(k)}>{l}</button>)}</div><div className="report-filters"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option><option value="custom">Custom dates</option></select>{period==="custom"&&<><label className="report-date-field"><span>From</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="report-date-field"><span>To</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All job statuses</option><option value="received">Received</option><option value="in progress">In Progress</option><option value="ready">Ready</option><option value="delivered">Delivered</option></select><button type="button" className="secondary-button" onClick={exportCsv}><Download size={15}/> Export CSV</button><button type="button" className="primary-button" onClick={()=>window.print()}><Printer size={15}/> Print</button></div></div>
    <div className="report-grid report-grid-rich"><ReportBox icon={TrendingUp} title="Revenue" value={money(revenue)} note={`${jobCount} records in period`}/><ReportBox icon={CircleDollarSign} title="Collected" value={money(paid)} note="Payments received"/><ReportBox icon={AlertCircle} title="Pending" value={money(pending)} note="Awaiting collection"/><ReportBox icon={Wallet} title="Expenses" value={money(periodExpenses)} note="Selected-period costs"/><ReportBox icon={TrendingUp} title="Net cash" value={money(periodNet)} note="Collected less expenses"/><ReportBox icon={CheckCircle2} title="Collection rate" value={`${revenue?Math.round(paid/revenue*100):0}%`} note="Revenue collected"/></div>
    <div className="reports-main-grid"><div className="card report-chart report-chart-large"><CardHeader eyebrow="PERFORMANCE" title="Revenue trend" subtitle="Monthly billed value · last 6 months"/><div className="bars live-bars report-bars-large">{monthly.map(x=>{const max=Math.max(...monthly.map(y=>y.value),1);return <div className="bar-wrap" key={x.label}><strong>{money(x.value)}</strong><div className="bar animated-bar" style={{height:`${x.value?Math.max(8,x.value/max*100):4}%`}}/><span>{x.label}</span></div>})}</div></div><div className="card report-breakdown-card"><CardHeader eyebrow="WORKSHOP" title="Job status" subtitle="Selected-period workload"/><div className="report-status-ring"><div><strong>{filtered.filter(j=>!['Completed','Delivered'].includes(j.status)).length}</strong><span>open jobs</span></div></div><div className="status-breakdown"><div><span><i className="status-dot received"/>Received</span><strong>{statusCounts.received}</strong></div><div><span><i className="status-dot progress"/>In progress</span><strong>{statusCounts.progress}</strong></div><div><span><i className="status-dot ready"/>Ready</span><strong>{statusCounts.ready}</strong></div><div><span><i className="status-dot delivered"/>Delivered</span><strong>{statusCounts.delivered}</strong></div></div></div></div>
    <div className="reports-bottom-grid"><div className="card report-list-card"><CardHeader eyebrow="COLLECTIONS" title="Outstanding invoices" subtitle="Largest balances first"/><div className="report-list">{filtered.filter(j=>Number(j.total||j.amount||0)>Number(j.paid||0)).sort((a,b)=>(Number(b.total||b.amount||0)-Number(b.paid||0))-(Number(a.total||a.amount||0)-Number(a.paid||0))).slice(0,8).map(j=><div key={j.id}><span><strong>{j.customer}</strong><small>{j.id} · {j.item||j.work}</small></span><strong className="orange-text">{money(Number(j.total||j.amount||0)-Number(j.paid||0))}</strong></div>)}{!filtered.some(j=>Number(j.total||j.amount||0)>Number(j.paid||0))&&<EmptyState icon={CheckCircle2} title="All caught up" text="No outstanding balances in this period."/>}</div></div><div className="card report-list-card"><CardHeader eyebrow="CUSTOMERS" title="Top customers" subtitle="Highest billed value"/><div className="report-list">{Object.entries(filtered.reduce((a,j)=>{const k=j.customer||"Unknown";a[k]=(a[k]||0)+Number(j.total||j.amount||0);return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value],i)=><div key={name}><span><strong>0{i+1} · {name}</strong><small>Customer billing contribution</small></span><strong>{money(value)}</strong></div>)}{!filtered.length&&<EmptyState icon={Users} title="No customer data" text="Create invoices or jobs to populate this report."/>}</div></div><div className="card report-list-card"><CardHeader eyebrow="PROFIT & CASH" title="Period summary" subtitle="Cash movement and workshop costs"/><div className="report-list"><div><span><strong>Collected</strong><small>Customer payments</small></span><strong className="income">+{money(paid)}</strong></div><div><span><strong>Expenses</strong><small>Workshop costs</small></span><strong className="expense">-{money(periodExpenses)}</strong></div><div><span><strong>Net cash</strong><small>Collected minus expenses</small></span><strong>{money(periodNet)}</strong></div></div></div></div>
  </>;
}

function ReportBox({
  icon: Icon,
  title,
  value,
  note,
}) {
  return (
    <div className="report-box">
      <div>
        <Icon size={20} />
      </div>

      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

/* ============================================================
   ACCOUNTS
============================================================ */

function AccountsPage({ page, totalPaid, outstanding, expenses = [], setExpenses, transfers = [], setTransfers, transactions = [], setTransactions, jobs = [], navigate }) {
  const [expenseForm, setExpenseForm] = useState({category:"Workshop",description:"",amount:"",account:"Cash",reference:""});
  const [transferForm, setTransferForm] = useState({from_account:"Cash",to_account:"Bank",amount:"",reference:""});

  const addExpense = async (e) => {
    e.preventDefault();
    const amount = Number(expenseForm.amount);
    if (!expenseForm.description || !amount) return;
    const row = { id: Date.now().toString(), ...expenseForm, amount, expense_date: new Date().toISOString().slice(0,10) };
    setExpenses(prev=>[row,...prev]);
    setTransactions(prev=>[{id:Date.now().toString()+"t",transaction_type:"Expense",description:expenseForm.description,amount,account:expenseForm.account,transaction_date:new Date().toISOString()},...prev]);
    if (hasSupabase) {
      const saved=await supabase.from("expenses").insert({category:expenseForm.category,description:expenseForm.description,amount,account:expenseForm.account,reference:expenseForm.reference,expense_date:row.expense_date}).select("*").single();
      if(saved.error) alert("Expense saved locally, but cloud sync failed.");
      else await supabase.from("transactions").insert({transaction_type:"Expense",description:expenseForm.description,amount,account:expenseForm.account,expense_id:saved.data.id});
    }
    auditLocal("Created expense","expense",row.id,row);
    setExpenseForm({category:"Workshop",description:"",amount:"",account:"Cash",reference:""});
  };

  const addTransfer = async (e) => {
    e.preventDefault();
    const amount=Number(transferForm.amount);
    if(!amount || transferForm.from_account===transferForm.to_account) return;
    const row={id:Date.now().toString(),...transferForm,amount,transfer_date:new Date().toISOString().slice(0,10)};
    setTransfers(prev=>[row,...prev]);
    if(hasSupabase){
      const saved=await supabase.from("money_transfers").insert({from_account:row.from_account,to_account:row.to_account,amount,reference:row.reference,transfer_date:row.transfer_date}).select("*").single();
      if(saved.error) alert("Transfer saved locally, but cloud sync failed.");
      else await supabase.from("transactions").insert({transaction_type:"Transfer",description:`Transfer ${row.from_account} → ${row.to_account}`,amount,account:row.to_account,transfer_id:saved.data.id});
    }
    auditLocal("Moved money","transfer",row.id,row);
    setTransferForm({from_account:"Cash",to_account:"Bank",amount:"",reference:""});
  };

  const totalExpenses=expenses.reduce((a,b)=>a+Number(b.amount||0),0);
  const net=totalPaid-totalExpenses;

  return (
    <>
      <PageTitle eyebrow="FINANCE · UAE" title={page} subtitle="Manage workshop income, expenses and money movement in AED." />
      <div className="account-tabs">
        {['Accounts','Ledger','Expenses','Move Money'].map(x=><button type="button" key={x} className={page===x?'active':''} onClick={()=>navigate?.(x)}>{x}</button>)}
      </div>
      <div className="account-overview">
        <div className="account-big-card"><span>Customer Receivables</span><strong>{money(outstanding)}</strong><small>Outstanding invoices</small></div>
        <div className="account-big-card"><span>Payments Received</span><strong>{money(totalPaid)}</strong><small>Customer collections</small></div>
        <div className="account-big-card"><span>Expenses</span><strong>{money(totalExpenses)}</strong><small>Workshop expenses</small></div>
        <div className="account-big-card"><span>Net Cash Movement</span><strong>{money(net)}</strong><small>Income minus expenses</small></div>
      </div>

      {page === 'Expenses' && <div className="card" style={{padding:24,marginBottom:18}}>
        <CardHeader eyebrow="EXPENSES" title="Add workshop expense" subtitle="Record leather, labour, rent, transport or other business costs." />
        <form onSubmit={addExpense} className="modal-grid">
          <Field label="Description" value={expenseForm.description} onChange={v=>setExpenseForm({...expenseForm,description:v})} placeholder="Leather purchase"/>
          <Field label="Amount" type="number" value={expenseForm.amount} onChange={v=>setExpenseForm({...expenseForm,amount:v})} placeholder="AED 0.00"/>
          <SelectField label="Category" value={expenseForm.category} onChange={v=>setExpenseForm({...expenseForm,category:v})} options={['Workshop','Materials','Transport','Rent','Utilities','Salary','Other']}/>
          <SelectField label="Account" value={expenseForm.account} onChange={v=>setExpenseForm({...expenseForm,account:v})} options={['Cash','Bank','Card']}/>
          <button className="primary-button" type="submit"><Plus size={16}/> Add Expense</button>
        </form>
        <div className="table-card" style={{marginTop:20}}><div className="table-head"><span>DATE</span><span>DESCRIPTION</span><span>CATEGORY</span><span>ACCOUNT</span><span>AMOUNT</span></div>{expenses.map(x=><div className="table-row" key={x.id}><span>{x.expense_date}</span><strong>{x.description}</strong><span>{x.category}</span><span>{x.account}</span><strong className="expense">-{money(x.amount)}</strong></div>)}</div>
      </div>}

      {page === 'Move Money' && <div className="card" style={{padding:24,marginBottom:18}}>
        <CardHeader eyebrow="MOVE MONEY" title="Transfer between accounts" subtitle="Move funds between Cash, Bank and Card accounts." />
        <form onSubmit={addTransfer} className="modal-grid">
          <SelectField label="From" value={transferForm.from_account} onChange={v=>setTransferForm({...transferForm,from_account:v})} options={['Cash','Bank','Card']}/>
          <SelectField label="To" value={transferForm.to_account} onChange={v=>setTransferForm({...transferForm,to_account:v})} options={['Cash','Bank','Card']}/>
          <Field label="Amount" type="number" value={transferForm.amount} onChange={v=>setTransferForm({...transferForm,amount:v})} placeholder="AED 0.00"/>
          <button className="primary-button" type="submit"><ArrowLeftRight size={16}/> Transfer</button>
        </form>
        <div className="table-card" style={{marginTop:20}}><div className="table-head"><span>DATE</span><span>FROM</span><span>TO</span><span>REFERENCE</span><span>AMOUNT</span></div>{transfers.map(x=><div className="table-row" key={x.id}><span>{x.transfer_date}</span><strong>{x.from_account}</strong><strong>{x.to_account}</strong><span>{x.reference||'—'}</span><strong>{money(x.amount)}</strong></div>)}</div>
      </div>}

      {page === 'Ledger' && <div className="table-card"><div className="table-head"><span>DATE</span><span>DESCRIPTION</span><span>TYPE</span><span>ACCOUNT</span><span>AMOUNT</span></div>{transactions.map(x=><div className="table-row" key={x.id}><span>{x.transaction_date ? new Date(x.transaction_date).toLocaleDateString('en-AE') : '—'}</span><strong>{x.description}</strong><Status status={x.transaction_type}/><span>{x.account}</span><strong className={x.transaction_type==='Expense'?'expense':'income'}>{x.transaction_type==='Expense'?'-':'+'}{money(x.amount)}</strong></div>)}</div>}

      {page === 'Accounts' && <div className="table-card"><div className="table-head"><span>DATE</span><span>DESCRIPTION</span><span>TYPE</span><span>ACCOUNT</span><span>AMOUNT</span></div>{transactions.slice(0,12).map(x=><div className="table-row" key={x.id}><span>{x.transaction_date ? new Date(x.transaction_date).toLocaleDateString('en-AE') : '—'}</span><strong>{x.description}</strong><Status status={x.transaction_type}/><span>{x.account}</span><strong className={x.transaction_type==='Expense'?'expense':'income'}>{x.transaction_type==='Expense'?'-':'+'}{money(x.amount)}</strong></div>)}</div>}
    </>
  );
}

/* ============================================================
   SETTINGS
============================================================ */

function SettingsPage({ page, theme, setTheme }) {
  const [activeTab, setActiveTab] = useState(page === "Audit & Security" ? "audit" : "profile");
  const [profile, setProfile] = useState(() => safeParse(localStorage.getItem("al-kanz-profile"), {
    name: "Al Kanz Admin", email: "admin@alkanzupholstery.com", phone: "+971 50 000 0000", role: "Owner"
  }));
  const [workshop, setWorkshop] = useState(() => safeParse(localStorage.getItem("al-kanz-workshop"), {
    name: "Al Kanz Upholstery", location: "Dubai, UAE", phone: "+971 50 000 0000", email: "admin@alkanzupholstery.com"
  }));
  const [notifications, setNotifications] = useState(() => safeParse(localStorage.getItem("al-kanz-notifications"), {
    jobs: true, payments: true, stock: true, daily: false
  }));
  const [message, setMessage] = useState("");

  const save = (key, value, text) => {
    localStorage.setItem(key, JSON.stringify(value));
    setMessage(text);
    window.setTimeout(() => setMessage(""), 1800);
  };

  const tabs = [
    ["profile", "User Profile", UserCog],
    ["workshop", "Workshop Settings", Settings],
    ["notifications", "Notifications", Bell],
    ["security", "Security", ShieldCheck],
    ["password", "Password", Lock],
    ["audit", "Audit & Security", ShieldCheck],
  ];

  return <>
    <PageTitle eyebrow="SYSTEM" title={page} subtitle="Manage your workshop account, security and preferences." />
    <div className="settings-layout">
      <div className="settings-menu">
        {tabs.map(([id,label,Icon]) => <button type="button" key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon size={17}/><span>{label}</span></button>)}
      </div>

      {activeTab === "profile" && <div className="card settings-card">
        <CardHeader eyebrow="PROFILE" title="User information" subtitle="Update your administrator details." />
        <div className="settings-form">
          <label>Full name<input value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
          <label>Email<input type="email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label>
          <label>Phone<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label>
          <label>Role<input value={profile.role} readOnly/></label>
          <div className="settings-form-actions"><button type="button" className="primary-button" onClick={()=>save("al-kanz-profile",profile,"Profile saved successfully")}><Save size={16}/>Save Changes</button></div>
        </div>
      </div>}

      {activeTab === "workshop" && <div className="card settings-card">
        <CardHeader eyebrow="WORKSHOP" title="Workshop Settings" subtitle="Manage your workshop information." />
        <div className="settings-form">
          <label>Workshop Name<input value={workshop.name} onChange={e=>setWorkshop({...workshop,name:e.target.value})}/></label>
          <label>Location<input value={workshop.location} onChange={e=>setWorkshop({...workshop,location:e.target.value})}/></label>
          <label>Phone<input value={workshop.phone} onChange={e=>setWorkshop({...workshop,phone:e.target.value})}/></label>
          <label>Email<input value={workshop.email} onChange={e=>setWorkshop({...workshop,email:e.target.value})}/></label>
          <label>Currency<input value="AED — UAE Dirham" readOnly/></label>
          <label>Time Zone<input value="Asia/Dubai — GMT+4" readOnly/></label>
          <div className="settings-form-actions"><button type="button" className="primary-button" onClick={()=>save("al-kanz-workshop",workshop,"Workshop settings saved")}><Save size={16}/>Save Workshop Settings</button></div>
        </div>
      </div>}

      {activeTab === "notifications" && <div className="card settings-card">
        <CardHeader eyebrow="UPDATES" title="Notifications" subtitle="Choose which workshop notifications you receive." />
        <div className="settings-options">
          <NotificationSetting title="Job Updates" description="Notify me when repair jobs change status." checked={notifications.jobs} onChange={()=>{const n={...notifications,jobs:!notifications.jobs};setNotifications(n);save("al-kanz-notifications",n,"Notification settings updated")}}/>
          <NotificationSetting title="Payment Alerts" description="Notify me when customer payments are recorded." checked={notifications.payments} onChange={()=>{const n={...notifications,payments:!notifications.payments};setNotifications(n);save("al-kanz-notifications",n,"Notification settings updated")}}/>
          <NotificationSetting title="Low Stock Alerts" description="Notify me when workshop materials are running low." checked={notifications.stock} onChange={()=>{const n={...notifications,stock:!notifications.stock};setNotifications(n);save("al-kanz-notifications",n,"Notification settings updated")}}/>
          <NotificationSetting title="Daily Summary" description="Receive a daily workshop summary." checked={notifications.daily} onChange={()=>{const n={...notifications,daily:!notifications.daily};setNotifications(n);save("al-kanz-notifications",n,"Notification settings updated")}}/>
        </div>
      </div>}

      {activeTab === "security" && <div className="card settings-card">
        <CardHeader eyebrow="SECURITY" title="Account Security" subtitle="Protection settings for the administrator account." />
        <div className="settings-options">
          <div className="security-row"><div className="security-icon"><ShieldCheck size={20}/></div><div className="security-info"><strong>Account protection</strong><small>Administrator access is protected by the configured authentication system.</small></div><span className="security-status">Active</span></div>
          <div className="security-row"><div className="security-icon"><Lock size={20}/></div><div className="security-info"><strong>Session security</strong><small>Current browser session and access controls.</small></div><span className="security-status">Active</span></div>
        </div>
      </div>}

      {activeTab === "password" && <div className="card settings-card">
        <CardHeader eyebrow="ACCOUNT" title="Password" subtitle="Password changes should be handled by your authentication provider." />
        <div className="settings-form">
          <label>Current Password<input type="password" placeholder="Current password"/></label>
          <label>New Password<input type="password" placeholder="New password"/></label>
          <label>Confirm Password<input type="password" placeholder="Confirm password"/></label>
          <div className="settings-form-actions"><button type="button" className="primary-button" onClick={()=>alert("Connect this action to your Appwrite authentication password-update flow.")}><Lock size={16}/>Update Password</button></div>
        </div>
      </div>}

      {activeTab === "audit" && <div className="card settings-card">
        <CardHeader eyebrow="AUDIT & SECURITY" title="Activity & security log" subtitle="Review important actions performed in the workshop system." />
        <div className="settings-options">
          <div className="security-row"><div className="security-icon"><ShieldCheck size={20}/></div><div className="security-info"><strong>Audit trail</strong><small>Records actions such as creating jobs, customers, suppliers, staff and recording payments.</small></div><span className="security-status">Logging</span></div>
          <div className="audit-demo-list"><div><strong>What is the difference?</strong><p><b>Security</b> protects the account and controls access. <b>Audit & Security</b> records and reviews who did what and when, so activity can be traced.</p></div></div>
        </div>
      </div>}

      {activeTab === "profile" && <div className="card appearance-card">
        <CardHeader eyebrow="APPEARANCE" title="Choose your workspace" subtitle="Switch between Day and Night. The choice is remembered on this device." />
        <div className="theme-options theme-options-two">
          {[
            ["day","Day","Bright Al Kanz workspace"],
            ["night","Night","Low-light dark workspace"],
          ].map(([t,label,desc])=><button type="button" key={t} className={`theme-option ${theme===t?"active":""}`} onClick={()=>setTheme(t)}><span className={`theme-preview theme-preview-${t}`}/><div><strong>{label}</strong><small>{desc}</small></div>{theme===t&&<CheckCircle2 size={17}/>}</button>)}
        </div>
      </div>}
    </div>
    {message && <div className="settings-save-message"><CheckCircle2 size={16}/>{message}</div>}
  </>;
}

function NotificationSetting({ title, description, checked, onChange }) {
  return <button type="button" className="notification-setting" onClick={onChange}>
    <div className="notification-setting-info"><strong>{title}</strong><small>{description}</small></div>
    <span className={`toggle ${checked ? "on" : ""}`}><span/></span>
  </button>;
}

function QuotationPage({ page, quotations = [], setQuotations }) {
  const [form, setForm] = useState({
    customer: "",
    phone: "",
    item: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    validity: "30 days",
    status: "Draft",
  });
  const [showForm, setShowForm] = useState(page === "New Quotation");
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [aiText, setAiText] = useState("");

  const safeQuotations = Array.isArray(quotations) ? quotations : [];
  const subtotal = Number(form.quantity || 0) * Number(form.unitPrice || 0);
  const vat = subtotal * 0.05;
  const grandTotal = subtotal + vat;

  const runQuotationAI = () => {
    const item = form.item || "your upholstery service";
    const customer = form.customer || "the customer";
    const tips = [
      `Suggested scope: Inspect ${item}, confirm material/colour, complete the upholstery work, quality-check the finish and hand over after approval.`,
      `Pricing tip: keep the quotation itemized and show labour, materials, VAT and the final total separately.`,
      `Customer note: ${customer} should approve the quotation before the work is converted into an invoice.`,
    ];
    setAiText(tips.join(" "));
  };

  const [editingQuote, setEditingQuote] = useState(null);

  const save = () => {
    if (!form.customer || !form.item || !form.unitPrice) {
      alert("Customer, item and unit price are required.");
      return;
    }
    const q = {
      ...(editingQuote || {}),
      id: editingQuote?.id || `QT-${String(Date.now()).slice(-6)}`,
      ...form,
      quantity: Number(form.quantity || 1),
      unitPrice: Number(form.unitPrice || 0),
      subtotal,
      vat,
      amount: grandTotal,
      status: form.status || "Draft",
      date: editingQuote?.date || new Date().toLocaleDateString("en-AE"),
      updatedAt: new Date().toISOString(),
    };
    setQuotations(prev => editingQuote ? prev.map(x => x.id === editingQuote.id ? q : x) : [q, ...(Array.isArray(prev) ? prev : [])]);
    setSelectedQuote(q);
    setEditingQuote(null);
    setForm({customer:"", phone:"", item:"", description:"", quantity:"1", unitPrice:"", validity:"30 days", status:"Draft"});
    setShowForm(false);
  };

  return (
    <>
      <PageTitle
        eyebrow="SALES · UAE"
        title={page === "New Quotation" ? "New Quotation" : "Quotations"}
        subtitle="Create professional quotations using the same clean document structure as an invoice."
        button={!showForm ? "New Quotation" : null}
        onClick={() => setShowForm(true)}
      />

      <div className="staff-summary-grid quotation-performance-summary">
        <ReportBox icon={FileText} title="Total quotations" value={safeQuotations.length} note="All saved quotations" />
        <ReportBox icon={CheckCircle2} title="Approved" value={safeQuotations.filter(q => String(q.status || "").toLowerCase() === "approved").length} note="Accepted quotations" />
        <ReportBox icon={Clock3} title="Pending" value={safeQuotations.filter(q => !["approved","rejected"].includes(String(q.status || "draft").toLowerCase())).length} note="Awaiting customer decision" />
        <ReportBox icon={TrendingUp} title="Conversion" value={`${safeQuotations.length ? Math.round((safeQuotations.filter(q => String(q.status || "").toLowerCase() === "approved").length / safeQuotations.length) * 100) : 0}%`} note="Approved / total" />
      </div>

      {showForm && (
        <div className="quotation-invoice-layout">
          <div className="card quotation-form-card">
            <CardHeader eyebrow="QUOTATION DETAILS" title="Create quotation" subtitle="Demo quotation — prices can be edited before saving." />
            <div className="settings-form">
              <label>Customer<input value={form.customer} onChange={e=>setForm({...form,customer:e.target.value})} placeholder="Customer name" /></label>
              <label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+971..." /></label>
              <label>Item / Service<input value={form.item} onChange={e=>setForm({...form,item:e.target.value})} placeholder="Sofa upholstery, car seat, etc." /></label>
              <label>Quantity<input type="number" min="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} /></label>
              <label>Unit Price (AED)<input type="number" min="0" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})} placeholder="0.00" /></label>
              <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Draft</option><option>Sent</option><option>Approved</option><option>Rejected</option></select></label>
              <label>Validity<select value={form.validity} onChange={e=>setForm({...form,validity:e.target.value})}><option>7 days</option><option>15 days</option><option>30 days</option><option>60 days</option></select></label>
              <label className="full-field">Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Work included, materials, terms..." rows="4" /></label>
              <div className="quotation-ai-box full-field">
                <div><Sparkles size={17}/><div><strong>AI quotation helper</strong><small>Generate a professional scope and pricing reminder from your form.</small></div></div>
                <button type="button" className="secondary-button" onClick={runQuotationAI}><Sparkles size={15}/> Help me</button>
                {aiText && <p>{aiText}</p>}
              </div>
              <div className="settings-form-actions full-field quotation-action-bar"><button type="button" className="primary-button" onClick={save}><Save size={16}/> Save Quotation</button><button type="button" className="secondary-button" onClick={()=>setPrintOpen(true)}><Printer size={16}/> Print Options</button><button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>Cancel</button></div>
            </div>
          </div>

          <div className="card quotation-document">
            <div className="invoice-document-head">
              <div><span className="eyebrow">AL KANZ UPHOLSTERY</span><h2>QUOTATION</h2><p>Dubai, UAE · AED</p></div>
              <div className="document-number"><strong>QT-PREVIEW</strong><span>Date: {new Date().toLocaleDateString("en-AE")}</span><span>Valid: {form.validity}</span></div>
            </div>
            <div className="document-parties"><div><small>FROM</small><strong>Al Kanz Upholstery</strong><span>Dubai, UAE</span></div><div><small>TO</small><strong>{form.customer || "Customer Name"}</strong><span>{form.phone || "Customer phone"}</span></div></div>
            <div className="invoice-items">
              <div className="invoice-item-head"><span>DESCRIPTION</span><span>QTY</span><span>UNIT PRICE</span><span>TOTAL</span></div>
              <div className="invoice-item-row"><span><strong>{form.item || "Item / Service"}</strong><small>{form.description || "Description of proposed work"}</small></span><span>{form.quantity || 1}</span><span>{money(form.unitPrice)}</span><strong>{money(subtotal)}</strong></div>
            </div>
            <div className="document-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>VAT (5%)</span><strong>{money(vat)}</strong></div><div className="grand"><span>Grand Total</span><strong>{money(grandTotal)}</strong></div></div>
            <div className="document-note"><strong>Quotation terms</strong><span>This quotation is a demo estimate and is valid for {form.validity}. Final billing may vary based on approved work or materials.</span></div>
          </div>
        </div>
      )}

      {!showForm && (
        <div className="table-card">
          <div className="table-head"><span>QUOTE</span><span>CUSTOMER</span><span>ITEM</span><span>AMOUNT</span><span>STATUS</span></div>
          {safeQuotations.length === 0 ? <EmptyState icon={FileText} title="No quotations yet" text="Create your first quotation." /> : safeQuotations.map(q => (
            <button type="button" className="table-row quotation-row-button" key={q.id} onClick={()=>setSelectedQuote(q)}>
              <strong>{q.id}</strong><span>{q.customer}</span><span>{q.item}</span><strong>{money(q.amount)}</strong><Status status={q.status}/>
            </button>
          ))}
        </div>
      )}

      {selectedQuote && (
        <div className="modal-backdrop">
          <div className="card quotation-document quotation-modal-document">
            <button className="job-drawer-close" style={{position:"absolute",right:18,top:18}} onClick={()=>setSelectedQuote(null)}><X size={20}/></button>
            <div className="invoice-document-head"><div><span className="eyebrow">AL KANZ UPHOLSTERY</span><h2>QUOTATION</h2><p>Dubai, UAE · AED</p></div><div className="document-number"><strong>{selectedQuote.id}</strong><span>{selectedQuote.date}</span><span>Valid: {selectedQuote.validity}</span></div></div>
            <div className="document-parties"><div><small>FROM</small><strong>Al Kanz Upholstery</strong><span>Dubai, UAE</span></div><div><small>TO</small><strong>{selectedQuote.customer}</strong><span>{selectedQuote.phone || "—"}</span></div></div>
            <div className="invoice-items"><div className="invoice-item-head"><span>DESCRIPTION</span><span>QTY</span><span>UNIT PRICE</span><span>TOTAL</span></div><div className="invoice-item-row"><span><strong>{selectedQuote.item}</strong><small>{selectedQuote.description || "—"}</small></span><span>{selectedQuote.quantity}</span><span>{money(selectedQuote.unitPrice)}</span><strong>{money(selectedQuote.subtotal)}</strong></div></div>
            <div className="document-totals"><div><span>Subtotal</span><strong>{money(selectedQuote.subtotal)}</strong></div><div><span>VAT (5%)</span><strong>{money(selectedQuote.vat)}</strong></div><div className="grand"><span>Grand Total</span><strong>{money(selectedQuote.amount)}</strong></div></div>
            <div className="document-actions"><button className="primary-button" onClick={()=>window.print()}><Printer size={16}/> Print Quotation</button><button className="secondary-button" onClick={()=>setPrintOpen(true)}><SlidersHorizontal size={16}/> Print Options</button><button className="secondary-button" onClick={()=>{ const copy={...selectedQuote,id:`QT-${String(Date.now()).slice(-6)}`,status:"Draft",date:new Date().toLocaleDateString("en-AE")}; setQuotations(prev=>[copy,...prev]); setSelectedQuote(copy); }}><RefreshCw size={16}/> Duplicate</button><button className="secondary-button" onClick={()=>{ setSelectedQuote(null); setShowForm(true); setEditingQuote(selectedQuote); setForm({customer:selectedQuote.customer,phone:selectedQuote.phone||"",item:selectedQuote.item,description:selectedQuote.description||"",quantity:String(selectedQuote.quantity||1),unitPrice:String(selectedQuote.unitPrice||0),validity:selectedQuote.validity||"30 days",status:selectedQuote.status||"Draft"}); }}> <Edit3 size={16}/> Edit</button><button className="secondary-button" onClick={()=>setSelectedQuote(null)}>Close</button></div>
          </div>
        </div>
      )}

      {printOpen && (
        <PrintOptionsModal
          title="Quotation printing"
          close={() => setPrintOpen(false)}
          options={[
            ["Print quotation", "Clean customer-facing quotation", () => window.print()],
            ["Print customer copy", "Print another copy for the customer file", () => window.print()],
            ["Print internal copy", "Print a copy for workshop records", () => window.print()],
          ]}
        />
      )}
    </>
  );
}

/* ============================================================
   SMART SEARCH / AI / PREVIEW / PRINT HELPERS
============================================================ */

function AIHelpPanel({ page, totalPaid, outstanding, expenses = [], quotations = [], jobs = [], customers = [], materials = [], navigate, close }) {
  const [mode, setMode] = useState("actions");
  const [prompt, setPrompt] = useState("");
  const totalExpenses = expenses.reduce((a,b)=>a+Number(b.amount||0),0);
  const lowStock = materials.filter(m=>Number(m.stock||0)<20).length;
  const unpaid = jobs.filter(j=>Number(j.amount||0)>Number(j.paid||0)).length;
  const cards = [
    ["Cashflow health", `Collected ${money(totalPaid)} with ${money(outstanding)} still pending.`, "Reports", TrendingUp],
    ["Unpaid invoices", `${unpaid} job invoice${unpaid===1?"":"s"} need collection follow-up.`, "Payments", AlertCircle],
    ["Expense watch", `${money(totalExpenses)} recorded in expenses. Review your biggest costs.`, "Expenses", Wallet],
    ["Low-stock check", `${lowStock} material${lowStock===1?"":"s"} are below the 20-unit watch level.`, "Materials", Package],
    ["Customer insights", `${customers.length} customer profiles are available for review.`, "Customers", Users],
    ["Quotation assistant", `${quotations.length} saved quotation${quotations.length===1?"":"s"}. Build or review estimates.`, "New Quotation", FileText],
    ["Workshop workload", `${jobs.filter(j=>!['Completed','Delivered'].includes(j.status)).length} jobs are currently open.`, "Active Jobs", Wrench],
    ["Daily finance", "Open the ledger to inspect income, expenses and transfers.", "Ledger", ArrowLeftRight],
  ];
  const answer = prompt.trim() ? `Based on the saved workshop records: ${prompt.toLowerCase().includes("sales") ? `total billed is ${money(jobs.reduce((a,b)=>a+Number(b.amount||0),0))}.` : prompt.toLowerCase().includes("customer") ? `${customers.length} customer profiles are currently available.` : prompt.toLowerCase().includes("stock") ? `${lowStock} materials are below the current low-stock threshold.` : `I can help you review billing, customers, stock, quotations, jobs and cash movement. Choose a shortcut below for a focused view.`}` : "Choose a workspace insight or type a question to get a quick operational summary.";
  return <div className="ai-panel ai-panel-rich">
    <div className="ai-panel-head"><div><span><Sparkles size={14}/> AI WORKSPACE</span><h3>Al Kanz Copilot</h3><p>Quick operational insights from your saved records.</p></div><button type="button" onClick={close}><X size={16}/></button></div>
    <div className="ai-mode-tabs"><button className={mode==="actions"?"active":""} onClick={()=>setMode("actions")}>Smart actions</button><button className={mode==="ask"?"active":""} onClick={()=>setMode("ask")}>Ask assistant</button></div>
    {mode==="ask" ? <div className="ai-ask"><div className="ai-answer"><Sparkles size={16}/><span>{answer}</span></div><div className="ai-input"><input value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&setMode("ask")} placeholder="Ask: sales, customers, stock, cashflow..."/><button type="button" onClick={()=>setPrompt(prompt.trim())}><ArrowUpRight size={16}/></button></div><div className="ai-chip-row">{["How are sales?","Who owes us?","Check stock","Review expenses"].map(x=><button key={x} onClick={()=>setPrompt(x)}>{x}</button>)}</div></div> : <div className="ai-suggestion-grid">{cards.map(([title,text,target,Icon])=><button type="button" key={title} onClick={()=>navigate(target)}><span className="ai-card-icon"><Icon size={16}/></span><span><strong>{title}</strong><small>{text}</small></span><ChevronRight size={14}/></button>)}</div>}
    <div className="ai-panel-footer"><span><Sparkles size={12}/> Local workspace assistant</span><button onClick={()=>navigate("Dashboard")}>Open dashboard <ArrowUpRight size={13}/></button></div>
  </div>;
}

function EntityPreviewModal({ entity, close }) {
  const fields = Object.entries(entity || {}).filter(([k,v]) => !["type","id","$id","$createdAt","$updatedAt"].includes(k) && v !== undefined && v !== null && typeof v !== "object");
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)close();}}>
    <div className="card entity-preview-modal">
      <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={17}/></button>
      <span className="eyebrow">{entity.type || "RECORD"}</span>
      <h2>{entity.name || entity.customer || entity.id || "Record details"}</h2>
      <p className="entity-preview-subtitle">Read-only record preview. Changes can be made from the relevant section.</p>
      <div className="entity-preview-grid">{fields.map(([key,value])=><div key={key}><small>{key.replaceAll("_"," ").toUpperCase()}</small><strong>{String(value)}</strong></div>)}</div>
      <div className="document-actions"><button type="button" className="secondary-button" onClick={close}>Close</button></div>
    </div>
  </div>;
}

function PrintOptionsModal({ title, close, options = [] }) {
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)close();}}>
    <div className="card print-options-modal">
      <button type="button" className="modal-close" onClick={close}><X size={17}/></button>
      <span className="eyebrow">PRINT CENTER</span><h2>{title}</h2><p>Choose exactly which document copy you want to send to the browser printer.</p>
      <div className="print-option-list">{options.map(([label,desc,action])=><button type="button" key={label} onClick={()=>{action();close();}}><span className="print-option-icon"><Printer size={17}/></span><span><strong>{label}</strong><small>{desc}</small></span><ArrowUpRight size={15}/></button>)}</div>
    </div>
  </div>;
}

/* ============================================================
   PAGE TITLE
============================================================ */

function PageTitle({
  eyebrow,
  title,
  subtitle,
  button,
  onClick,
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      {button && (
        <button
          className="primary-button"
          onClick={onClick}
        >
          <Plus size={17} />
          {button}
        </button>
      )}
    </div>
  );
}

/* ============================================================
   EMPTY
============================================================ */

function EmptyState({
  icon: Icon,
  title,
  text,
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

/* ============================================================
   JOB MODAL
============================================================ */

function JobModal({ close, save }) {
  const [form, setForm] = useState({
    customer: "",
    phone: "",
    item: "3-Seater Sofa",
    description: "",
    work: "Full Leather Replacement",
    material: "Premium Leather",
    colour: "",
    quantity: "1",
    materialCost: "",
    labour: "",
    otherCharges: "",
    discount: "",
    paid: "",
    deliveryDate: "",
    notes: "",
  });

  const update = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const materialCost = Number(form.materialCost || 0);
  const labour = Number(form.labour || 0);
  const otherCharges = Number(form.otherCharges || 0);
  const discount = Number(form.discount || 0);
  const paid = Number(form.paid || 0);

  const total = Math.max(
    materialCost + labour + otherCharges - discount,
    0
  );

  const balance = Math.max(total - paid, 0);

  const submit = (e) => {
    e.preventDefault();

    if (!form.customer.trim()) {
      alert("Please enter customer name.");
      return;
    }

    if (!form.phone.trim()) {
      alert("Please enter phone number.");
      return;
    }

    if (total <= 0) {
      alert("Please enter at least one charge.");
      return;
    }

    if (paid > total) {
      alert("Advance cannot be greater than total.");
      return;
    }

    save({
      ...form,
      customer: form.customer.trim(),
      phone: form.phone.trim(),
      quantity: Number(form.quantity || 1),
      materialCost,
      labour,
      otherCharges,
      discount,
      amount: total,
      paid,
      balance,
    });
  };

  return (
    <Modal
      title="New Repair Job"
      subtitle="Create a complete upholstery repair job."
      close={close}
    >
      <form onSubmit={submit} className="new-job-form">
        <div className="job-form-section-title">
          <span>CUSTOMER</span>
          <p>Customer information</p>
        </div>

        <div className="modal-grid">
          <Field
            label="Customer name"
            value={form.customer}
            onChange={(v) => update("customer", v)}
            placeholder="Enter customer name"
          />
          <Field
            label="Phone number"
            value={form.phone}
            onChange={(v) => update("phone", v)}
            placeholder="+971 5X XXX XXXX"
          />
        </div>

        <div className="job-form-section-title">
          <span>ITEM & REPAIR</span>
          <p>What is being repaired or re-upholstered?</p>
        </div>

        <div className="modal-grid">
          <SelectField
            label="Item"
            value={form.item}
            onChange={(v) => update("item", v)}
            options={[
              "3-Seater Sofa",
              "2-Seater Sofa",
              "L-Shape Sofa",
              "Recliner",
              "Dining Chairs",
              "Office Chair",
              "Office Sofa",
              "Car Seat",
              "Headboard",
              "Ottoman",
              "Other",
            ]}
          />

          <Field
            label="Quantity"
            type="number"
            value={form.quantity}
            onChange={(v) => update("quantity", v)}
            placeholder="1"
          />

          <SelectField
            label="Repair / Work"
            value={form.work}
            onChange={(v) => update("work", v)}
            options={[
              "Full Leather Replacement",
              "Leather Repair",
              "Fabric Replacement",
              "Re-Upholstery",
              "Foam Replacement",
              "Repair & Stitching",
              "Frame Repair",
              "Polishing",
              "Multiple Repairs",
              "Other",
            ]}
          />

          <Field
            label="Item description"
            value={form.description}
            onChange={(v) => update("description", v)}
            placeholder="Describe the item or damage"
          />
        </div>

        <div className="job-form-section-title">
          <span>MATERIAL</span>
          <p>Material used for the repair</p>
        </div>

        <div className="modal-grid">
          <Field
            label="Material"
            value={form.material}
            onChange={(v) => update("material", v)}
            placeholder="Leather / Fabric / Foam"
          />
          <Field
            label="Colour"
            value={form.colour}
            onChange={(v) => update("colour", v)}
            placeholder="Black / Brown / Beige"
          />
          <Field
            label="Material cost"
            type="number"
            value={form.materialCost}
            onChange={(v) => update("materialCost", v)}
            placeholder="AED  0"
          />
        </div>

        <div className="job-form-section-title">
          <span>CHARGES</span>
          <p>Build the customer bill</p>
        </div>

        <div className="modal-grid">
          <Field
            label="Labour charge"
            type="number"
            value={form.labour}
            onChange={(v) => update("labour", v)}
            placeholder="AED  0"
          />
          <Field
            label="Other charges"
            type="number"
            value={form.otherCharges}
            onChange={(v) => update("otherCharges", v)}
            placeholder="AED  0"
          />
          <Field
            label="Discount"
            type="number"
            value={form.discount}
            onChange={(v) => update("discount", v)}
            placeholder="AED  0"
          />
        </div>

        <div className="job-form-summary">
          <div><span>Material</span><strong>{money(materialCost)}</strong></div>
          <div><span>Labour</span><strong>{money(labour)}</strong></div>
          <div><span>Other</span><strong>{money(otherCharges)}</strong></div>
          <div className="discount"><span>Discount</span><strong>-{money(discount)}</strong></div>
          <div className="summary-total"><span>TOTAL</span><strong>{money(total)}</strong></div>
        </div>

        <div className="job-form-section-title">
          <span>PAYMENT & DELIVERY</span>
          <p>Record advance and expected delivery</p>
        </div>

        <div className="modal-grid">
          <Field
            label="Advance paid"
            type="number"
            value={form.paid}
            onChange={(v) => update("paid", v)}
            placeholder="AED  0"
          />
          <Field
            label="Expected delivery"
            type="date"
            value={form.deliveryDate}
            onChange={(v) => update("deliveryDate", v)}
          />
        </div>

        <div className={`job-form-balance ${balance === 0 ? "clear" : ""}`}>
          <span>BALANCE DUE</span>
          <strong>{money(balance)}</strong>
        </div>

        <div className="job-form-notes">
          <label>Job notes</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Special instructions, damage details or customer requirements..."
          />
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            <Save size={16} />
            Create Repair Job
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================
   CUSTOMER MODAL
============================================================ */

function CustomerModal({ close, save, initial }) {
  const [form, setForm] = useState(initial || {name:"",phone:"",whatsapp:"",email:"",location:"",address:"",notes:""});
  const update=(k,v)=>setForm(f=>({...f,[k]:v}));
  return <Modal title={initial ? "Edit Customer" : "Add Customer"} subtitle="Create a complete customer profile for billing and workshop history." close={close}>
    <form onSubmit={e=>{e.preventDefault();if(!form.name.trim())return;save({...form,name:form.name.trim(),whatsapp:form.whatsapp.trim()||form.phone.trim()});}}>
      <div className="form-section-label"><span>CONTACT</span><small>Primary customer information</small></div>
      <div className="modal-grid"><Field label="Customer name *" value={form.name} onChange={v=>update("name",v)} placeholder="Full name / company"/><Field label="Phone" value={form.phone} onChange={v=>update("phone",v)} placeholder="+971 5X XXX XXXX"/><Field label="WhatsApp" value={form.whatsapp} onChange={v=>update("whatsapp",v)} placeholder="+971 5X XXX XXXX"/><Field label="Email" value={form.email} onChange={v=>update("email",v)} placeholder="customer@email.com"/></div>
      <div className="form-section-label"><span>ADDRESS</span><small>Useful for delivery and invoices</small></div>
      <div className="modal-grid"><Field label="Location / City" value={form.location} onChange={v=>update("location",v)} placeholder="Dubai / Sharjah"/><Field label="Full address" value={form.address} onChange={v=>update("address",v)} placeholder="Area, building, street"/></div>
      <label className="field"><span>Customer notes</span><textarea rows="3" value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="Preferences, measurements, delivery instructions..."/></label>
      <div className="modal-footer"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit"><Save size={16}/>{initial ? "Update Customer" : "Save Customer"}</button></div>
    </form>
  </Modal>;
}

/* ============================================================
   MATERIAL MODAL
============================================================ */

function MaterialModal({ close, save }) {
  const [form, setForm] = useState({
    name: "",
    category: "Leather",
    unit: "Meter",
    stock: "",
    price: "",
  });

  return (
    <Modal
      title="Add Material"
      subtitle="Add leather, fabric, foam or another workshop material."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();

          save({
            ...form,
            stock: Number(form.stock || 0),
            price: Number(form.price || 0),
          });
        }}
      >
        <div className="modal-grid">
          <Field
            label="Material name"
            value={form.name}
            onChange={(v) =>
              setForm({
                ...form,
                name: v,
              })
            }
            placeholder="Premium Black Leather"
          />

          <SelectField
            label="Category"
            value={form.category}
            onChange={(v) =>
              setForm({
                ...form,
                category: v,
              })
            }
            options={[
              "Leather",
              "Fabric",
              "Foam",
              "Accessories",
              "Other",
            ]}
          />

          <SelectField
            label="Unit"
            value={form.unit}
            onChange={(v) =>
              setForm({
                ...form,
                unit: v,
              })
            }
            options={[
              "Meter",
              "Sheet",
              "Piece",
              "Roll",
            ]}
          />

          <Field
            label="Current stock"
            type="number"
            value={form.stock}
            onChange={(v) =>
              setForm({
                ...form,
                stock: v,
              })
            }
            placeholder="0"
          />

          <Field
            label="Price"
            type="number"
            value={form.price}
            onChange={(v) =>
              setForm({
                ...form,
                price: v,
              })
            }
            placeholder="AED  0"
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={close}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
          >
            <Save size={16} />
            Save Material
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================
   SUPPLIER MODAL
============================================================ */

function SupplierModal({ close, save, initial }) {
  const [form,setForm]=useState(initial || {name:"",phone:"",email:"",material:"Leather",balance:"",location:"",address:"",notes:""});
  const update=(k,v)=>setForm(f=>({...f,[k]:v}));
  return <Modal title={initial ? "Edit Supplier" : "Add Supplier"} subtitle="Create a detailed supplier profile for procurement and payable tracking." close={close}><form onSubmit={e=>{e.preventDefault();if(!form.name.trim())return;save({...form,name:form.name.trim(),balance:Number(form.balance||0)});}}>
    <div className="form-section-label"><span>SUPPLIER CONTACT</span><small>Contact and material details</small></div>
    <div className="modal-grid"><Field label="Supplier name *" value={form.name} onChange={v=>update("name",v)} placeholder="Leather World"/><Field label="Phone" value={form.phone} onChange={v=>update("phone",v)} placeholder="+971 50 000 0000"/><Field label="Email" value={form.email} onChange={v=>update("email",v)} placeholder="sales@supplier.com"/><SelectField label="Material supplied" value={form.material} onChange={v=>update("material",v)} options={["Leather","Fabric","Foam","Accessories","Multiple Materials"]}/></div>
    <div className="form-section-label"><span>ACCOUNT</span><small>Opening payable and address</small></div>
    <div className="modal-grid"><Field label="Opening balance" type="number" value={form.balance} onChange={v=>update("balance",v)} placeholder="AED 0"/><Field label="Location / City" value={form.location} onChange={v=>update("location",v)} placeholder="Dubai"/><Field label="Full address" value={form.address} onChange={v=>update("address",v)} placeholder="Warehouse / office address"/></div>
    <label className="field"><span>Supplier notes</span><textarea rows="3" value={form.notes} onChange={e=>update("notes",e.target.value)} placeholder="Payment terms, contact person, delivery notes..."/></label>
    <div className="modal-footer"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button"><Save size={16}/>{initial ? "Update Supplier" : "Save Supplier"}</button></div>
  </form></Modal>;
}

/* ============================================================
   STAFF MODAL
============================================================ */

function StaffModal({ close, save, initial }) {
  const [form, setForm] = useState(
    initial || {
      name: "",
      role: "Upholsterer",
      username: "",
      password: "",
      isSuperAdmin: false,
      phone: "",
      email: "",
      address: "",
      emergencyContact: "",
      joiningDate: new Date().toISOString().slice(0, 10),
      bank: "",
      iban: "",
      salary: "",
      salaryPeriod: "Monthly",
      attendance: "100",
      performance: "100",
      status: "Active",
      notes: "",
    }
  );
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generateUsername = () => {
    if (!form.name.trim()) return alert("Enter staff name first.");
    const cleanName = form.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    update("username", cleanName);
  };

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let pass = "";
    for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    update("password", pass);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Staff name is required.");
    save({
      ...form,
      name: form.name.trim(),
      username: form.username ? form.username.trim() : form.name.trim().toLowerCase().replace(/[^a-z0-9]/g, ""),
      password: form.password || "staff123",
      salary: Number(form.salary || 0),
      attendance: Number(form.attendance || 0),
      performance: Number(form.performance || 0),
    });
  };

  return (
    <Modal
      title={initial ? "Edit Staff & Credentials" : "Add Staff & Credentials"}
      subtitle="Manage employee profile, login credentials, system permissions, and payroll."
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-section-label">
          <span>PERSONAL & CONTACT</span>
          <small>Employee information</small>
        </div>
        <div className="modal-grid">
          <Field label="Staff name *" value={form.name} onChange={(v) => update("name", v)} placeholder="Full name" />
          <SelectField label="Role" value={form.role} onChange={(v) => update("role", v)} options={["Upholsterer", "Master Upholsterer", "Leather Technician", "Stitching Specialist", "Foam Technician", "Helper", "Driver", "Manager", "Super Admin"]} />
          <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} placeholder="+971 50 000 0000" />
          <Field label="Email" value={form.email} onChange={(v) => update("email", v)} placeholder="staff@email.com" />
          <Field label="Address" value={form.address} onChange={(v) => update("address", v)} placeholder="Dubai, UAE" />
          <Field label="Emergency contact" value={form.emergencyContact} onChange={(v) => update("emergencyContact", v)} placeholder="Name · phone" />
        </div>

        <div className="form-section-label">
          <span>LOGIN & SYSTEM CREDENTIALS</span>
          <small>Set credentials for staff system login</small>
        </div>
        <div className="modal-grid">
          <div className="field-with-btn">
            <Field label="Login Username / ID" value={form.username || ""} onChange={(v) => update("username", v)} placeholder="e.g. mohammed" />
            <button type="button" className="field-action-btn" onClick={generateUsername}>Auto</button>
          </div>
          <div className="field-with-btn">
            <Field label="Login Password" value={form.password || ""} onChange={(v) => update("password", v)} placeholder="Set password" />
            <button type="button" className="field-action-btn" onClick={generatePassword}>Generate</button>
          </div>
          <SelectField label="System Role" value={form.isSuperAdmin ? "Super Admin" : "Staff Member"} onChange={(v) => update("isSuperAdmin", v === "Super Admin")} options={["Staff Member", "Super Admin"]} />
          <SelectField label="Account Status" value={form.status} onChange={(v) => update("status", v)} options={["Active", "On Leave", "Inactive", "Disabled"]} />
        </div>

        <div className="form-section-label">
          <span>PAYROLL</span>
          <small>Salary and bank details</small>
        </div>
        <div className="modal-grid">
          <Field label="Salary" type="number" value={form.salary} onChange={(v) => update("salary", v)} placeholder="AED 0" />
          <SelectField label="Salary period" value={form.salaryPeriod} onChange={(v) => update("salaryPeriod", v)} options={["Monthly", "Weekly", "Daily", "Hourly"]} />
          <Field label="Joining date" type="date" value={form.joiningDate} onChange={(v) => update("joiningDate", v)} />
          <Field label="Bank" value={form.bank} onChange={(v) => update("bank", v)} placeholder="Bank name" />
          <Field label="IBAN" value={form.iban} onChange={(v) => update("iban", v)} placeholder="AE..." />
        </div>

        <div className="form-section-label">
          <span>PERFORMANCE</span>
          <small>Track attendance and quality</small>
        </div>
        <div className="modal-grid">
          <Field label="Attendance %" type="number" value={form.attendance} onChange={(v) => update("attendance", v)} placeholder="100" />
          <Field label="Performance %" type="number" value={form.performance} onChange={(v) => update("performance", v)} placeholder="100" />
        </div>

        <label className="field">
          <span>Staff notes</span>
          <textarea rows="3" value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Skills, responsibilities, credentials remarks..." />
        </label>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={close}>Cancel</button>
          <button type="submit" className="primary-button"><Save size={16} /> {initial ? "Update Staff" : "Save Staff"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================
   MODAL BASE
============================================================ */

function Modal({
  title,
  subtitle,
  close,
  children,
}) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-head">
          <div>
            <span>AL KANZ WORKSHOP</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button
            className="modal-close"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label className="field">
      <span>{label}</span>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
      >
        {options.map((option) => (
          <option key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ============================================================
   COMPLETE CSS
============================================================ */

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap');

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #f3f7f8;
  --white: #ffffff;
  --soft: #f8fbfb;

  --green: #166b5f;
  --green-dark: #0d5047;
  --green-light: #e4f3ef;

  --sidebar: #0d3d37;
  --sidebar-2: #104941;
  --sidebar-text: #b7d1cc;

  --text: #17282b;
  --text-2: #52676b;
  --muted: #8a9a9d;

  --border: #e1e9ea;

  --blue: #387aaa;
  --blue-light: #e8f2f8;

  --orange: #b9792f;
  --orange-light: #fff1dc;

  --purple: #7557a4;
  --purple-light: #f0eafa;

  --red: #b65d58;
  --red-light: #fae9e7;

  --shadow: 0 8px 30px rgba(20, 53, 57, .055);
}

html,
body,
#root {
  width: 100%;
  min-height: 100%;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: "DM Sans", sans-serif;
  -webkit-font-smoothing: antialiased;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
  border: 0;
}

.app {
  min-height: 100vh;
  display: flex;
}

/* SIDEBAR */

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 250px;
  background: var(--sidebar);
  color: var(--sidebar-text);
  display: flex;
  flex-direction: column;
  z-index: 50;
}

.brand-area {
  padding: 25px 18px 18px;
  border-bottom: 1px solid rgba(255,255,255,.07);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 43px;
  height: 43px;
  border-radius: 13px;
  background: #b9df79;
  color: #17483f;
  display: grid;
  place-items: center;
}

.brand strong {
  display: block;
  color: #fff;
  font-family: "Manrope";
  font-size: 14px;
  letter-spacing: .08em;
}

.brand span {
  display: block;
  margin-top: 3px;
  color: #7da39c;
  font-size: 9px;
  letter-spacing: .2em;
  font-weight: 700;
}

.workshop-status {
  height: 38px;
  margin-top: 21px;
  border-radius: 10px;
  background: rgba(255,255,255,.06);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  color: #c9dfdb;
  font-size: 10px;
  font-weight: 700;
}

.workshop-status span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a9db69;
  box-shadow: 0 0 0 4px rgba(169,219,105,.1);
}

.nav-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 23px 12px;
}

.nav-group {
  margin-bottom: 22px;
}

.nav-section-title {
  padding: 0 12px 9px;
  color: #70958f;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .2em;
}

.nav-item {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 11px;
  border-radius: 10px;
  background: transparent;
  color: #b7cfcb;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  transition: .2s;
}

.nav-item:hover {
  background: var(--sidebar-2);
  color: white;
}

.nav-item.selected {
  color: white;
  background: #1a6055;
  box-shadow: inset 3px 0 #b9df79;
}

.nav-item svg:last-child {
  margin-left: auto;
}

.chevron-open {
  transform: rotate(180deg);
}

.sub-menu {
  padding: 4px 0 5px 41px;
}

.sub-menu button {
  width: 100%;
  height: 33px;
  background: transparent;
  color: #82a7a0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  text-align: left;
}

.sub-menu button:hover,
.sub-menu button.sub-selected {
  color: #fff;
}

.sub-menu button > span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #517b74;
}

.sub-menu button.sub-selected > span {
  background: #b9df79;
}

.sidebar-account {
  padding: 14px;
  border-top: 1px solid rgba(255,255,255,.07);
}

.account-card {
  min-height: 53px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px;
  border-radius: 11px;
  background: rgba(255,255,255,.06);
}

.account-avatar {
  width: 33px;
  height: 33px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #b9df79;
  color: #17483f;
  font-size: 9px;
  font-weight: 800;
}

.account-card > div:nth-child(2) {
  flex: 1;
  min-width: 0;
}

.account-card strong,
.account-card span {
  display: block;
}

.account-card strong {
  color: white;
  font-size: 9px;
}

.account-card span {
  color: #7fa49d;
  margin-top: 2px;
  font-size: 8px;
}

.logout {
  width: 100%;
  height: 33px;
  margin-top: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 7px;
  background: transparent;
  color: #86a8a2;
  border-radius: 9px;
  font-size: 9px;
  font-weight: 700;
}

.logout:hover {
  background: rgba(255,255,255,.06);
  color: white;
}

.mobile-close,
.mobile-menu {
  display: none;
}

/* MAIN */

.main {
  width: calc(100% - 250px);
  margin-left: 250px;
  min-height: 100vh;
}

.topbar {
  height: 72px;
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(255,255,255,.94);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
  padding: 0 34px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.topbar-left,
.topbar-right,
.breadcrumb,
.admin-profile {
  display: flex;
  align-items: center;
}

.breadcrumb {
  gap: 7px;
  font-size: 10px;
  color: var(--muted);
}

.breadcrumb strong {
  color: var(--text);
}

.topbar-right {
  gap: 16px;
}

.global-search {
  width: 315px;
  height: 39px;
  border: 1px solid var(--border);
  background: #f8fafb;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  color: #819396;
}

.global-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 10px;
}

.global-search input::placeholder {
  color: #99a7aa;
}

.global-search kbd {
  padding: 3px 6px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 8px;
  color: #8b999c;
}

.notification {
  width: 37px;
  height: 37px;
  position: relative;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: transparent;
  color: #667c80;
}

.notification:hover {
  background: #eef4f4;
}

.notification i {
  position: absolute;
  width: 5px;
  height: 5px;
  background: #db7163;
  border-radius: 50%;
  right: 9px;
  top: 8px;
}

.admin-menu-wrap {
  position: relative;
}

.admin-profile {
  gap: 8px;
  padding: 3px 5px;
  background: transparent;
  border-radius: 10px;
  color: var(--text);
}

.admin-profile:hover {
  background: #eef4f4;
}

.admin-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 175px;
  padding: 6px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 35px rgba(20, 53, 57, .15);
  z-index: 100;
}

.admin-dropdown button {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  font-size: 10px;
  text-align: left;
}

.admin-dropdown button:hover {
  background: var(--green-light);
  color: var(--green);
}

.admin-profile > div {
  width: 35px;
  height: 35px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #e2f1eb;
  color: var(--green);
  font-size: 9px;
  font-weight: 800;
}

.admin-profile section strong,
.admin-profile section span {
  display: block;
}

.admin-profile section strong {
  font-size: 10px;
}

.admin-profile section span {
  margin-top: 2px;
  color: var(--muted);
  font-size: 8px;
}

/* CONTENT */

.content {
  max-width: 1500px;
  margin: auto;
  padding: 34px 40px 70px;
}

.page-heading,
.page-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 24px;
}

.eyebrow {
  color: #6e898d;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .2em;
}

.page-heading h1,
.page-title h1 {
  margin-top: 8px;
  font-family: "Manrope";
  color: var(--text);
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -.035em;
}

.page-heading p,
.page-title p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 11px;
}

.primary-button {
  min-height: 41px;
  padding: 0 16px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--green);
  color: white;
  font-size: 10px;
  font-weight: 800;
  box-shadow: 0 6px 16px rgba(22,107,95,.17);
  transition: .2s;
}

.primary-button:hover {
  background: var(--green-dark);
  transform: translateY(-1px);
}

/* HERO */

.hero {
  min-height: 235px;
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 35px 40px;
  background: linear-gradient(115deg,#0d4c43,#16695c 65%,#258171);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 16px 35px rgba(16,79,69,.13);
}

.hero-text {
  position: relative;
  z-index: 3;
}

.hero-text > span {
  color: #a7d2c9;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .2em;
}

.hero-text h2 {
  margin-top: 9px;
  color: white;
  font-family: "Manrope";
  font-size: 27px;
  line-height: 1.18;
  letter-spacing: -.035em;
}

.hero-text p {
  max-width: 500px;
  margin-top: 9px;
  color: #c7dfdb;
  font-size: 11px;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 9px;
  margin-top: 21px;
}

.hero-actions button {
  height: 35px;
  padding: 0 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,.12);
  color: white;
  font-size: 9px;
  font-weight: 700;
}

.hero-actions button:first-child {
  background: #c2e982;
  color: #173f37;
}

.hero-visual {
  width: 300px;
  height: 200px;
  position: relative;
  margin-right: 25px;
}

.hero-ring {
  position: absolute;
  border: 1px solid rgba(203,239,161,.22);
  border-radius: 50%;
}

.ring-one {
  width: 185px;
  height: 185px;
  right: 10px;
  top: 7px;
}

.ring-two {
  width: 250px;
  height: 250px;
  right: -25px;
  top: -25px;
}

.hero-sofa {
  position: absolute;
  right: 75px;
  top: 57px;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(213,241,176,.28);
  display: grid;
  place-items: center;
  color: #c7e990;
}

.floating-icon {
  width: 35px;
  height: 35px;
  border-radius: 10px;
  background: rgba(255,255,255,.09);
  border: 1px solid rgba(255,255,255,.1);
  display: grid;
  place-items: center;
  color: #c5e88d;
  position: absolute;
}

.icon-a {
  right: 36px;
  top: 18px;
}

.icon-b {
  right: 204px;
  top: 30px;
}

.icon-c {
  right: 210px;
  bottom: 24px;
}

/* STATS */

.stats {
  display: grid;
  grid-template-columns: repeat(4,1fr);
  gap: 14px;
  margin-top: 17px;
}

.stat {
  min-height: 108px;
  padding: 18px;
  border: 1px solid var(--border);
  background: white;
  border-radius: 14px;
  display: flex;
  gap: 12px;
  box-shadow: var(--shadow);
}

.stat-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 10px;
  display: grid;
  place-items: center;
}

.stat > div:last-child span,
.stat > div:last-child strong,
.stat > div:last-child small {
  display: block;
}

.stat span {
  color: var(--text-2);
  font-size: 9px;
  font-weight: 700;
}

.stat strong {
  margin-top: 5px;
  color: var(--text);
  font-family: "Manrope";
  font-size: 19px;
}

.stat small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 8px;
}

.stat.green .stat-icon {
  background: var(--green-light);
  color: var(--green);
}

.stat.blue .stat-icon {
  background: var(--blue-light);
  color: var(--blue);
}

.stat.orange .stat-icon {
  background: var(--orange-light);
  color: var(--orange);
}

.stat.purple .stat-icon {
  background: var(--purple-light);
  color: var(--purple);
}

/* CARDS */

.two-column {
  display: grid;
  grid-template-columns: minmax(0,1.7fr) minmax(300px,.8fr);
  gap: 17px;
  margin-top: 17px;
}

.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.card-header {
  padding: 20px 21px 15px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.card-header > div > span {
  color: #779094;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .18em;
}

.card-header h2 {
  margin-top: 5px;
  color: var(--text);
  font-family: "Manrope";
  font-size: 15px;
}

.card-header p {
  margin-top: 4px;
  color: var(--muted);
  font-size: 8px;
}

.text-button {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  color: var(--green);
  font-size: 9px;
  font-weight: 800;
}

/* JOB LIST */

.job-list {
  padding: 0 20px 7px;
}

.job-card {
  min-height: 104px;
  padding: 14px 1px;
  border-top: 1px solid #edf1f2;
  display: flex;
  align-items: center;
  gap: 11px;
}

.job-product-icon {
  width: 39px;
  height: 39px;
  border-radius: 10px;
  flex-shrink: 0;
  background: #e8f3f1;
  color: var(--green);
  display: grid;
  place-items: center;
}

.job-main {
  flex: 1;
  min-width: 0;
}

.job-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.job-top > strong {
  color: var(--text);
  font-size: 10px;
}

.job-main p {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 8px;
}

.status {
  padding: 4px 7px;
  border-radius: 5px;
  font-size: 7px;
  font-weight: 800;
  white-space: nowrap;
}

.status.in-progress {
  background: #fff0d7;
  color: #936d29;
}

.status.ready,
.status.paid,
.status.income {
  background: #e1f3ed;
  color: #267566;
}

.status.delivered {
  background: #e5f1f7;
  color: #3b7195;
}

.status.part-paid {
  background: #fff0d7;
  color: #956f29;
}

.status.unpaid,
.status.expense {
  background: #fae8e6;
  color: #a75c56;
}

.progress {
  height: 5px;
  margin-top: 11px;
  border-radius: 10px;
  background: #e9eeee;
  overflow: hidden;
}

.progress span {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: linear-gradient(90deg,#278879,#67b6a5);
}

.job-main small {
  display: block;
  margin-top: 4px;
  color: #94a1a3;
  font-size: 7px;
}

.job-money {
  min-width: 92px;
  text-align: right;
}

.job-money strong,
.job-money span,
.job-money small {
  display: block;
}

.job-money strong {
  color: var(--text);
  font-size: 10px;
}

.job-money span {
  margin-top: 4px;
  color: #9ba7a9;
  font-size: 7px;
}

.job-money small {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 7px;
}

.job-money small.paid {
  color: var(--green);
}

.dots {
  width: 27px;
  height: 27px;
  background: transparent;
  color: #9ba8aa;
}

/* QUICK ACTION */

.quick-actions {
  padding: 0 20px 12px;
}

.quick-action {
  width: 100%;
  min-height: 62px;
  border-top: 1px solid #edf1f2;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}

.quick-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #edf6f4;
  color: var(--green);
  display: grid;
  place-items: center;
}

.quick-action > div:nth-child(2) {
  flex: 1;
}

.quick-action strong,
.quick-action span {
  display: block;
}

.quick-action strong {
  color: var(--text);
  font-size: 9px;
}

.quick-action span {
  margin-top: 3px;
  color: var(--muted);
  font-size: 7px;
}

.quick-action > svg {
  color: #9ba8aa;
}

.quick-action:hover .quick-icon {
  background: var(--green);
  color: white;
}

/* SCHEDULE */

.schedule {
  min-height: 60px;
  margin: 0 20px;
  border-top: 1px solid #edf1f2;
  display: flex;
  align-items: center;
  gap: 12px;
}

.schedule-time {
  width: 53px;
  color: #859598;
  font-size: 7px;
}

.schedule-dot {
  width: 5px;
  height: 5px;
  background: #4e9c8b;
  border-radius: 50%;
}

.schedule > div:nth-child(3) {
  flex: 1;
}

.schedule strong,
.schedule span {
  display: block;
}

.schedule strong {
  color: var(--text);
  font-size: 9px;
}

.schedule > div span {
  margin-top: 3px;
  color: var(--muted);
  font-size: 7px;
}

.schedule label {
  padding: 5px 7px;
  border-radius: 5px;
  background: #edf4f4;
  color: #60787b;
  font-size: 7px;
  font-weight: 700;
}

/* FINANCE */

.finance-number {
  padding: 2px 21px 13px;
}

.finance-number span,
.finance-number strong {
  display: block;
}

.finance-number span {
  color: var(--muted);
  font-size: 8px;
}

.finance-number strong {
  margin-top: 4px;
  color: var(--text);
  font-family: "Manrope";
  font-size: 23px;
}

.large-progress {
  height: 7px;
  margin: 0 21px;
  border-radius: 10px;
  background: #edf2f2;
  overflow: hidden;
}

.large-progress span {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: #4e9d8d;
}

.finance-meta {
  display: flex;
  justify-content: space-between;
  padding: 8px 21px 14px;
  color: var(--muted);
  font-size: 7px;
}

.finance-meta strong {
  color: var(--orange);
}

.recent-payments {
  border-top: 1px solid #edf1f2;
  padding: 0 20px;
}

.payment {
  min-height: 54px;
  border-bottom: 1px solid #edf1f2;
  display: flex;
  align-items: center;
  gap: 9px;
}

.payment:last-child {
  border-bottom: 0;
}

.payment-avatar {
  width: 29px;
  height: 29px;
  border-radius: 8px;
  background: #eaf2f3;
  color: #55777a;
  display: grid;
  place-items: center;
  font-size: 7px;
  font-weight: 800;
}

.payment > div:nth-child(2) {
  flex: 1;
}

.payment strong,
.payment span {
  display: block;
}

.payment > div:nth-child(2) strong {
  font-size: 8px;
}

.payment span {
  margin-top: 2px;
  color: var(--muted);
  font-size: 7px;
}

.payment > b {
  color: var(--green);
  font-size: 8px;
}

/* PAGE TOOLBAR */

.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.filter-search {
  width: 330px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: white;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  color: #899a9d;
}

.filter-search input {
  flex: 1;
  border: 0;
  outline: 0;
  font-size: 10px;
}

.filter-button {
  height: 40px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: white;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 9px;
}

/* TABLE */

.table-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 15px;
  overflow-x: auto;
  box-shadow: var(--shadow);
}

.table-head,
.table-row {
  min-width: 850px;
  display: grid;
  grid-template-columns: 100px 1.2fr 1.4fr 120px 120px 120px 45px;
  align-items: center;
}

.table-head {
  min-height: 43px;
  padding: 0 20px;
  background: #f8fafb;
  border-bottom: 1px solid var(--border);
  color: #849396;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: .12em;
}

.table-row {
  min-height: 75px;
  padding: 0 20px;
  border-bottom: 1px solid #edf1f2;
  color: var(--text-2);
  font-size: 9px;
}

.table-row:last-child {
  border-bottom: 0;
}

.table-row > strong {
  color: var(--text);
  font-size: 9px;
}

.table-row > div strong,
.table-row > div small {
  display: block;
}

.table-row > div small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 7px;
}

.row-action {
  width: 29px;
  height: 29px;
  border-radius: 7px;
  background: #f1f5f5;
  color: #637a7d;
  display: grid;
  place-items: center;
}

.income {
  color: var(--green) !important;
}

.expense {
  color: var(--red) !important;
}

.empty {
  min-height: 250px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  color: #8b9a9d;
}

.empty strong {
  color: var(--text);
  font-size: 12px;
}

.empty span {
  font-size: 9px;
}

/* CUSTOMERS */

.customer-grid,
.material-grid,
.staff-grid,
.report-grid {
  display: grid;
  grid-template-columns: repeat(3,1fr);
  gap: 15px;
}

.customer-card,
.material-card,
.staff-card,
.report-box {
  background: white;
  border: 1px solid var(--border);
  border-radius: 15px;
  box-shadow: var(--shadow);
}

.customer-card {
  padding: 19px;
}

.customer-top {
  display: flex;
  justify-content: space-between;
}

.customer-avatar,
.staff-avatar {
  width: 43px;
  height: 43px;
  border-radius: 12px;
  background: #e3f2ef;
  color: var(--green);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 800;
}

.customer-card h3 {
  margin-top: 14px;
  font-family: "Manrope";
  font-size: 13px;
}

.customer-detail {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
  font-size: 8px;
}

.customer-stats {
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid #edf1f2;
  display: flex;
  gap: 30px;
}

.customer-stats span,
.customer-stats strong {
  display: block;
}

.customer-stats span {
  color: var(--muted);
  font-size: 7px;
}

.customer-stats strong {
  margin-top: 4px;
  color: var(--text);
  font-size: 10px;
}

/* MATERIAL */

.material-grid {
  grid-template-columns: repeat(2,1fr);
}

.material-card {
  padding: 17px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.material-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #eaf3f1;
  color: var(--green);
  display: grid;
  place-items: center;
}

.material-info {
  flex: 1;
}

.material-info > span {
  color: var(--green);
  font-size: 7px;
  font-weight: 800;
  text-transform: uppercase;
}

.material-info h3 {
  margin-top: 4px;
  font-size: 11px;
}

.material-info p {
  margin-top: 3px;
  color: var(--muted);
  font-size: 8px;
}

.stock {
  text-align: right;
}

.stock strong,
.stock span {
  display: block;
}

.stock strong {
  color: var(--text);
  font-size: 16px;
}

.stock span {
  color: var(--muted);
  font-size: 7px;
}

.low-stock strong {
  color: var(--red);
}

.delete-small {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: #faeeee;
  color: #ae6761;
}

/* STAFF */

.staff-grid {
  grid-template-columns: repeat(3,1fr);
}

.staff-card {
  padding: 21px;
}

.staff-card h3 {
  margin-top: 13px;
  font-family: "Manrope";
  font-size: 13px;
}

.staff-card p {
  margin-top: 4px;
  color: var(--green);
  font-size: 9px;
  font-weight: 700;
}

.staff-card > span {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 8px;
}

.staff-card label {
  display: inline-block;
  margin-top: 13px;
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 7px;
  font-weight: 800;
}

.staff-active {
  color: #267466;
  background: #e1f3ed;
}

.staff-leave {
  color: #9b7029;
  background: #fff0d7;
}

/* BILLING */

.billing-stats {
  display: grid;
  grid-template-columns: repeat(4,1fr);
  gap: 14px;
  margin-bottom: 17px;
}

.invoice-head {
  grid-template-columns: 110px 1.4fr 130px 130px 130px 120px;
}

.invoice-head + .table-row {
  grid-template-columns: 110px 1.4fr 130px 130px 130px 120px;
}

/* REPORTS */

.report-grid {
  grid-template-columns: repeat(4,1fr);
}

.report-box {
  padding: 20px;
}

.report-box > div {
  width: 37px;
  height: 37px;
  border-radius: 9px;
  background: var(--green-light);
  color: var(--green);
  display: grid;
  place-items: center;
}

.report-box > span {
  display: block;
  margin-top: 15px;
  color: var(--text-2);
  font-size: 9px;
}

.report-box > strong {
  display: block;
  margin-top: 5px;
  font-family: "Manrope";
  font-size: 21px;
}

.report-box > small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
  font-size: 7px;
}

.report-chart {
  margin-top: 17px;
  padding-bottom: 20px;
}

.bars {
  height: 270px;
  margin: 15px 25px 0;
  padding: 20px 10px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  gap: 18px;
}

.bar-wrap {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}

.bar {
  width: 100%;
  max-width: 42px;
  min-height: 10px;
  border-radius: 7px 7px 0 0;
  background: linear-gradient(#5bb0a0,#1d7568);
}

.bar-wrap span {
  margin-top: 8px;
  color: var(--muted);
  font-size: 7px;
}

/* ACCOUNTS */

.account-tabs {
  margin-bottom: 17px;
  padding: 5px;
  width: fit-content;
  border-radius: 9px;
  background: #eaf0f1;
  display: flex;
  gap: 4px;
}

.account-tabs button {
  padding: 8px 13px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-size: 9px;
  font-weight: 700;
}

.account-tabs button.active {
  background: white;
  color: var(--green);
  box-shadow: 0 2px 8px rgba(0,0,0,.05);
}

.account-overview {
  display: grid;
  grid-template-columns: repeat(3,1fr);
  gap: 15px;
  margin-bottom: 17px;
}

.account-big-card {
  padding: 21px;
  border-radius: 14px;
  background: var(--green);
  color: white;
}

.account-big-card:nth-child(2) {
  background: #315d79;
}

.account-big-card:nth-child(3) {
  background: #71578f;
}

.account-big-card span,
.account-big-card strong,
.account-big-card small {
  display: block;
}

.account-big-card span {
  color: rgba(255,255,255,.7);
  font-size: 8px;
}

.account-big-card strong {
  margin-top: 8px;
  font-family: "Manrope";
  font-size: 23px;
}

.account-big-card small {
  margin-top: 5px;
  color: rgba(255,255,255,.62);
  font-size: 7px;
}

/* SETTINGS */

.settings-layout {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 17px;
  align-items: start;
}

.settings-menu {
  grid-column: 1;
  grid-row: 1 / span 2;
}

.settings-card {
  grid-column: 2;
  grid-row: 1;
}

.appearance-card {
  grid-column: 2;
  grid-row: 2;
}

.settings-menu {
  padding: 9px;
  height: fit-content;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: white;
}

.settings-menu button {
  width: 100%;
  height: 40px;
  padding: 0 11px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: transparent;
  color: var(--text-2);
  font-size: 9px;
  text-align: left;
}

.settings-menu button.active,
.settings-menu button:hover {
  color: var(--green);
  background: var(--green-light);
}

.settings-card {
  min-height: 400px;
}

.settings-form {
  padding: 0 21px 25px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.settings-form label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--text-2);
  font-size: 8px;
  font-weight: 800;
}

.settings-form input {
  height: 39px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 11px;
  background: #f8fafb;
  color: var(--text);
  font-size: 9px;
}

.settings-form .primary-button {
  width: fit-content;
}

/* MODAL */

.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(13,35,37,.5);
  backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  padding: 20px;
}

.modal {
  width: min(720px,100%);
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 18px;
  background: white;
  box-shadow: 0 30px 90px rgba(0,0,0,.22);
}

.modal-head {
  padding: 23px 25px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
}

.modal-head > div > span {
  color: var(--green);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .18em;
}

.modal-head h2 {
  margin-top: 5px;
  font-family: "Manrope";
  font-size: 21px;
}

.modal-head p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 9px;
}

.modal-close {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #f0f4f4;
  color: #617376;
  display: grid;
  place-items: center;
}

.modal-grid {
  padding: 23px 25px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field span {
  color: #52676a;
  font-size: 8px;
  font-weight: 800;
}

.field input,
.field select {
  height: 40px;
  width: 100%;
  border: 1px solid #dce6e7;
  outline: none;
  border-radius: 8px;
  padding: 0 11px;
  background: #f9fbfb;
  color: var(--text);
  font-size: 9px;
}

.field input:focus,
.field select:focus {
  border-color: #55a295;
  box-shadow: 0 0 0 3px rgba(85,162,149,.1);
  background: white;
}

.modal-footer {
  padding: 15px 25px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.secondary-button {
  min-height: 41px;
  padding: 0 15px;
  border-radius: 9px;
  background: #edf2f2;
  color: #53686b;
  font-size: 9px;
  font-weight: 800;
}

/* RESPONSIVE */

@media(max-width:1150px) {
  .sidebar {
    width: 220px;
  }

  .main {
    width: calc(100% - 220px);
    margin-left: 220px;
  }

  .content {
    padding: 28px 24px 60px;
  }

  .hero-visual {
    transform: scale(.85);
    margin-right: 0;
  }

  .stats {
    grid-template-columns: repeat(2,1fr);
  }

  .two-column {
    grid-template-columns: 1fr;
  }

  .report-grid,
  .customer-grid,
  .staff-grid {
    grid-template-columns: repeat(2,1fr);
  }
}

@media(max-width:850px) {
  .sidebar {
    width: 250px;
    transform: translateX(-100%);
    transition: .25s;
    box-shadow: 15px 0 40px rgba(0,0,0,.15);
  }

  .sidebar.sidebar-open {
    transform: translateX(0);
  }

  .mobile-close {
    display: block;
    margin-left: auto;
    background: transparent;
    color: white;
  }

  .brand {
    padding-right: 5px;
  }

  .main {
    width: 100%;
    margin-left: 0;
  }

  .mobile-menu {
    display: grid;
    place-items: center;
    width: 37px;
    height: 37px;
    border-radius: 8px;
    background: #edf3f3;
    color: var(--text);
    margin-right: 10px;
  }

  .breadcrumb {
    display: none;
  }

  .topbar {
    padding: 0 18px;
  }

  .global-search {
    width: 250px;
  }

  .hero-visual {
    display: none;
  }

  .hero {
    padding: 30px;
  }
}

@media(max-width:620px) {
  .content {
    padding: 22px 14px 50px;
  }

  .topbar {
    height: 64px;
  }

  .admin-profile section,
  .admin-profile > svg {
    display: none;
  }

  .global-search {
    width: 170px;
  }

  .global-search kbd {
    display: none;
  }

  .page-heading,
  .page-title {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .page-heading h1,
  .page-title h1 {
    font-size: 24px;
  }

  .stats,
  .report-grid,
  .customer-grid,
  .staff-grid,
  .account-overview,
  .material-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    padding: 25px;
  }

  .hero-text h2 {
    font-size: 23px;
  }

  .hero-actions {
    flex-wrap: wrap;
  }

  .job-money {
    display: none;
  }

  .toolbar {
    flex-direction: column;
  }

  .filter-search {
    width: 100%;
  }

  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-menu,
  .settings-card,
  .appearance-card {
    grid-column: 1;
    grid-row: auto;
  }

  .settings-form {
    grid-template-columns: 1fr;
  }

  .modal-grid {
    grid-template-columns: 1fr;
  }
}

/* THEMES + SIDEBAR COLLAPSE */
.app.theme-light {
  --bg:#f7f9fb; --white:#fff; --soft:#fbfcfd; --green:#176f62;
  --green-dark:#0e544a; --green-light:#e6f5f1; --sidebar:#174b45;
  --sidebar-2:#216158; --text:#18272b; --text-2:#53666a; --muted:#8b989b;
  --border:#e2e8eb;
}
.app.theme-dark {
  --bg:#111817; --white:#1a2422; --soft:#202b29; --green:#67c5a8;
  --green-dark:#49a88e; --green-light:#1d3b34; --sidebar:#091f1c;
  --sidebar-2:#123a34; --sidebar-text:#b6cbc6; --text:#edf5f2;
  --text-2:#b3c3bf; --muted:#849692; --border:#30403d;
  --blue:#78b5dc; --blue-light:#1c3443; --orange:#d6a15e;
  --orange-light:#3c3020; --purple:#a98bd0; --purple-light:#302741;
  --red:#e08b83; --red-light:#3c2927; --shadow:0 8px 30px rgba(0,0,0,.25);
}
.app.theme-dark .topbar { background:rgba(26,36,34,.94); }
.app.theme-dark .card,.app.theme-dark .jobs-modern-card,.app.theme-dark .table-card,
.app.theme-dark .modal,.app.theme-dark .job-drawer,.app.theme-dark .settings-card,
.app.theme-dark .appearance-card { background:var(--white); border-color:var(--border); color:var(--text); }
.app.theme-dark .global-search,.app.theme-dark .jobs-search-modern,.app.theme-dark .jobs-status-filter,
.app.theme-dark .field input,.app.theme-dark .field select,.app.theme-dark .settings-form input {
  background:#202b29; color:var(--text); border-color:var(--border);
}
.app.theme-dark .jobs-page-header h1,.app.theme-dark .jobs-breadcrumb strong,
.app.theme-dark .card h2,.app.theme-dark .page-title h1 { color:var(--text); }
.app.theme-dark .jobs-page-header p,.app.theme-dark .jobs-eyebrow,
.app.theme-dark .jobs-breadcrumb,.app.theme-dark .card-header p,.app.theme-dark .page-title p { color:var(--muted); }

.sidebar-overlay { display:none; }
.mobile-menu { width:38px;height:38px;display:grid;place-items:center;border-radius:9px;background:transparent;color:#667c80; }
.mobile-menu:hover { background:#eef4f4; }

@media(min-width:851px) {
  .sidebar-collapsed .sidebar { width:78px; }
  .sidebar-collapsed .main { width:calc(100% - 78px); margin-left:78px; }
  .sidebar-collapsed .brand-area { padding-left:17px; padding-right:17px; }
  .sidebar-collapsed .brand > div:last-child,.sidebar-collapsed .workshop-status,
  .sidebar-collapsed .nav-section-title,.sidebar-collapsed .nav-item > span,
  .sidebar-collapsed .nav-item > svg:last-child,.sidebar-collapsed .sub-menu,
  .sidebar-collapsed .account-card > div:not(.account-avatar),
  .sidebar-collapsed .account-card > svg,.sidebar-collapsed .logout { display:none; }
  .sidebar-collapsed .brand { justify-content:center; }
  .sidebar-collapsed .nav-scroll { padding-left:10px;padding-right:10px; }
  .sidebar-collapsed .nav-item { justify-content:center;padding:0; }
  .sidebar-collapsed .sidebar-account { padding:12px 10px; }
  .sidebar-collapsed .account-card { justify-content:center; }
}
.theme-options { display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0 25px 25px; }
.theme-option { min-height:84px;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--soft);color:var(--text);display:flex;align-items:center;gap:11px;text-align:left;transition:.2s; }
.theme-option:hover { border-color:var(--green);transform:translateY(-1px); }
.theme-option.active { border-color:var(--green);box-shadow:0 0 0 2px var(--green-light); }
.theme-option > div { flex:1; }
.theme-option strong,.theme-option small { display:block; }
.theme-option strong { font-size:12px; }
.theme-option small { margin-top:3px;color:var(--muted);font-size:10px; }
.theme-preview { width:38px;height:38px;flex:0 0 38px;border-radius:9px;border:1px solid var(--border); }
.theme-preview-default { background:linear-gradient(135deg,#0d3d37 0 50%,#b9df79 50%); }
.theme-preview-light { background:linear-gradient(135deg,#fff 0 50%,#e6f5f1 50%); }
.theme-preview-dark { background:linear-gradient(135deg,#091f1c 0 50%,#67c5a8 50%); }
@media(max-width:850px) {
  .sidebar-overlay { display:block;position:fixed;inset:0;z-index:45;border:0;background:rgba(0,0,0,.35); }
  .sidebar { width:250px; }
  .theme-options { grid-template-columns:1fr; }
}

`;


/* ============================================================
   AL KANZ MODERN JOBS UI OVERRIDES
============================================================ */

const AL_KANZ_JOB_UI = `
.jobs-page-modern {
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
}
.jobs-page-header {
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:24px;
  margin-bottom:28px;
}
.jobs-breadcrumb { display:flex; align-items:center; gap:7px; color:#87958f; font-size:13px; margin-bottom:14px; }
.jobs-breadcrumb strong { color:#31413a; }
.jobs-eyebrow { color:#75857e; font-size:11px; font-weight:800; letter-spacing:1.6px; margin-bottom:8px; }
.jobs-page-header h1 { margin:0; font-size:34px; line-height:1.1; color:#13251d; letter-spacing:-.8px; }
.jobs-page-header p { margin:8px 0 0; color:#7d8d86; font-size:15px; }
.jobs-new-button { border:0; border-radius:11px; padding:13px 18px; background:#087653; color:#fff; font-size:14px; font-weight:800; display:flex; align-items:center; gap:8px; cursor:pointer; box-shadow:0 8px 22px rgba(8,118,83,.18); }
.jobs-toolbar-modern { display:flex; gap:12px; margin-bottom:16px; }
.jobs-search-modern { height:48px; width:370px; background:#fff; border:1px solid #dce7e2; border-radius:10px; display:flex; align-items:center; gap:10px; padding:0 14px; color:#82918a; }
.jobs-search-modern input { border:0; outline:0; width:100%; background:transparent; font-size:14px; color:#17251f; }
.jobs-search-modern button { border:0; background:transparent; color:#82918a; font-size:22px; cursor:pointer; }
.jobs-status-filter { height:48px; border:1px solid #dce7e2; background:#fff; border-radius:10px; padding:0 14px; font-size:14px; color:#35463e; outline:none; }
.jobs-modern-card { background:#fff; border:1px solid #dce7e2; border-radius:15px; overflow:hidden; box-shadow:0 5px 18px rgba(15,45,34,.035); }
.jobs-modern-head,.jobs-modern-row { display:grid; grid-template-columns:1.05fr 1.35fr 1.75fr 1.05fr .8fr .8fr .45fr; align-items:center; }
.jobs-modern-head { min-height:52px; padding:0 20px; background:#f8faf9; border-bottom:1px solid #e7eeeb; color:#84928c; font-size:11px; font-weight:800; letter-spacing:.8px; }
.jobs-modern-row { min-height:92px; padding:0 20px; border-bottom:1px solid #edf2ef; }
.jobs-modern-row:hover { background:#fbfdfc; }
.jobs-id-cell,.jobs-customer-cell,.jobs-work-cell { display:flex; flex-direction:column; gap:5px; min-width:0; }
.jobs-id-cell strong,.jobs-customer-cell strong,.jobs-work-cell strong { color:#22342c; font-size:14px; }
.jobs-id-cell small,.jobs-customer-cell small,.jobs-work-cell small { color:#8a9892; font-size:12px; }
.jobs-money { font-size:14px; color:#1e2d26; }
.jobs-balance { font-size:14px; color:#df4d4d; }
.jobs-balance.paid { color:#087653; }
.jobs-view-button { width:40px; height:40px; border:1px solid #dbe6e1; border-radius:9px; background:#fff; color:#53635c; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.jobs-view-button:hover { border-color:#087653; color:#087653; background:#f1faf6; }
.jobs-modern-footer { padding:14px 20px; color:#899690; font-size:12px; }
.job-drawer-overlay { position:fixed; inset:0; z-index:300; background:rgba(10,28,20,.25); }
.job-drawer { position:fixed; z-index:301; right:0; top:0; width:min(560px,94vw); height:100vh; background:#fff; box-shadow:-18px 0 50px rgba(8,35,25,.16); display:flex; flex-direction:column; animation:akDrawer .22s ease-out; }
@keyframes akDrawer { from{transform:translateX(100%)} to{transform:translateX(0)} }
.job-drawer-header { padding:25px 28px; border-bottom:1px solid #e3ebe7; display:flex; justify-content:space-between; align-items:flex-start; }
.job-drawer-header span { font-size:11px; font-weight:800; letter-spacing:1.4px; color:#83918b; }
.job-drawer-header h2 { margin:7px 0 3px; font-size:27px; color:#087653; }
.job-drawer-header p { margin:0; color:#8a9892; font-size:13px; }
.job-drawer-close { width:40px; height:40px; border:1px solid #dce6e2; background:#fff; border-radius:9px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#596860; }
.job-drawer-body { overflow:auto; padding:20px 24px 35px; }
.job-detail-grid { display:grid; grid-template-columns:1fr 1fr; border:1px solid #dfe8e4; border-radius:12px; overflow:hidden; margin-bottom:13px; }
.job-detail-box { padding:18px; min-height:140px; }
.job-detail-box:first-child { border-right:1px solid #dfe8e4; }
.job-detail-label { display:flex; align-items:center; gap:8px; color:#087653; font-size:11px; font-weight:800; letter-spacing:.7px; }
.job-detail-box strong { display:block; margin-top:13px; color:#172720; font-size:16px; }
.job-detail-box p { margin:8px 0 0; color:#62716a; font-size:13px; display:flex; align-items:center; gap:6px; line-height:1.5; }
.job-detail-box small { display:block; margin-top:8px; color:#8a9892; font-size:12px; }
.job-detail-section { border:1px solid #dfe8e4; border-radius:12px; padding:18px; margin-bottom:13px; }
.job-section-title { display:flex; align-items:center; gap:8px; color:#087653; font-size:11px; font-weight:800; letter-spacing:.8px; margin-bottom:15px; }
.job-money-row { display:flex; justify-content:space-between; padding:7px 0; font-size:14px; }
.job-money-row span { color:#687770; }
.job-money-row strong { color:#25342d; }
.job-money-row.discount strong { color:#df4d4d; }
.job-total-row { margin-top:9px; padding-top:15px; border-top:1px dashed #cbd7d1; display:flex; justify-content:space-between; align-items:center; }
.job-total-row span { font-size:12px; font-weight:800; color:#26362e; }
.job-total-row strong { font-size:23px; color:#087653; }
.job-paid { color:#087653 !important; }
.job-balance-row { margin-top:8px; padding-top:14px; border-top:1px solid #edf1ef; display:flex; justify-content:space-between; align-items:center; }
.job-balance-row span { font-size:12px; font-weight:800; color:#26362e; }
.job-balance-row strong { font-size:22px; color:#df4d4d; }
.job-payment-button { width:100%; margin-top:14px; height:46px; border:0; border-radius:9px; background:#087653; color:#fff; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; }
.job-payment-button:disabled { background:#b7c6c0; cursor:not-allowed; }
.job-payment-form { margin-top:14px; padding:14px; background:#f7faf8; border-radius:10px; }
.job-payment-form label { font-size:12px; font-weight:700; color:#43534c; }
.job-payment-input { margin-top:7px; height:46px; background:#fff; border:1px solid #d7e2dd; border-radius:9px; display:flex; align-items:center; padding:0 12px; gap:7px; }
.job-payment-input span { color:#74837c; font-size:16px; }
.job-payment-input input { border:0; outline:0; width:100%; font-size:15px; }
.job-payment-actions { display:flex; gap:8px; margin-top:10px; }
.job-payment-actions button { flex:1; height:40px; border-radius:8px; border:1px solid #d8e3de; background:#fff; cursor:pointer; font-weight:700; }
.job-payment-actions button:last-child { border:0; background:#087653; color:#fff; }
.job-status-timeline { display:grid; grid-template-columns:repeat(5,1fr); margin:22px 0 18px; }
.job-status-step { position:relative; text-align:center; color:#9aa7a1; font-size:10px; }
.job-status-step:not(:last-child):after { content:""; position:absolute; left:58%; right:-42%; top:7px; height:2px; background:#dfe6e3; }
.job-status-step.active:not(:last-child):after { background:#087653; }
.job-status-dot { position:relative; z-index:2; width:16px; height:16px; margin:0 auto 7px; border-radius:50%; border:2px solid #cbd7d1; background:#fff; display:flex; align-items:center; justify-content:center; color:#fff; }
.job-status-step.active .job-status-dot { border-color:#087653; background:#087653; }
.job-status-step.current .job-status-dot { box-shadow:0 0 0 5px #dff3e9; }
.job-status-step.active span { color:#33443c; font-weight:700; }
.job-status-label { display:block; font-size:12px; font-weight:700; color:#3d4d46; }
.job-status-label select { width:100%; height:44px; margin-top:7px; border:1px solid #d9e4df; border-radius:9px; background:#fff; padding:0 12px; font-size:13px; outline:none; }
.job-action-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.job-action-grid button { height:46px; border:1px solid #cddbd5; background:#fff; border-radius:9px; color:#087653; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:7px; cursor:pointer; }
.job-notes { margin:0; color:#5d6d65; font-size:13px; line-height:1.65; }
.job-form-section-title { padding:18px 26px 0; }
.job-form-section-title span { font-size:11px; letter-spacing:1px; font-weight:800; color:#087653; }
.job-form-section-title p { margin:5px 0 0; color:#87958f; font-size:12px; }
.job-form-summary { margin:5px 26px 0; padding:17px; background:#f5f8f6; border:1px solid #dfe8e4; border-radius:11px; }
.job-form-summary>div { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; }
.job-form-summary span { color:#697870; }
.job-form-summary strong { color:#26362f; }
.job-form-summary .discount strong { color:#df4d4d; }
.job-form-summary .summary-total { margin-top:8px; padding-top:14px; border-top:1px dashed #cbd7d1; }
.job-form-summary .summary-total span { color:#25352d; font-weight:800; }
.job-form-summary .summary-total strong { color:#087653; font-size:22px; }
.job-form-balance { margin:13px 26px 0; padding:14px 16px; border-radius:10px; background:#fff3df; display:flex; justify-content:space-between; align-items:center; }
.job-form-balance span { color:#9b6816; font-size:11px; font-weight:800; }
.job-form-balance strong { color:#9b6816; font-size:18px; }
.job-form-balance.clear { background:#e7f6ef; }
.job-form-balance.clear span,.job-form-balance.clear strong { color:#087653; }
.job-form-notes { padding:18px 26px 0; }
.job-form-notes label { display:block; color:#45564e; font-size:12px; font-weight:700; margin-bottom:7px; }
.job-form-notes textarea { width:100%; resize:vertical; border:1px solid #d9e4df; border-radius:9px; padding:11px 12px; outline:none; font:inherit; font-size:13px; color:#1b2b24; background:#fbfcfc; }
@media(max-width:900px){ .jobs-modern-head,.jobs-modern-row{grid-template-columns:1fr 1.2fr 1.5fr .9fr .8fr .8fr .5fr; min-width:900px;} .jobs-modern-card{overflow-x:auto;} }
@media(max-width:650px){ .jobs-page-header{align-items:flex-start; flex-direction:column;} .jobs-toolbar-modern{flex-direction:column;} .jobs-search-modern{width:100%;} .job-drawer{width:100%;} .job-detail-grid{grid-template-columns:1fr;} .job-detail-box:first-child{border-right:0;border-bottom:1px solid #dfe8e4;} }

/* ============================================================
   ADMIN DROPDOWN + BILLING TERMINAL + LIVE REPORTS
============================================================ */
.admin-menu-wrap { position:relative; }
.admin-profile { border:0; background:transparent; padding:4px 6px; border-radius:12px; cursor:pointer; color:inherit; }
.admin-profile:hover,.admin-profile.admin-active { background:#eef5f3; }
.admin-dropdown { position:absolute; right:0; top:calc(100% + 9px); width:220px; padding:10px; background:#fff; border:1px solid var(--border); border-radius:14px; box-shadow:0 18px 45px rgba(18,52,47,.14); z-index:120; animation:adminDrop .16s ease-out; }
@keyframes adminDrop { from{opacity:0;transform:translateY(-5px) scale(.98)} to{opacity:1;transform:translateY(0) scale(1)} }
.admin-dropdown-head { display:flex; gap:10px; align-items:center; padding:8px 8px 11px; margin-bottom:4px; border-bottom:1px solid #edf2f1; }
.admin-dropdown-avatar { width:35px; height:35px; display:grid; place-items:center; border-radius:10px; background:#e4f3ef; color:#166b5f; font-size:10px; font-weight:800; }
.admin-dropdown-head strong,.admin-dropdown-head span { display:block; }
.admin-dropdown-head strong { font-size:11px; }
.admin-dropdown-head span { margin-top:2px; color:var(--muted); font-size:8px; }
.admin-dropdown > button { width:100%; height:38px; display:flex; align-items:center; gap:9px; padding:0 9px; border-radius:8px; background:transparent; color:#4c6261; font-size:10px; font-weight:700; text-align:left; }
.admin-dropdown > button:hover { background:#f0f6f4; color:var(--green); }
.billing-machine { position:relative; display:grid; grid-template-columns:minmax(0,1.55fr) minmax(190px,.75fr); gap:0; margin-bottom:18px; min-height:230px; border-radius:18px; overflow:hidden; background:linear-gradient(135deg,#0c4a42,#166b5f 60%,#0d3d37); box-shadow:0 15px 42px rgba(11,61,55,.16); }
.billing-machine-screen { position:relative; padding:24px 28px; color:#fff; overflow:hidden; }
.machine-topline { display:flex; justify-content:space-between; align-items:center; font-size:9px; letter-spacing:1.4px; font-weight:800; color:#c5e4de; }
.machine-topline b { font-size:8px; letter-spacing:.8px; color:#d8f1b8; }
.machine-topline b i { display:inline-block; width:6px; height:6px; border-radius:50%; background:#b9df79; margin-right:5px; box-shadow:0 0 0 5px rgba(185,223,121,.08); animation:terminalPulse 1.7s infinite; }
@keyframes terminalPulse { 50%{box-shadow:0 0 0 8px rgba(185,223,121,0)} }
.machine-main { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:35px; }
.machine-main small,.machine-main span { display:block; color:#9cc3bb; font-size:8px; letter-spacing:.9px; }
.machine-main strong { display:block; margin:7px 0; font:800 31px Manrope,sans-serif; color:#fff; }
.machine-main span { letter-spacing:0; }
.machine-ring { width:122px; height:122px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(#b9df79 var(--billing-progress),rgba(255,255,255,.11) 0); box-shadow:0 0 0 1px rgba(255,255,255,.09); animation:ringFloat 3s ease-in-out infinite; }
.machine-ring:before { content:""; position:absolute; width:92px; height:92px; border-radius:50%; background:#10564d; }
.machine-ring > div { position:relative; z-index:1; text-align:center; }
.machine-ring b { display:block; color:#fff; font-size:19px; }
.machine-ring span { margin-top:2px; color:#9fc7bf; font-size:7px; }
@keyframes ringFloat { 50%{transform:translateY(-4px) rotate(2deg)} }
.machine-scanline { position:absolute; left:0; right:0; top:0; height:2px; background:rgba(185,223,121,.55); box-shadow:0 0 15px rgba(185,223,121,.35); animation:scan 4s linear infinite; }
@keyframes scan { from{transform:translateY(0)} to{transform:translateY(205px)} }
.billing-machine-receipt { position:relative; padding:25px 25px 18px; background:#f9fbfa; color:#1a2c28; display:flex; flex-direction:column; justify-content:center; clip-path:polygon(0 0,100% 0,100% 96%,96% 100%,92% 96%,88% 100%,84% 96%,80% 100%,76% 96%,72% 100%,68% 96%,64% 100%,60% 96%,56% 100%,52% 96%,48% 100%,44% 96%,40% 100%,36% 96%,32% 100%,28% 96%,24% 100%,20% 96%,16% 100%,12% 96%,8% 100%,4% 96%,0 100%); }
.billing-machine-receipt:before { content:""; position:absolute; inset:12px; border:1px dashed #d8e3df; pointer-events:none; }
.billing-machine-receipt > * { position:relative; z-index:1; }
.billing-machine-receipt > span { font-size:8px; letter-spacing:1.6px; color:#81908b; font-weight:800; }
.billing-machine-receipt > strong { margin-top:9px; font:800 18px Manrope,sans-serif; color:#166b5f; }
.receipt-line { display:flex; gap:5px; margin:17px 0; }
.receipt-line i { height:5px; flex:1; border-radius:4px; background:#dfe9e5; animation:receiptWave 1.6s ease-in-out infinite; }
.receipt-line i:nth-child(2){animation-delay:.15s}.receipt-line i:nth-child(3){animation-delay:.3s}
@keyframes receiptWave { 50%{transform:scaleY(.45);opacity:.6} }
.billing-machine-receipt small { color:#82908b; font-size:8px; line-height:1.5; }
.machine-status { position:absolute; bottom:12px; left:27px; color:#b9d7d0; font-size:8px; z-index:3; }
.machine-status span { display:inline-block; width:6px; height:6px; border-radius:50%; background:#b9df79; margin-right:5px; }
.machine-status b { color:#d8efc0; }
.reports-chart-grid { display:grid; grid-template-columns:1.25fr .85fr; gap:17px; }
.daily-expense-card { min-width:0; }
.live-bars { gap:10px; }
.animated-bar { animation:barRise .7s ease-out both; transform-origin:bottom; }
@keyframes barRise { from{transform:scaleY(0)} to{transform:scaleY(1)} }
.expense-bars { height:270px; margin:15px 22px 0; padding:12px 6px 0; border-bottom:1px solid var(--border); display:flex; align-items:flex-end; gap:10px; }
.expense-bar-wrap { flex:1; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; min-width:0; }
.expense-bar { width:min(32px,70%); min-height:4px; border-radius:7px 7px 0 0; background:linear-gradient(#d59a4e,#a96720); animation:barRise .7s ease-out both; transform-origin:bottom; }
.expense-value { margin-bottom:5px; color:#9a6b2d; font-size:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:48px; }
.expense-day { margin-top:8px; color:var(--muted); font-size:7px; white-space:nowrap; }
@media(max-width:900px){ .billing-machine{grid-template-columns:1fr}.billing-machine-receipt{min-height:170px}.reports-chart-grid{grid-template-columns:1fr}.admin-dropdown{right:-4px} }
@media(max-width:600px){ .machine-main strong{font-size:25px}.machine-ring{width:95px;height:95px}.machine-ring:before{width:72px;height:72px}.billing-machine-screen{padding:20px}.billing-machine-receipt{padding:20px}.reports-chart-grid{gap:12px} }

`;



const AL_KANZ_ANIMATED_UI = `
/* ============================================================
   AL KANZ — FULL ANIMATED / RESPONSIVE EXPERIENCE
============================================================ */

html {
  scroll-behavior: smooth;
}

* {
  -webkit-tap-highlight-color: transparent;
}

body {
  overflow-x: hidden;
}

.app {
  min-height: 100vh;
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(circle at 8% 5%, rgba(30,126,104,.075), transparent 28%),
    radial-gradient(circle at 92% 18%, rgba(185,223,121,.09), transparent 26%),
    var(--bg);
}

.app::before {
  content: "";
  position: fixed;
  inset: -20%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 20% 25%, rgba(102,197,168,.06), transparent 22%),
    radial-gradient(circle at 80% 70%, rgba(185,223,121,.055), transparent 24%);
  animation: akAmbient 18s ease-in-out infinite alternate;
}

@keyframes akAmbient {
  0% { transform: translate3d(-1%, -1%, 0) scale(1); }
  50% { transform: translate3d(1.5%, 1%, 0) scale(1.03); }
  100% { transform: translate3d(-.5%, 1.5%, 0) scale(1.015); }
}

/* Smooth page entrance */
.content > * {
  animation: akPageIn .48s cubic-bezier(.2,.8,.2,1) both;
}

@keyframes akPageIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Sidebar */
.sidebar {
  transition:
    width .28s ease,
    transform .28s cubic-bezier(.2,.8,.2,1),
    box-shadow .28s ease;
}

.nav-item {
  transition:
    transform .2s ease,
    background .2s ease,
    color .2s ease,
    padding .25s ease;
}

.nav-item:hover {
  transform: translateX(3px);
}

.nav-item.selected {
  animation: akNavPulse .35s ease-out;
}

@keyframes akNavPulse {
  0% { transform: scale(.98); }
  100% { transform: scale(1); }
}

.sub-menu {
  animation: akSubMenu .24s ease-out both;
  transform-origin: top;
}

@keyframes akSubMenu {
  from { opacity: 0; transform: translateY(-5px) scaleY(.96); }
  to { opacity: 1; transform: translateY(0) scaleY(1); }
}

.chevron-open {
  transition: transform .25s ease;
  transform: rotate(180deg);
}

/* Top bar */
.topbar {
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: background .25s ease, box-shadow .25s ease;
}

.mobile-menu,
.notification,
.admin-profile {
  transition:
    transform .2s ease,
    background .2s ease,
    box-shadow .2s ease;
}

.mobile-menu:hover,
.notification:hover,
.admin-profile:hover {
  transform: translateY(-1px);
}

.mobile-menu:active,
.notification:active,
.admin-profile:active,
button:active {
  transform: scale(.97);
}

/* Search */
.global-search {
  transition: width .25s ease, border-color .2s ease, box-shadow .2s ease;
}

.global-search:focus-within {
  border-color: var(--green);
  box-shadow: 0 0 0 3px var(--green-light);
}

/* Cards */
.card,
.table-card,
.jobs-modern-card,
.customer-card,
.staff-card,
.material-card,
.account-card,
.report-card,
.billing-machine,
.settings-card,
.appearance-card {
  transition:
    transform .25s ease,
    box-shadow .25s ease,
    border-color .25s ease;
}

.card:hover,
.customer-card:hover,
.staff-card:hover,
.material-card:hover,
.report-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 35px rgba(20,55,47,.10);
}

/* Buttons */
.primary-button,
.secondary-button,
.hero-actions button,
.row-action,
.job-action-grid button,
.job-payment-button {
  transition:
    transform .2s ease,
    box-shadow .2s ease,
    filter .2s ease,
    background .2s ease;
}

.primary-button:hover,
.job-payment-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 9px 22px rgba(8,118,83,.22);
  filter: brightness(1.04);
}

.secondary-button:hover,
.row-action:hover,
.job-action-grid button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(20,55,47,.10);
}

/* Animated stats */
.stat-card {
  animation: akCardIn .55s cubic-bezier(.2,.8,.2,1) both;
}

.stat-card:nth-child(2) { animation-delay: .06s; }
.stat-card:nth-child(3) { animation-delay: .12s; }
.stat-card:nth-child(4) { animation-delay: .18s; }

@keyframes akCardIn {
  from { opacity: 0; transform: translateY(16px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Number/icon micro animations */
.stat-card svg,
.card-header svg {
  transition: transform .3s ease;
}

.stat-card:hover svg,
.card:hover .card-header svg {
  transform: scale(1.08) rotate(-3deg);
}

/* Progress */
.progress-bar > div {
  transform-origin: left center;
  animation: akProgress .9s cubic-bezier(.2,.8,.2,1) both;
}

@keyframes akProgress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

/* Billing machine */
.billing-machine {
  position: relative;
  overflow: hidden;
  animation: akMachineIn .65s cubic-bezier(.2,.8,.2,1) both;
}

.billing-machine::before {
  content: "";
  position: absolute;
  width: 220px;
  height: 220px;
  right: -80px;
  top: -90px;
  border-radius: 50%;
  background: var(--green-light);
  opacity: .65;
  animation: akMachineOrb 8s ease-in-out infinite;
  pointer-events: none;
}

@keyframes akMachineIn {
  from { opacity: 0; transform: translateY(18px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes akMachineOrb {
  0%,100% { transform: translate(0,0) scale(1); }
  50% { transform: translate(-25px,20px) scale(1.12); }
}

.machine-ring {
  animation: akRingFloat 4s ease-in-out infinite;
}

@keyframes akRingFloat {
  0%,100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(-5px) rotate(2deg); }
}

.billing-machine-receipt {
  animation: akReceipt 1.1s cubic-bezier(.2,.8,.2,1) both;
}

@keyframes akReceipt {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Charts */
.report-chart,
.chart-card,
.reports-chart-card {
  overflow: hidden;
}

.report-chart svg,
.chart-card svg {
  animation: akChartDraw 1.2s ease-out both;
}

@keyframes akChartDraw {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Modals / drawer */
.modal-backdrop,
.modal-overlay {
  animation: akFade .2s ease-out both;
}

.modal,
.job-drawer {
  animation: akModalIn .3s cubic-bezier(.2,.8,.2,1) both;
}

@keyframes akFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes akModalIn {
  from { opacity: 0; transform: translateY(18px) scale(.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Admin / notifications */
.admin-menu-wrap,
.notification-wrap {
  position: relative;
}

.admin-dropdown,
.notification-popover {
  animation: akDrop .22s cubic-bezier(.2,.8,.2,1) both;
  transform-origin: top right;
}

@keyframes akDrop {
  from { opacity: 0; transform: translateY(-6px) scale(.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.notification-wrap {
  display: flex;
  align-items: center;
}

.notification.active {
  background: var(--green-light);
  color: var(--green);
}

.notification-popover {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  width: 310px;
  padding: 10px;
  z-index: 1000;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--white);
  color: var(--text);
  box-shadow: 0 20px 50px rgba(0,0,0,.16);
}

.popover-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 8px 12px;
  border-bottom: 1px solid var(--border);
}

.popover-title div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.popover-title span {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1px;
  color: var(--green);
}

.popover-title strong {
  font-size: 14px;
}

.popover-title button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: var(--soft);
  color: var(--text);
  cursor: pointer;
}

.notification-item {
  display: flex;
  gap: 10px;
  padding: 13px 8px;
}

.notification-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--green-light);
  color: var(--green);
}

.notification-item strong {
  display: block;
  font-size: 12px;
}

.notification-item p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.notification-footer {
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 9px;
  background: var(--soft);
  color: var(--green);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

/* Tables/cards on hover */
.table-row {
  transition: background .2s ease, transform .2s ease;
}

.table-row:hover {
  background: var(--soft);
}

/* Touch targets */
@media (max-width: 850px) {
  .sidebar {
    z-index: 50;
  }

  .sidebar-overlay {
    z-index: 45;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    animation: akFade .2s ease-out both;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 40;
  }

  .content {
    min-width: 0;
  }

  .global-search {
    min-width: 0;
  }

  .notification-popover,
  .admin-dropdown {
    position: fixed;
    top: 68px;
    right: 12px;
    width: min(310px, calc(100vw - 24px));
  }

  .mobile-menu,
  .notification,
  .admin-profile {
    min-width: 40px;
    min-height: 40px;
  }
}

@media (max-width: 620px) {
  .topbar {
    gap: 8px;
    padding: 0 12px;
  }

  .topbar-left {
    min-width: 40px;
  }

  .topbar-right {
    gap: 5px;
    margin-left: auto;
  }

  .global-search {
    width: min(42vw, 170px);
  }

  .global-search input {
    min-width: 0;
  }

  .content {
    padding-left: 12px;
    padding-right: 12px;
  }

  .page-title h1 {
    font-size: 22px;
  }

  .page-title p {
    max-width: 100%;
  }

  .card,
  .table-card,
  .jobs-modern-card,
  .billing-machine {
    border-radius: 13px;
  }

  .primary-button,
  .secondary-button {
    min-height: 44px;
  }

  .notification-popover,
  .admin-dropdown {
    top: 66px;
  }

  .admin-profile {
    padding: 0 2px;
  }

  .admin-profile > div {
    margin: 0;
  }

  /* Prevent wide tables from breaking the viewport. */
  .table-card,
  .jobs-modern-card {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .table-head,
  .table-row {
    min-width: 650px;
  }

  .jobs-modern-head,
  .jobs-modern-row {
    min-width: 900px;
  }

  .billing-machine {
    width: 100%;
  }
}

/* Respect reduced-motion accessibility preference. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
`;

const CSS = BASE_CSS + AL_KANZ_JOB_UI + AL_KANZ_ANIMATED_UI;



/* ============================================================
   FINAL MOBILE DRAWER / RESPONSIVE OVERRIDES
   Desktop remains unchanged. Mobile uses an overlay drawer.
============================================================ */
const AL_KANZ_FINAL_RESPONSIVE = `
@media (max-width: 850px) {
  html, body, #root {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  body {
    min-width: 0;
  }

  .app {
    width: 100%;
    min-width: 0;
    display: block;
    overflow-x: hidden;
  }

  /* Never let the desktop collapsed-sidebar mode affect mobile. */
  .app.sidebar-collapsed .main {
    width: 100% !important;
    margin-left: 0 !important;
  }

  .app .main {
    width: 100% !important;
    margin-left: 0 !important;
    min-width: 0;
  }

  /* Real mobile drawer: it overlays the page instead of squeezing it. */
  .app .sidebar {
    position: fixed !important;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(310px, 86vw) !important;
    max-width: 86vw;
    height: 100dvh;
    transform: translateX(-105%) !important;
    transition: transform .32s cubic-bezier(.22,.8,.2,1), box-shadow .32s ease !important;
    z-index: 1001 !important;
    box-shadow: none;
    overflow: hidden;
  }

  .app .sidebar.sidebar-open {
    transform: translateX(0) !important;
    box-shadow: 22px 0 55px rgba(0,0,0,.28);
  }

  .app .sidebar-overlay {
    display: block !important;
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    padding: 0 !important;
    border: 0 !important;
    background: rgba(0,0,0,.48) !important;
    z-index: 1000 !important;
    cursor: pointer;
    animation: akOverlayIn .22s ease both;
  }

  @keyframes akOverlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .app .brand-area {
    padding: 22px 17px 17px !important;
    flex: 0 0 auto;
  }

  .app .nav-scroll {
    min-height: 0;
    padding: 20px 12px 25px !important;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .app .sidebar-account {
    flex: 0 0 auto;
    padding-bottom: max(14px, env(safe-area-inset-bottom)) !important;
  }

  .app .mobile-close {
    display: grid !important;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    color: #fff;
    background: rgba(255,255,255,.07);
    position: absolute;
    right: 14px;
    top: 18px;
  }

  .app .mobile-close:hover {
    background: rgba(255,255,255,.14);
  }

  .app .brand {
    padding-right: 48px;
  }

  .app .nav-item {
    min-height: 46px;
    font-size: 12px;
  }

  .app .sub-menu {
    padding-left: 42px;
    padding-bottom: 7px;
  }

  .app .sub-menu button {
    min-height: 38px;
    height: 38px;
    font-size: 11px;
  }

  /* Mobile topbar */
  .app .topbar {
    width: 100%;
    max-width: 100%;
    height: 64px;
    padding: 0 12px;
    gap: 7px;
    overflow: visible;
  }

  .app .topbar-left {
    min-width: 40px;
    flex: 0 0 auto;
  }

  .app .mobile-menu {
    display: grid !important;
    place-items: center;
    width: 42px !important;
    height: 42px !important;
    min-width: 42px;
    min-height: 42px;
    margin: 0 !important;
    border-radius: 11px;
    background: var(--green-light) !important;
    color: var(--green) !important;
  }

  .app .topbar-right {
    min-width: 0;
    flex: 1;
    justify-content: flex-end;
    gap: 5px;
  }

  .app .global-search {
    flex: 1 1 auto;
    width: auto !important;
    min-width: 0;
    max-width: 190px;
    height: 40px;
  }

  .app .global-search input {
    min-width: 0;
    font-size: 11px;
  }

  .app .global-search kbd {
    display: none;
  }

  .app .notification {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
  }

  .app .admin-profile {
    width: 40px;
    height: 40px;
    min-width: 40px;
    padding: 0 !important;
    justify-content: center;
  }

  .app .admin-profile > div {
    width: 34px;
    height: 34px;
  }

  .app .admin-profile section,
  .app .admin-profile > svg {
    display: none !important;
  }

  .app .content {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 20px 14px 50px !important;
    overflow-x: hidden;
  }

  /* Stack common layouts cleanly on phones. */
  .app .stats,
  .app .report-grid,
  .app .customer-grid,
  .app .staff-grid,
  .app .account-overview,
  .app .material-grid,
  .app .two-column,
  .app .report-layout,
  .app .reports-chart-grid,
  .app .billing-machine,
  .app .settings-layout {
    width: 100%;
    min-width: 0;
  }

  .app .stats,
  .app .report-grid,
  .app .customer-grid,
  .app .staff-grid,
  .app .account-overview,
  .app .material-grid,
  .app .reports-chart-grid {
    grid-template-columns: 1fr !important;
  }

  .app .two-column,
  .app .billing-machine,
  .app .settings-layout {
    grid-template-columns: 1fr !important;
  }

  .app .hero {
    width: 100%;
    min-width: 0;
    padding: 22px !important;
  }

  .app .hero-visual {
    display: none !important;
  }

  .app .hero-text {
    width: 100%;
  }

  .app .hero-text h2 {
    font-size: clamp(22px, 7vw, 30px);
    line-height: 1.12;
  }

  .app .hero-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .app .hero-actions button,
  .app .page-heading button,
  .app .page-title button {
    min-height: 44px;
  }

  /* Keep wide tables usable by scrolling only the table area. */
  .app .table-card,
  .app .jobs-modern-card {
    width: 100%;
    max-width: 100%;
    overflow-x: auto !important;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .app .table-card > *,
  .app .jobs-modern-card > * {
    min-width: 620px;
  }

  /* Drawers/modals fit inside a phone. */
  .app .modal,
  .app .job-drawer {
    width: min(94vw, 680px) !important;
    max-width: 94vw !important;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .app .modal-grid,
  .app .settings-form {
    grid-template-columns: 1fr !important;
  }

  .app .modal-footer {
    flex-wrap: wrap;
  }

  .app .modal-footer button {
    flex: 1 1 130px;
    min-height: 42px;
  }

  /* Popovers remain inside the viewport. */
  .app .notification-popover,
  .app .admin-dropdown {
    position: fixed !important;
    top: 70px !important;
    right: 10px !important;
    left: auto !important;
    width: min(320px, calc(100vw - 20px)) !important;
    max-width: calc(100vw - 20px);
    z-index: 1200 !important;
  }
}

@media (max-width: 420px) {
  .app .global-search {
    max-width: 145px;
  }

  .app .content {
    padding-left: 11px !important;
    padding-right: 11px !important;
  }

  .app .page-heading h1,
  .app .page-title h1 {
    font-size: 22px;
  }

  .app .hero {
    padding: 19px !important;
  }
}

@media (min-width: 851px) {
  /* Desktop stays a true desktop layout. */
  .app .sidebar {
    transform: none;
  }

  .app .sidebar-overlay {
    display: none !important;
  }
}
`;



const AL_KANZ_FINAL_FIX = `
html, body, #root { width:100%; min-width:0; margin:0; }
.app { width:100%; min-width:0; overflow-x:hidden; }
.main, .content { min-width:0; }
.nav-item { position:relative; }

/* BILLING: bill -> wave letters -> printer -> paper */
.bill-create-panel { display:flex; flex-direction:column; align-items:flex-start; }
.create-bill-button { margin-top:14px; min-height:40px; padding:0 14px; border:0; border-radius:10px; display:inline-flex; align-items:center; gap:8px; background:#b9df79; color:#17483f; font-size:11px; font-weight:900; cursor:pointer; box-shadow:0 7px 18px rgba(185,223,121,.16); transition:transform .2s ease, box-shadow .2s ease; }
.create-bill-button:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(185,223,121,.25); }
.create-bill-button:active { transform:scale(.96); }
.billing-transfer-animation { position:absolute; left:28px; right:28px; bottom:21px; height:48px; display:flex; align-items:center; gap:12px; pointer-events:none; z-index:4; }
.bill-source { width:54px; flex:0 0 54px; display:flex; align-items:center; gap:5px; color:#d9efe9; font-size:7px; font-weight:900; letter-spacing:1px; }
.bill-paper-icon { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.12); }
.wave-track { position:relative; height:42px; flex:1; display:flex; align-items:center; justify-content:space-around; overflow:visible; }
.wave-track:before { content:""; position:absolute; left:0; right:0; top:50%; height:2px; background:repeating-linear-gradient(90deg,rgba(185,223,121,.18) 0 7px,transparent 7px 13px); transform:translateY(-50%); }
.wave-track span { position:relative; z-index:2; width:22px; height:22px; display:grid; place-items:center; border-radius:50%; color:#b9df79; background:#0d4c43; border:1px solid rgba(185,223,121,.45); font-size:8px; font-weight:900; opacity:.55; }
.billing-machine.is-printing .wave-track span { animation:billingWaveTravel 1.25s cubic-bezier(.2,.75,.25,1) infinite; animation-delay:var(--wave-delay); }
@keyframes billingWaveTravel { 0%{transform:translate3d(-28px,13px,0) scale(.72);opacity:0} 18%{opacity:1} 45%{transform:translate3d(0,-11px,0) scale(1.08)} 70%{transform:translate3d(22px,10px,0) scale(.95)} 100%{transform:translate3d(42px,0,0) scale(.65);opacity:0} }
.printer-icon { position:relative; width:43px; height:34px; flex:0 0 43px; border-radius:8px; display:grid; place-items:center; color:#dff4ed; background:#0b3934; border:1px solid rgba(255,255,255,.15); }
.printer-icon i { position:absolute; bottom:-3px; width:22px; height:4px; border-radius:2px; background:#b9df79; opacity:.7; }
.billing-machine.is-printing .printer-icon { animation:printerShake .45s ease-in-out infinite alternate; }
@keyframes printerShake { from{transform:translateY(0) rotate(-1deg)} to{transform:translateY(-2px) rotate(1deg)} }
.receipt-printer { position:relative; margin:-2px auto 13px; width:min(220px,90%); height:88px; border-radius:12px 12px 8px 8px; background:#e7efec; border:1px solid #d2dfda; overflow:hidden; box-shadow:inset 0 -5px 0 rgba(23,69,62,.05); }
.printer-top { height:30px; display:flex; align-items:center; justify-content:center; gap:6px; color:#55706a; font-size:7px; font-weight:900; letter-spacing:1px; }
.printer-light { width:6px; height:6px; border-radius:50%; background:#62b993; box-shadow:0 0 0 4px rgba(98,185,147,.10); }
.printer-slot { position:absolute; left:25px; right:25px; top:29px; height:7px; border-radius:4px; background:#7f928c; overflow:visible; }
.printed-paper { position:absolute; left:10px; right:10px; top:2px; height:0; padding:0 10px; overflow:hidden; background:#fff; border:1px solid #d9e3df; border-radius:0 0 4px 4px; display:flex; flex-direction:column; align-items:center; color:#36524b; font-size:6px; }
.printed-paper strong { margin-top:8px; font-size:8px; color:#166b5f; }
.printed-paper span { margin-top:2px; font-size:5px; letter-spacing:.6px; }
.printed-paper i { width:75%; height:1px; margin:5px 0; background:#dce7e3; }
.printed-paper small { font-size:5px; color:#82908b; }
.printed-paper b { margin-top:3px; font-size:7px; color:#263b35; }
.billing-machine.is-printing .printed-paper { animation:paperRollOut 2.6s cubic-bezier(.18,.7,.2,1) .75s forwards; }
@keyframes paperRollOut { 0%{height:0;padding-top:0;padding-bottom:0;transform:translateY(0)} 45%{height:45px;padding-top:2px;padding-bottom:2px} 100%{height:75px;padding-top:4px;padding-bottom:4px;transform:translateY(0)} }
.receipt-caption { font-size:8px !important; letter-spacing:1.6px; }
.billing-machine.is-printing .receipt-line i { animation-duration:.55s; }

/* Mobile = real slide-in drawer, never a squeezed desktop sidebar */
@media (max-width:850px) {
  .app { display:block; }
  .main { width:100% !important; margin-left:0 !important; }
  .sidebar { position:fixed !important; left:0 !important; top:0 !important; bottom:0 !important; width:min(300px,86vw) !important; max-width:300px !important; height:100% !important; transform:translate3d(-105%,0,0) !important; z-index:1000 !important; box-shadow:18px 0 55px rgba(0,0,0,.28) !important; transition:transform .32s cubic-bezier(.2,.8,.2,1) !important; }
  .sidebar.sidebar-open { transform:translate3d(0,0,0) !important; }
  .sidebar-overlay { position:fixed !important; inset:0 !important; width:100% !important; height:100% !important; display:block !important; z-index:999 !important; background:rgba(3,18,15,.52) !important; backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); }
  .mobile-menu { display:grid !important; width:42px !important; height:42px !important; flex:0 0 42px; place-items:center; border-radius:11px !important; background:var(--soft) !important; color:var(--text) !important; }
  .topbar { position:sticky; top:0; z-index:80; }
  .topbar-left,.topbar-right { min-width:0; }
  .global-search { max-width:min(42vw,220px); }
  .content { width:100% !important; max-width:100% !important; padding:20px 14px 45px !important; box-sizing:border-box; }
  .breadcrumb span { display:none; }
  .admin-profile section { display:none !important; }
  .admin-profile { min-width:42px; height:42px; display:flex; align-items:center; justify-content:center; }
  .notification { width:42px !important; height:42px !important; }
  .notification-popover,.admin-dropdown { position:fixed !important; top:70px !important; right:12px !important; width:min(300px,calc(100vw - 24px)) !important; max-width:calc(100vw - 24px) !important; z-index:1200 !important; }
  .sub-menu { padding-left:34px; }
  .billing-machine { grid-template-columns:1fr !important; min-height:auto; }
  .billing-machine-screen { min-height:300px; }
  .billing-transfer-animation { left:18px; right:18px; bottom:16px; }
  .billing-machine-receipt { min-height:225px !important; padding:20px !important; }
  .receipt-printer { width:min(220px,80%); }
  .stats,.billing-stats,.report-grid,.customer-grid,.staff-grid,.two-column,.reports-chart-grid { grid-template-columns:1fr !important; }
  .page-title,.page-heading { flex-wrap:wrap; }
  .page-title button,.page-heading button,.jobs-new-button { width:100%; justify-content:center; }
  .table-card { overflow-x:auto; }
  .table-head,.table-row { min-width:760px; }
  .job-drawer { width:100% !important; }
}
@media (max-width:480px) {
  .content { padding-left:11px !important; padding-right:11px !important; }
  .global-search { max-width:38vw !important; }
  .global-search kbd { display:none; }
  .billing-machine-screen { padding:19px !important; }
  .billing-transfer-animation { gap:5px; }
  .bill-source { width:43px; flex-basis:43px; }
  .wave-track span { width:18px; height:18px; font-size:7px; }
  .printer-icon { width:37px; flex-basis:37px; }
}
@media (prefers-reduced-motion:reduce) {
  .billing-machine.is-printing .wave-track span,.billing-machine.is-printing .printer-icon,.billing-machine.is-printing .printed-paper,.content > * { animation:none !important; }
  .printed-paper { height:75px; padding:4px 10px; }
}
`;

const AL_KANZ_LAST_FIX = `
/* LAST UI FIXES */
.app.theme-dark, .app.theme-dark .main, .app.theme-dark .content { background:#0b1211; color:#edf5f2; }
.app.theme-dark .topbar { background:#101a18 !important; border-color:#263633 !important; }
.app.theme-dark .sidebar { background:#071512 !important; }
.app.theme-dark .settings-menu, .app.theme-dark .card, .app.theme-dark .table-card, .app.theme-dark .modal, .app.theme-dark .job-drawer, .app.theme-dark .jobs-modern-card, .app.theme-dark .appearance-card { background:#151f1d !important; border-color:#2b3a37 !important; color:#edf5f2 !important; }
.app.theme-dark input, .app.theme-dark select, .app.theme-dark textarea, .app.theme-dark .global-search, .app.theme-dark .jobs-search-modern, .app.theme-dark .jobs-status-filter { background:#0f1816 !important; color:#edf5f2 !important; border-color:#30413d !important; }
.app.theme-dark .settings-menu button { color:#aabcb7 !important; }
.app.theme-dark .settings-menu button.active, .app.theme-dark .settings-menu button:hover { background:#183b33 !important; color:#79d0b0 !important; }
.app.theme-dark .table-head, .app.theme-dark .table-row { border-color:#293936 !important; }
.app.theme-dark .table-row:hover { background:#172522 !important; }
.app.theme-dark .page-title h1, .app.theme-dark .page-heading h1, .app.theme-dark h1, .app.theme-dark h2, .app.theme-dark h3 { color:#edf5f2; }
.app.theme-dark .page-title p, .app.theme-dark .card-header p, .app.theme-dark small { color:#8fa39e; }
.settings-form-actions { grid-column:1 / -1; display:flex; gap:10px; }
.settings-options { padding:0 21px 25px; display:flex; flex-direction:column; gap:12px; }
.notification-setting { width:100%; border:1px solid var(--border); background:var(--white); color:var(--text); border-radius:12px; padding:15px; display:flex; align-items:center; justify-content:space-between; text-align:left; cursor:pointer; }
.notification-setting-info strong,.notification-setting-info small { display:block; }
.notification-setting-info small { margin-top:4px; color:var(--text-2); font-size:9px; }
.toggle { width:42px; height:24px; border-radius:99px; background:#ccd5d2; padding:3px; display:flex; align-items:center; }
.toggle span { width:18px; height:18px; border-radius:50%; background:#fff; transition:.2s; }
.toggle.on { background:var(--green); }.toggle.on span { transform:translateX(18px); }
.security-row { min-height:65px; padding:14px; border:1px solid var(--border); border-radius:12px; display:flex; align-items:center; gap:12px; background:var(--white); }
.security-icon { width:36px;height:36px;border-radius:9px;background:var(--green-light);color:var(--green);display:grid;place-items:center; }
.security-info { flex:1; }.security-info strong,.security-info small { display:block; }.security-info small { margin-top:4px;color:var(--text-2);font-size:9px; }.security-status { padding:5px 9px;border-radius:999px;background:var(--green-light);color:var(--green);font-size:8px;font-weight:800; }
.settings-save-message { position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;gap:8px;align-items:center;padding:11px 15px;border-radius:10px;background:var(--white);border:1px solid var(--border);color:var(--green);box-shadow:0 10px 30px rgba(0,0,0,.15); }
.billing-transfer-animation-v2 { margin-top:24px; display:grid; grid-template-columns:120px 1fr 100px; align-items:center; gap:16px; min-height:68px; }
.bill-source-v2,.printer-icon-v2 { display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;font-size:8px;font-weight:800;letter-spacing:1.3px; }
.data-stream-v2 { position:relative;height:38px;display:flex;align-items:center;justify-content:space-between; }
.data-stream-v2:before { content:"";position:absolute;left:0;right:0;height:2px;background:rgba(255,255,255,.18); }
.data-stream-v2 i { position:relative;width:8px;height:8px;border-radius:50%;background:#c5efdf;box-shadow:0 0 12px rgba(197,239,223,.6);animation:dataWave 1.35s ease-in-out infinite; }
.data-stream-v2 i:nth-child(2){animation-delay:.12s}.data-stream-v2 i:nth-child(3){animation-delay:.24s}.data-stream-v2 i:nth-child(4){animation-delay:.36s}.data-stream-v2 i:nth-child(5){animation-delay:.48s}.data-stream-v2 i:nth-child(6){animation-delay:.6s}
@keyframes dataWave {0%,100%{transform:translateY(9px);opacity:.35}50%{transform:translateY(-9px);opacity:1}}
.billing-machine.is-printing .data-stream-v2 i { animation-duration:.65s; }.billing-machine.is-printing .printer-icon-v2 svg { animation:printerPulse .5s infinite; }
@keyframes printerPulse {50%{transform:translateY(-2px) scale(1.07)}}
.billing-machine-receipt .printed-paper { transform:translateY(14px);opacity:.2; }.billing-machine.is-printing .printed-paper { animation:paperOut 2.6s cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes paperOut {0%{transform:translateY(14px);opacity:.2}20%{opacity:1}100%{transform:translateY(-34px);opacity:1}}
.quotation-form-card{margin-bottom:18px}.empty-state{padding:45px 20px;text-align:center;color:var(--muted);font-size:11px}.secondary-button{height:38px;padding:0 14px;border-radius:9px;border:1px solid var(--border);background:var(--white);color:var(--text);font-weight:700;cursor:pointer}.audit-demo-list{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--soft)}.audit-demo-list p{color:var(--text-2);font-size:10px;line-height:1.6;margin:7px 0 0}
@media(max-width:700px){.billing-transfer-animation-v2{grid-template-columns:80px 1fr 75px;gap:8px}.settings-form{grid-template-columns:1fr}.settings-form-actions{grid-column:1}.security-row{align-items:flex-start}}
`;


const AL_KANZ_TRUE_FINAL_FIX = `
/* ============================================================
   TRUE FINAL FIX — TRANSACTIONS / DARK THEME / BILLING FLOW
   ============================================================ */

/* Transactions */
.billing-transactions-card { overflow:hidden; }
.transactions-title-row { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:22px 24px 18px; border-bottom:1px solid var(--border); }
.transactions-title-row h2 { margin:4px 0 4px; color:var(--text); font-size:18px; }
.transactions-title-row p { margin:0; color:var(--text-2); font-size:10px; }
.transaction-count { padding:7px 10px; border-radius:999px; background:var(--green-light); color:var(--green); font-size:9px; font-weight:800; white-space:nowrap; }
.transaction-head,.transaction-row { grid-template-columns:1fr 2.2fr 1fr 1fr 1.1fr; min-width:650px; }
.transaction-row { min-height:58px; }
.transaction-row strong { color:var(--text); }
.transaction-row .income { color:#168061; }
.transaction-row .expense { color:#c45f55; }

/* Completely consistent dark workspace */
.app.theme-dark {
  --bg:#08110f;
  --white:#121d1a;
  --soft:#172420;
  --green:#73d4b2;
  --green-dark:#50b697;
  --green-light:#173b31;
  --sidebar:#061612;
  --sidebar-2:#0d3028;
  --sidebar-text:#c1d6d0;
  --text:#f0f7f4;
  --text-2:#b0c4be;
  --muted:#81958f;
  --border:#2b403a;
  --shadow:0 12px 35px rgba(0,0,0,.38);
  background:var(--bg) !important;
}
.app.theme-dark .main,
.app.theme-dark .content { background:var(--bg) !important; }
.app.theme-dark .topbar { background:#0d1815 !important; border-color:#263a35 !important; color:var(--text); }
.app.theme-dark .sidebar { background:linear-gradient(180deg,#061612,#081b17) !important; border-color:#1d302b !important; }
.app.theme-dark .brand strong,.app.theme-dark .brand span,.app.theme-dark .nav-section-title { color:var(--sidebar-text); }
.app.theme-dark .nav-item,.app.theme-dark .sub-menu button { color:#a9beb8 !important; }
.app.theme-dark .nav-item:hover,.app.theme-dark .sub-menu button:hover { background:#12332b !important; color:#e4f5ef !important; }
.app.theme-dark .nav-item.selected,.app.theme-dark .sub-menu button.sub-selected { background:#155143 !important; color:#e9fff7 !important; }
.app.theme-dark .card,.app.theme-dark .table-card,.app.theme-dark .jobs-modern-card,.app.theme-dark .settings-card,.app.theme-dark .appearance-card,.app.theme-dark .modal,.app.theme-dark .job-drawer { background:#121d1a !important; border-color:#2b403a !important; color:var(--text) !important; box-shadow:var(--shadow); }
.app.theme-dark .table-head { background:#0e1916 !important; color:#819b93 !important; border-color:#2a3d38 !important; }
.app.theme-dark .table-row { background:#121d1a !important; border-color:#263a35 !important; color:var(--text); }
.app.theme-dark .table-row:hover { background:#172823 !important; }
.app.theme-dark input,.app.theme-dark select,.app.theme-dark textarea,.app.theme-dark .field input,.app.theme-dark .field select,.app.theme-dark .settings-form input,.app.theme-dark .settings-form select,.app.theme-dark .settings-form textarea,.app.theme-dark .global-search,.app.theme-dark .jobs-search-modern,.app.theme-dark .jobs-status-filter { background:#0c1714 !important; border-color:#30453f !important; color:#eef7f3 !important; }
.app.theme-dark input::placeholder,.app.theme-dark textarea::placeholder { color:#6f837d !important; }
.app.theme-dark .settings-menu { background:#101b18 !important; border-color:#2b403a !important; }
.app.theme-dark .settings-menu button { color:#a9beb8 !important; }
.app.theme-dark .settings-menu button.active { background:#183c32 !important; color:#79d7b5 !important; }
.app.theme-dark .notification-setting,.app.theme-dark .security-row,.app.theme-dark .theme-option,.app.theme-dark .secondary-button { background:#0f1a17 !important; border-color:#2c403b !important; color:var(--text) !important; }
.app.theme-dark .notification-setting:hover,.app.theme-dark .theme-option:hover { background:#162822 !important; }
.app.theme-dark .admin-dropdown,.app.theme-dark .notification-popover { background:#111d1a !important; border-color:#2b403a !important; color:var(--text); box-shadow:0 20px 50px rgba(0,0,0,.5); }
.app.theme-dark .admin-dropdown > button,.app.theme-dark .notification-footer { color:#b9cbc6 !important; }
.app.theme-dark .admin-dropdown > button:hover,.app.theme-dark .notification-footer:hover { background:#193229 !important; color:#7ad5b4 !important; }
.app.theme-dark .admin-profile:hover,.app.theme-dark .admin-profile.admin-active { background:#183129 !important; }
.app.theme-dark .mobile-menu { background:#14241f !important; color:#c3d6d0 !important; }
.app.theme-dark .page-title h1,.app.theme-dark .page-heading h1,.app.theme-dark h1,.app.theme-dark h2,.app.theme-dark h3,.app.theme-dark strong { color:#eef7f3; }
.app.theme-dark .page-title p,.app.theme-dark .page-heading p,.app.theme-dark .card-header p,.app.theme-dark small { color:#91a69f; }

/* New billing animation: three calm physical steps */
.billing-flow { margin-top:24px; display:grid; grid-template-columns:112px 1fr 125px 1fr 112px; align-items:center; gap:10px; padding:12px 14px; border:1px solid rgba(255,255,255,.12); border-radius:14px; background:rgba(0,0,0,.10); }
.billing-flow-step { display:flex; flex-direction:column; align-items:center; gap:7px; color:#c8e1da; font-size:7px; font-weight:800; letter-spacing:.8px; text-align:center; }
.flow-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:10px; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.14); }
.flow-icon.printer { background:rgba(185,223,121,.13); color:#d8efb8; }
.flow-icon.paper { background:rgba(113,211,178,.13); color:#bcefe0; }
.billing-flow-line { height:2px; display:flex; align-items:center; gap:5px; overflow:hidden; }
.billing-flow-line:before { content:""; flex:1; height:1px; background:rgba(255,255,255,.20); }
.billing-flow-line i { width:5px; height:5px; border-radius:50%; background:#b9df79; animation:flowDot 1.7s ease-in-out infinite; opacity:.25; }
.billing-flow-line i:nth-child(2){animation-delay:.28s}.billing-flow-line i:nth-child(3){animation-delay:.56s}
@keyframes flowDot { 0%,100%{transform:scale(.7);opacity:.2} 50%{transform:scale(1.35);opacity:1} }
.billing-machine.is-printing .billing-flow-step:nth-child(1) .flow-icon { animation:flowConfirm .55s ease-out; }
.billing-machine.is-printing .billing-flow-step:nth-child(3) .flow-icon { animation:printerReceive .8s .65s ease-out both; }
.billing-machine.is-printing .billing-flow-step:nth-child(5) .flow-icon { animation:receiptReady .7s 1.25s ease-out both; }
@keyframes flowConfirm { 50%{transform:scale(1.08);box-shadow:0 0 0 7px rgba(185,223,121,.08)} }
@keyframes printerReceive { 50%{transform:translateY(-3px);box-shadow:0 8px 22px rgba(185,223,121,.16)} }
@keyframes receiptReady { 0%{transform:translateY(4px);opacity:.45} 100%{transform:translateY(0);opacity:1} }

/* Make the receipt physically emerge from the printer, not float */
.billing-machine-receipt .printed-paper { transform:translateY(-2px); opacity:.35; }
.billing-machine.is-printing .billing-machine-receipt .printed-paper { animation:cleanPaperFeed 2.2s cubic-bezier(.22,.75,.2,1) .55s both; }
@keyframes cleanPaperFeed { 0%{transform:translateY(-12px);opacity:.15} 18%{opacity:1} 60%{transform:translateY(8px)} 100%{transform:translateY(0);opacity:1} }
.billing-machine.is-printing .receipt-printer { animation:printerBody 1.1s ease-in-out .45s both; }
@keyframes printerBody { 40%{transform:translateY(-2px)} 70%{transform:translateY(1px)} }

@media(max-width:700px){
  .transactions-title-row { align-items:flex-start; flex-direction:column; }
  .billing-flow { grid-template-columns:1fr; gap:8px; padding:12px; }
  .billing-flow-line { height:18px; width:2px; margin:auto; flex-direction:column; }
  .billing-flow-line:before { width:1px; height:100%; flex:none; }
  .billing-flow-line i { display:none; }
}
@media(prefers-reduced-motion:reduce){
  .billing-flow-line i,.billing-machine.is-printing .billing-flow-step .flow-icon,.billing-machine.is-printing .billing-machine-receipt .printed-paper,.billing-machine.is-printing .receipt-printer { animation:none !important; }
}
`;



const AL_KANZ_FULL_MOTION_CSS = `
/* ============================================================
   AL KANZ — FULL MOTION SYSTEM
   ============================================================ */
.app{--motion-ease:cubic-bezier(.22,.8,.22,1);position:relative;isolation:isolate}
.app::before{content:"";position:fixed;inset:-20%;z-index:-2;pointer-events:none;background:radial-gradient(circle at 18% 18%,rgba(89,196,161,.075),transparent 24%),radial-gradient(circle at 82% 30%,rgba(183,222,116,.055),transparent 22%),radial-gradient(circle at 55% 88%,rgba(69,157,132,.045),transparent 25%);animation:ambientDrift 18s ease-in-out infinite alternate}
@keyframes ambientDrift{0%{transform:translate3d(-1.5%,-1%,0) scale(1)}50%{transform:translate3d(1.5%,1%,0) scale(1.025)}100%{transform:translate3d(-.5%,1.5%,0) scale(1.01)}}
.topbar{position:relative;z-index:30;transition:background .45s var(--motion-ease),box-shadow .45s var(--motion-ease),border-color .45s var(--motion-ease)}
.topbar::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,transparent,var(--green),transparent);animation:topbarSweep 1.1s var(--motion-ease) .1s both}
@keyframes topbarSweep{to{transform:scaleX(1)}}
.page-motion{animation:pageEnter .52s var(--motion-ease) both;transform-origin:50% 8%;position:relative}
@keyframes pageEnter{0%{opacity:0;transform:translateY(12px) scale(.992);filter:blur(3px)}55%{opacity:1;filter:blur(0)}100%{opacity:1;transform:translateY(0) scale(1)}}
.page-motion>*{animation:sectionRise .6s var(--motion-ease) both}.page-motion>*:nth-child(1){animation-delay:.04s}.page-motion>*:nth-child(2){animation-delay:.09s}.page-motion>*:nth-child(3){animation-delay:.14s}.page-motion>*:nth-child(4){animation-delay:.19s}.page-motion>*:nth-child(5){animation-delay:.24s}
@keyframes sectionRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.sidebar{transition:width .38s var(--motion-ease),transform .38s var(--motion-ease),box-shadow .38s var(--motion-ease);will-change:width,transform}
.nav-group{animation:navGroupIn .65s var(--motion-ease) both}.nav-group:nth-child(1){animation-delay:.05s}.nav-group:nth-child(2){animation-delay:.1s}.nav-group:nth-child(3){animation-delay:.15s}.nav-group:nth-child(4){animation-delay:.2s}
@keyframes navGroupIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
.nav-item{position:relative;overflow:hidden;transition:transform .22s var(--motion-ease),background .22s ease,color .22s ease,padding .45s var(--motion-ease)}
.nav-item::before{content:"";position:absolute;top:0;bottom:0;left:0;width:3px;border-radius:0 5px 5px 0;background:var(--green);transform:scaleY(0);transform-origin:center;transition:transform .25s var(--motion-ease)}
.nav-item:hover{transform:translateX(3px)}.nav-item:hover::before,.nav-item.selected::before{transform:scaleY(1)}.nav-item svg{transition:transform .3s var(--motion-ease)}.nav-item:hover svg{transform:scale(1.08) rotate(-3deg)}
.sub-menu{animation:subMenuOpen .3s var(--motion-ease) both;transform-origin:top}@keyframes subMenuOpen{from{opacity:0;transform:scaleY(.82) translateY(-4px)}to{opacity:1;transform:scaleY(1) translateY(0)}}.sub-menu button{transition:transform .2s ease,color .2s ease,background .2s ease}.sub-menu button:hover{transform:translateX(4px)}
.primary-button,.secondary-button,.hero-actions button,.create-bill-button,.job-payment-button,.jobs-new-button,.filter-button,.text-button,.modal-footer button,.settings-form-actions button{position:relative;overflow:hidden;transition:transform .2s var(--motion-ease),box-shadow .25s var(--motion-ease),filter .2s ease}
.primary-button::after,.create-bill-button::after,.hero-actions button::after,.jobs-new-button::after{content:"";position:absolute;top:-60%;left:-80%;width:45%;height:220%;transform:rotate(18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.24),transparent);transition:left .65s var(--motion-ease);pointer-events:none}.primary-button:hover,.create-bill-button:hover,.jobs-new-button:hover{transform:translateY(-2px);box-shadow:0 12px 25px rgba(14,92,76,.18)}.primary-button:hover::after,.create-bill-button:hover::after,.hero-actions button:hover::after,.jobs-new-button:hover::after{left:145%}.primary-button:active,.secondary-button:active,.hero-actions button:active,.create-bill-button:active,.jobs-new-button:active,.filter-button:active,.modal-footer button:active{transform:translateY(1px) scale(.985)}
.card,.stat-card,.chart-card,.report-card,.report-box,.reports-chart-card,.customer-card,.material-card,.staff-card,.jobs-modern-card,.table-card,.settings-card,.appearance-card,.account-big-card,.daily-expense-card,.quotation-form-card,.billing-transactions-card{transition:transform .35s var(--motion-ease),box-shadow .35s var(--motion-ease),border-color .35s ease}
.card:hover,.stat-card:hover,.chart-card:hover,.report-card:hover,.reports-chart-card:hover,.customer-card:hover,.material-card:hover,.staff-card:hover,.jobs-modern-card:hover,.table-card:hover,.settings-card:hover,.appearance-card:hover,.account-big-card:hover,.daily-expense-card:hover,.quotation-form-card:hover,.billing-transactions-card:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(15,55,47,.10)}
.theme-dark .card:hover,.theme-dark .stat-card:hover,.theme-dark .chart-card:hover,.theme-dark .report-card:hover,.theme-dark .reports-chart-card:hover,.theme-dark .customer-card:hover,.theme-dark .material-card:hover,.theme-dark .staff-card:hover,.theme-dark .jobs-modern-card:hover,.theme-dark .table-card:hover,.theme-dark .settings-card:hover,.theme-dark .appearance-card:hover,.theme-dark .account-big-card:hover,.theme-dark .daily-expense-card:hover,.theme-dark .quotation-form-card:hover,.theme-dark .billing-transactions-card:hover{box-shadow:0 18px 42px rgba(0,0,0,.32)}
.stat-card strong,.billing-stats strong,.report-box strong{animation:numberReveal .65s var(--motion-ease) both}@keyframes numberReveal{from{opacity:0;transform:translateY(7px);filter:blur(2px)}to{opacity:1;transform:none;filter:none}}
.hero{position:relative;overflow:hidden}.hero::after{content:"";position:absolute;width:220px;height:220px;right:-80px;top:-100px;border:1px solid rgba(185,223,121,.20);border-radius:50%;animation:heroOrbit 8s linear infinite;pointer-events:none}@keyframes heroOrbit{to{transform:rotate(360deg) translateX(5px) rotate(-360deg)}}.hero-ring{animation:ringBreath 4s ease-in-out infinite}.ring-two{animation-delay:1s}@keyframes ringBreath{0%,100%{transform:scale(.98);opacity:.5}50%{transform:scale(1.03);opacity:.9}}.hero-sofa{animation:sofaFloat 3.8s ease-in-out infinite}@keyframes sofaFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.global-search,.jobs-search-modern,.jobs-status-filter,input,select,textarea{transition:border-color .25s ease,box-shadow .25s ease,transform .2s ease,background .25s ease}.global-search:focus-within,.jobs-search-modern:focus-within{transform:translateY(-1px);box-shadow:0 0 0 3px rgba(72,166,139,.10)}input:focus,select:focus,textarea:focus{box-shadow:0 0 0 3px rgba(72,166,139,.10)}
.table-row,.transaction-row,.invoice-row{transition:background .22s ease,transform .22s var(--motion-ease),box-shadow .22s ease}.table-row:hover,.transaction-row:hover,.invoice-row:hover{transform:translateX(3px)}
.admin-dropdown,.notification-popover{animation:popoverIn .28s var(--motion-ease) both;transform-origin:top right}@keyframes popoverIn{from{opacity:0;transform:translateY(-7px) scale(.96)}to{opacity:1;transform:none}}.admin-profile div{transition:transform .3s var(--motion-ease),box-shadow .3s ease}.admin-profile:hover div{transform:rotate(-5deg) scale(1.06);box-shadow:0 5px 16px rgba(77,163,135,.18)}.notification.active svg{animation:bellMotion .65s ease both}@keyframes bellMotion{0%{transform:rotate(0)}20%{transform:rotate(13deg)}40%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-5deg)}100%{transform:rotate(0)}}.notification i{animation:notificationPulse 2s ease-in-out infinite}@keyframes notificationPulse{0%,100%{transform:scale(.85);opacity:.65}50%{transform:scale(1.25);opacity:1}}
.modal-backdrop,.modal-overlay{animation:backdropIn .25s ease both}.modal{animation:modalRise .4s var(--motion-ease) both}@keyframes backdropIn{from{opacity:0}to{opacity:1}}@keyframes modalRise{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:none}}.modal-close{transition:transform .25s ease,background .2s ease}.modal-close:hover{transform:rotate(90deg)}
.field{animation:fieldIn .45s var(--motion-ease) both}.field:nth-child(2){animation-delay:.03s}.field:nth-child(3){animation-delay:.06s}.field:nth-child(4){animation-delay:.09s}.field:nth-child(5){animation-delay:.12s}.field:nth-child(6){animation-delay:.15s}@keyframes fieldIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
.billing-machine{position:relative;overflow:hidden}.billing-machine::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(110deg,transparent 0%,rgba(255,255,255,.035) 42%,transparent 58%);transform:translateX(-120%);animation:machineSweep 6s ease-in-out infinite}@keyframes machineSweep{0%,72%{transform:translateX(-120%)}88%,100%{transform:translateX(120%)}}.billing-machine-screen{transition:transform .4s var(--motion-ease),box-shadow .4s ease}.billing-machine:hover .billing-machine-screen{transform:translateY(-2px);box-shadow:0 14px 32px rgba(0,0,0,.12)}
.billing-transfer-animation-v2,.billing-flow{position:relative}.billing-transfer-animation-v2::before,.billing-flow::before{content:"";position:absolute;left:8%;right:8%;top:50%;height:1px;background:linear-gradient(90deg,transparent,rgba(185,223,121,.30),transparent);pointer-events:none}.billing-transfer-animation-v2 .wave-track span{animation:signalWave 1.8s ease-in-out infinite}.billing-transfer-animation-v2 .wave-track span:nth-child(2){animation-delay:.12s}.billing-transfer-animation-v2 .wave-track span:nth-child(3){animation-delay:.24s}.billing-transfer-animation-v2 .wave-track span:nth-child(4){animation-delay:.36s}.billing-transfer-animation-v2 .wave-track span:nth-child(5){animation-delay:.48s}@keyframes signalWave{0%,100%{transform:translateY(5px) scale(.82);opacity:.28}50%{transform:translateY(-5px) scale(1.15);opacity:1}}
.quotation-form-card .quotation-preview,.quotation-form-card .invoice-preview,.invoice-paper,.quotation-paper{transition:transform .4s var(--motion-ease),box-shadow .4s ease}.quotation-form-card:hover .quotation-preview,.quotation-form-card:hover .invoice-preview{transform:translateY(-3px);box-shadow:0 18px 38px rgba(20,65,55,.12)}
.report-chart path,.chart-card path{animation:chartDraw 1.3s var(--motion-ease) both}@keyframes chartDraw{from{stroke-dasharray:900;stroke-dashoffset:900;opacity:.2}to{stroke-dashoffset:0;opacity:1}}
.loading,.skeleton{animation:skeletonPulse 1.4s ease-in-out infinite}@keyframes skeletonPulse{0%,100%{opacity:.55}50%{opacity:1}}
.sidebar-overlay{animation:overlayIn .25s ease both}@keyframes overlayIn{from{opacity:0}to{opacity:1}}
@media(max-width:850px){.sidebar.sidebar-open{animation:mobileSidebarIn .42s var(--motion-ease) both}@keyframes mobileSidebarIn{from{transform:translateX(-102%)}to{transform:translateX(0)}}.page-motion{animation-duration:.42s}.card:hover,.stat-card:hover,.chart-card:hover,.report-card:hover,.reports-chart-card:hover,.customer-card:hover,.material-card:hover,.staff-card:hover,.jobs-modern-card:hover,.table-card:hover,.settings-card:hover,.appearance-card:hover,.account-big-card:hover,.daily-expense-card:hover,.quotation-form-card:hover,.billing-transactions-card:hover{transform:translateY(-2px)}}
.app.theme-dark::before{background:radial-gradient(circle at 18% 18%,rgba(89,196,161,.08),transparent 24%),radial-gradient(circle at 82% 30%,rgba(183,222,116,.055),transparent 22%),radial-gradient(circle at 55% 88%,rgba(69,157,132,.055),transparent 25%)}.app.theme-dark .topbar::after{background:linear-gradient(90deg,transparent,#73d4b2,transparent)}
@media(prefers-reduced-motion:reduce){.app::before,.topbar::after,.page-motion,.page-motion>*,.nav-group,.sub-menu,.hero::after,.hero-ring,.hero-sofa,.stat-card strong,.billing-machine::before,.billing-transfer-animation-v2 .wave-track span,.admin-dropdown,.notification-popover,.modal-backdrop,.modal-overlay,.modal,.field,.notification i,.notification.active svg,.report-chart path,.chart-card path,.loading,.skeleton,.sidebar-overlay,.sidebar.sidebar-open{animation:none!important}.card,.stat-card,.chart-card,.report-card,.reports-chart-card,.customer-card,.material-card,.staff-card,.jobs-modern-card,.table-card,.settings-card,.appearance-card,.account-big-card,.daily-expense-card,.quotation-form-card,.billing-transactions-card,.nav-item,.primary-button,.secondary-button,.hero-actions button,.create-bill-button,.job-payment-button,.jobs-new-button,.filter-button,.text-button{transition:none!important}}


/* ============================================================
   AL KANZ FINAL UX PASS — DAY/NIGHT + REAL CONTROLS + MOBILE
============================================================ */
.app.theme-day {
  --bg:#f3f8f7; --white:#ffffff; --soft:#f8fbfa; --green:#146b5e; --green-dark:#0b4d43;
  --green-light:#e4f4ef; --sidebar:#0a3f38; --sidebar-2:#115348; --sidebar-text:#bcd6d0;
  --text:#14282a; --text-2:#53686b; --muted:#87999b; --border:#dce8e6;
  --shadow:0 18px 45px rgba(14,67,58,.08);
}
.app.theme-night { color-scheme:dark; }
.app.theme-night .global-search-results,.app.theme-night .ai-panel,.app.theme-night .entity-preview-modal,.app.theme-night .print-options-modal { background:#101b18; border-color:#2b403a; color:#eef7f3; }
.app.theme-night .search-result,.app.theme-night .ai-suggestions button,.app.theme-night .print-option-list button { color:#e5f0ed; border-color:#263a35; }
.app.theme-night .search-result:hover,.app.theme-night .ai-suggestions button:hover,.app.theme-night .print-option-list button:hover { background:#173028; }
.app.theme-night .report-toolbar { background:linear-gradient(135deg,#10251f,#0c1a17); border-color:#2b403a; }
.app.theme-night .report-toolbar strong,.app.theme-night .report-toolbar small { color:#edf6f2; }
.app.theme-night .quotation-ai-box { background:#12261f; border-color:#2c4a40; }
.app.theme-night .quotation-ai-box p { color:#b8ccc6; }
.app.theme-night .theme-option { background:#101b18 !important; }
.app.theme-night .theme-preview-day { background:linear-gradient(135deg,#fff 0 50%,#dff2ec 50%); }

/* Day/Night previews */
.theme-preview-day { background:linear-gradient(135deg,#ffffff 0 50%,#cfece4 50%); }
.theme-preview-night { background:linear-gradient(135deg,#091714 0 50%,#62c7a7 50%); }
.theme-options-two { grid-template-columns:repeat(2,minmax(0,1fr)); }

/* Smart search */
.global-search-wrap { position:relative; min-width:0; }
.global-search { min-width:260px; }
.search-clear { margin-left:auto; width:24px; height:24px; border-radius:7px; display:grid; place-items:center; background:transparent; color:var(--muted); }
.search-clear:hover { background:var(--green-light); color:var(--green); }
.global-search-results { position:absolute; top:calc(100% + 9px); right:0; width:min(430px,calc(100vw - 28px)); background:var(--white); border:1px solid var(--border); border-radius:16px; box-shadow:0 22px 60px rgba(15,48,43,.18); padding:8px; z-index:120; animation:searchDrop .22s ease both; }
.search-results-head { display:flex; justify-content:space-between; padding:8px 10px; color:var(--muted); font-size:8px; font-weight:900; letter-spacing:1.3px; }
.search-result { width:100%; display:grid; grid-template-columns:32px 1fr 18px; align-items:center; gap:9px; text-align:left; padding:10px; border-radius:11px; background:transparent; color:var(--text); }
.search-result:hover { background:var(--soft); }
.search-result-icon { width:30px; height:30px; display:grid; place-items:center; border-radius:9px; background:var(--green-light); color:var(--green); }
.search-result strong,.search-result small { display:block; }
.search-result strong { font-size:10px; }
.search-result small { margin-top:3px; color:var(--muted); font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.search-empty { display:grid; justify-items:center; gap:5px; padding:24px 12px; color:var(--muted); }
.search-empty strong { color:var(--text); font-size:11px; }
.search-empty span { font-size:9px; }
@keyframes searchDrop { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:none; } }

/* AI */
.ai-help-button { height:36px; display:flex; align-items:center; gap:7px; padding:0 11px; border-radius:10px; background:var(--green-light); color:var(--green); font-size:10px; font-weight:800; transition:.25s ease; }
.ai-help-button:hover,.ai-help-button.active { transform:translateY(-1px); box-shadow:0 9px 20px rgba(20,107,94,.13); }
.ai-panel { position:fixed; top:74px; right:22px; width:min(410px,calc(100vw - 30px)); background:var(--white); color:var(--text); border:1px solid var(--border); border-radius:18px; box-shadow:0 25px 70px rgba(12,50,44,.22); z-index:110; padding:15px; animation:aiPanelIn .3s cubic-bezier(.2,.8,.2,1) both; }
.ai-panel-head { display:flex; justify-content:space-between; gap:14px; padding:3px 3px 13px; }
.ai-panel-head > div > span { display:flex; align-items:center; gap:5px; color:var(--green); font-size:8px; font-weight:900; letter-spacing:1.2px; }
.ai-panel-head h3 { margin-top:6px; font-size:16px; }
.ai-panel-head p { margin-top:4px; color:var(--muted); font-size:9px; line-height:1.5; }
.ai-panel-head > button { width:28px; height:28px; border-radius:8px; background:var(--soft); color:var(--muted); }
.ai-suggestions { display:grid; gap:7px; }
.ai-suggestions button { width:100%; display:grid; grid-template-columns:31px 1fr 16px; align-items:center; gap:9px; text-align:left; padding:10px; border:1px solid var(--border); border-radius:11px; background:var(--soft); color:var(--text); }
.ai-suggestions button:hover { border-color:var(--green); transform:translateX(2px); }
.ai-suggestions strong,.ai-suggestions small { display:block; }
.ai-suggestions strong { font-size:10px; }
.ai-suggestions small { margin-top:3px; color:var(--muted); font-size:8px; line-height:1.45; }
.ai-suggestion-number { width:28px; height:28px; display:grid; place-items:center; border-radius:8px; background:var(--green-light); color:var(--green); font-size:8px; font-weight:900; }
@keyframes aiPanelIn { from{opacity:0;transform:translateY(-9px) scale(.98)} to{opacity:1;transform:none} }

/* Dashboard redesign */
.page-heading { position:relative; padding:7px 0 18px; }
.page-heading::after { content:""; position:absolute; right:0; top:0; width:180px; height:100px; border-radius:50%; background:radial-gradient(circle,rgba(113,211,178,.16),transparent 68%); pointer-events:none; }
.page-heading h1 { font-size:32px; letter-spacing:-1.3px; }
.hero { min-height:275px; border-radius:24px; box-shadow:0 22px 55px rgba(11,75,65,.18); }
.hero-text h2 { font-size:36px; line-height:1.05; letter-spacing:-1.4px; }
.hero-visual { transform:scale(1.08); }
.stats { gap:14px; }
.stat-card { border-radius:17px; min-height:112px; }
.two-column > .card { border-radius:20px; }
.card-header h2 { letter-spacing:-.45px; }

/* Eye/view controls always visibly clickable */
.row-action,.dots { cursor:pointer !important; }
.row-action { transition:transform .2s ease,background .2s ease,box-shadow .2s ease; }
.row-action:hover { transform:translateY(-2px) scale(1.04); box-shadow:0 8px 18px rgba(20,107,94,.12); }
.card-actions { display:flex; gap:5px; align-items:center; }
.staff-card-footer { display:flex; align-items:center; justify-content:space-between; margin-top:10px; }

/* Quotation */
.quotation-action-bar { flex-wrap:wrap; }
.quotation-ai-box { grid-column:1/-1; padding:12px; border:1px solid #d7e9e4; background:#f1f8f6; border-radius:13px; }
.quotation-ai-box > div { display:flex; align-items:center; gap:9px; color:var(--green); }
.quotation-ai-box strong,.quotation-ai-box small { display:block; }
.quotation-ai-box strong { color:var(--text); font-size:10px; }
.quotation-ai-box small { margin-top:2px; color:var(--muted); font-size:8px; }
.quotation-ai-box > button { margin-top:9px; }
.quotation-ai-box p { margin-top:9px; padding-top:9px; border-top:1px dashed var(--border); color:var(--text-2); font-size:9px; line-height:1.6; }
.print-options-modal,.entity-preview-modal { position:relative; width:min(560px,94vw); padding:25px; }
.print-options-modal > h2,.entity-preview-modal > h2 { margin:7px 0 5px; font-size:21px; }
.print-options-modal > p,.entity-preview-subtitle { color:var(--text-2); font-size:10px; line-height:1.6; }
.print-option-list { margin-top:18px; display:grid; gap:8px; }
.print-option-list button { display:grid; grid-template-columns:38px 1fr 16px; gap:10px; align-items:center; padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--soft); color:var(--text); text-align:left; transition:.2s ease; }
.print-option-list button:hover { transform:translateX(3px); border-color:var(--green); }
.print-option-icon { width:36px; height:36px; display:grid; place-items:center; border-radius:10px; background:var(--green-light); color:var(--green); }
.print-option-list strong,.print-option-list small { display:block; }
.print-option-list strong { font-size:10px; }
.print-option-list small { margin-top:3px; color:var(--muted); font-size:8px; }
.entity-preview-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:18px; }
.entity-preview-grid > div { padding:11px; border:1px solid var(--border); border-radius:10px; background:var(--soft); }
.entity-preview-grid small,.entity-preview-grid strong { display:block; }
.entity-preview-grid small { color:var(--muted); font-size:7px; letter-spacing:.8px; }
.entity-preview-grid strong { margin-top:5px; font-size:10px; overflow-wrap:anywhere; }

/* Reports */
.report-toolbar { margin:0 0 16px; padding:15px 17px; border:1px solid var(--border); border-radius:16px; background:linear-gradient(135deg,#fafffd,#eef8f5); display:flex; align-items:center; justify-content:space-between; gap:15px; }
.report-toolbar span,.report-toolbar strong,.report-toolbar small { display:block; }
.report-toolbar span { font-size:7px; letter-spacing:1.4px; color:var(--green); font-weight:900; }
.report-toolbar strong { margin-top:4px; font-size:12px; }
.report-toolbar small { margin-top:3px; color:var(--muted); font-size:8px; }
.report-toolbar-actions { display:flex; gap:8px; flex-wrap:wrap; }

/* Buttons: every interactive control gives feedback */
button { -webkit-tap-highlight-color:transparent; }
button:focus-visible { outline:2px solid var(--green); outline-offset:2px; }

/* Compact mobile sidebar with icon + small label */
@media(max-width:850px){
  .ai-help-button span { display:none; }
  .ai-help-button { width:36px; padding:0; justify-content:center; }
  .topbar-right { gap:6px; }
}
@media(max-width:600px){
  .sidebar { width:218px !important; }
  .brand-area { padding:15px 12px 12px !important; }
  .brand-logo { width:34px !important; height:34px !important; }
  .brand { gap:8px !important; }
  .brand strong { font-size:10px !important; }
  .brand span { font-size:6px !important; letter-spacing:1px !important; }
  .workshop-status { margin:7px 9px !important; height:31px !important; font-size:8px !important; }
  .nav-scroll { padding:8px 8px 14px !important; }
  .nav-section-title { font-size:6px !important; letter-spacing:1.2px !important; padding:8px 8px 5px !important; }
  .nav-item { min-height:32px !important; padding:0 8px !important; border-radius:8px !important; font-size:9px !important; gap:8px !important; }
  .nav-item svg { width:15px !important; height:15px !important; flex:0 0 15px !important; }
  .nav-item > svg:last-child { width:12px !important; }
  .sub-menu { padding:2px 0 5px 29px !important; }
  .sub-menu button { min-height:25px !important; font-size:8px !important; padding:0 7px !important; }
  .account-card { padding:8px !important; gap:7px !important; }
  .account-avatar { width:27px !important; height:27px !important; font-size:8px !important; }
  .account-card strong { font-size:8px !important; }
  .account-card span { font-size:7px !important; }
  .logout { font-size:8px !important; }
  .page-heading h1 { font-size:24px !important; }
  .hero-text h2 { font-size:27px !important; }
  .hero { min-height:250px !important; border-radius:18px !important; }
  .report-toolbar { align-items:flex-start; flex-direction:column; }
  .report-toolbar-actions { width:100%; }
  .report-toolbar-actions button { flex:1; }
  .theme-options-two { grid-template-columns:1fr; }
  .entity-preview-grid { grid-template-columns:1fr; }
  .global-search { min-width:0 !important; width:100%; }
  .global-search-wrap { flex:1; }
  .global-search-results { right:auto; left:0; }
}
@media(max-width:480px){
  .topbar { gap:6px !important; }
  .breadcrumb { display:none !important; }
  .topbar-right { flex:1; }
  .global-search input { font-size:9px !important; }
  .global-search { height:34px !important; }
  .notification,.admin-profile,.ai-help-button { height:34px !important; }
  .admin-profile section { display:none !important; }
  .admin-profile { width:34px !important; padding:0 !important; justify-content:center !important; }
}

.billing-action-strip{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 16px;padding:12px 15px;border:1px solid var(--border);border-radius:14px;background:var(--soft);}
.billing-action-strip span,.billing-action-strip strong,.billing-action-strip small{display:block}.billing-action-strip span{font-size:7px;letter-spacing:1.3px;color:var(--green);font-weight:900}.billing-action-strip strong{font-size:10px;margin-top:3px}.billing-action-strip small{font-size:8px;color:var(--muted);margin-top:2px}.billing-action-strip>div:last-child{display:flex;gap:7px;flex-wrap:wrap}
.app.theme-night .billing-action-strip{background:#101b18;border-color:#2b403a}.app.theme-night .billing-action-strip strong{color:#edf7f3}
@media(max-width:600px){.billing-action-strip{align-items:flex-start;flex-direction:column}.billing-action-strip>div:last-child{width:100%}.billing-action-strip .secondary-button{flex:1}}

@media(prefers-reduced-motion:reduce){
  .ai-panel,.global-search-results { animation:none !important; }
}
`;




const AL_KANZ_LIGHT_UI = `
.quick-nav{
  position:relative; z-index:8; padding:7px 22px 0;
  background:var(--bg);
}
.quick-nav-inner{
  display:flex; align-items:center; gap:6px; min-height:38px;
  padding:4px 6px; border:1px solid var(--border); border-radius:12px;
  background:var(--card); box-shadow:0 3px 12px rgba(31,65,55,.035);
  overflow-x:auto; scrollbar-width:none;
}
.quick-nav-inner::-webkit-scrollbar{display:none}
.quick-nav-label{
  flex:0 0 auto; padding:0 7px; font-size:7px; font-weight:900;
  letter-spacing:1.2px; color:var(--muted);
}
.quick-nav-button{
  flex:0 0 auto; height:29px; padding:0 10px; border:1px solid transparent;
  border-radius:8px; background:transparent; color:var(--text);
  display:inline-flex; align-items:center; gap:6px; font-size:8px; font-weight:800;
  cursor:pointer; transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease;
}
.quick-nav-button:hover{background:var(--soft); border-color:var(--border); transform:translateY(-1px)}
.quick-nav-button.active{background:var(--green); color:#fff; box-shadow:0 4px 12px rgba(17,105,82,.16)}
.quick-nav-button:active{transform:scale(.97)}
.mobile-bottom-nav{display:none}

@media(max-width:850px){
  .quick-nav{padding:6px 10px 0}
  .quick-nav-inner{border-radius:10px; min-height:35px}
  .quick-nav-label{display:none}
  .quick-nav-button{height:27px; padding:0 9px; font-size:8px}
}
@media(max-width:600px){
  .quick-nav{padding:5px 8px 0}
  .quick-nav-inner{gap:4px; padding:3px}
  .quick-nav-button span{display:inline}
  .mobile-bottom-nav{
    position:fixed; left:8px; right:8px; bottom:8px; z-index:120;
    display:grid; grid-template-columns:repeat(5,1fr); gap:3px;
    padding:5px; border:1px solid var(--border); border-radius:15px;
    background:rgba(255,255,255,.96); backdrop-filter:blur(14px);
    box-shadow:0 10px 30px rgba(20,40,35,.14);
  }
  .mobile-bottom-nav button{
    min-width:0; height:42px; border:0; border-radius:10px; background:transparent;
    color:var(--muted); display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:2px; font-size:6px; font-weight:800; cursor:pointer;
  }
  .mobile-bottom-nav button.active{background:var(--green); color:#fff}
  .main{padding-bottom:65px}
}
.app.theme-night .quick-nav-inner{background:#111b18;border-color:#263c35}
.app.theme-night .quick-nav-button{color:#dcebe6}
.app.theme-night .quick-nav-button:hover{background:#182722;border-color:#304a41}
.app.theme-night .mobile-bottom-nav{background:rgba(15,23,21,.96);border-color:#2b4039}
.app.theme-night .mobile-bottom-nav button{color:#9fb6ae}
.app.theme-night .mobile-bottom-nav button.active{background:#315c4d;color:#fff}


:root{
  --ak-bg:#f5f7f6;
  --ak-surface:#ffffff;
  --ak-surface-2:#fbfcfc;
  --ak-ink:#17282b;
  --ak-muted:#748488;
  --ak-line:#e4ebea;
  --ak-green:#16816e;
  --ak-green-2:#0f6c5c;
  --ak-green-soft:#e9f6f1;
  --ak-lime:#c8ef75;
  --ak-blue-soft:#edf5fb;
  --ak-orange-soft:#fff4e4;
  --ak-purple-soft:#f4effb;
  --ak-shadow:0 4px 18px rgba(26,50,53,.055);
  --ak-shadow-hover:0 12px 28px rgba(26,50,53,.09);
}
body{background:var(--ak-bg)!important;color:var(--ak-ink)!important;font-family:"Inter","Manrope",system-ui,sans-serif!important}
.app{background:var(--ak-bg)!important;color:var(--ak-ink)!important}
.sidebar{width:228px!important;background:#fff!important;color:#526468!important;border-right:1px solid var(--ak-line)!important;box-shadow:none!important}
.brand-area{padding:22px 17px 16px!important;border-bottom:1px solid var(--ak-line)!important}
.brand-logo{background:var(--ak-lime)!important;color:#244d43!important;border-radius:12px!important}
.brand strong{color:#1a3033!important;font-size:14px!important}
.brand span{color:#8a999b!important}
.workshop-status{background:#f4faf7!important;color:#41625b!important;border:1px solid #e2eee9!important}
.workshop-status span{background:#53b989!important;box-shadow:0 0 0 4px rgba(83,185,137,.12)!important}
.nav-scroll{padding:19px 11px!important}
.nav-section-title{color:#9aa7a9!important;padding-left:12px!important;font-size:8px!important}
.nav-item{color:#5c6d70!important;border-radius:9px!important;height:39px!important;font-size:10px!important;transition:background .18s ease,color .18s ease,transform .18s ease!important}
.nav-item:hover{background:#f1f7f5!important;color:var(--ak-green-2)!important;transform:translateX(2px)}
.nav-item.selected{background:var(--ak-green-soft)!important;color:var(--ak-green-2)!important;box-shadow:inset 3px 0 var(--ak-green)!important;font-weight:800!important}
.nav-item.selected svg{color:var(--ak-green)!important}
.sub-menu button{color:#819092!important}
.sub-menu button:hover,.sub-menu button.sub-selected{color:var(--ak-green-2)!important}
.sub-menu button.sub-selected>span{background:var(--ak-green)!important}
.sidebar-account{border-top:1px solid var(--ak-line)!important;padding:12px!important}
.account-card{background:#f7faf9!important;border:1px solid var(--ak-line)!important}
.account-card strong{color:#263b3e!important}.account-card span{color:#899799!important}
.account-avatar{background:var(--ak-lime)!important;color:#244d43!important}
.topbar{background:rgba(255,255,255,.96)!important;border-bottom:1px solid var(--ak-line)!important;box-shadow:0 1px 0 rgba(0,0,0,.015)!important}
.global-search{background:#f7f9f9!important;border-color:#e2e9e8!important}
.content{max-width:1500px!important;padding:28px 34px 55px!important}
.page-heading,.page-title{margin-bottom:20px!important}
.page-heading h1,.page-title h1{font-size:27px!important;color:#17282b!important}
.primary-button{background:var(--ak-green)!important;border-radius:9px!important;box-shadow:0 5px 14px rgba(22,129,110,.14)!important}
.primary-button:hover{background:var(--ak-green-2)!important}
.secondary-button{border:1px solid var(--ak-line)!important;background:#fff!important;color:#42575b!important;border-radius:9px!important}
.secondary-button:hover{background:#f5f9f8!important;border-color:#cddbd7!important}
.quick-nav{background:transparent!important;padding:0 34px 4px!important}
.quick-nav-inner{background:#fff!important;border:1px solid var(--ak-line)!important;box-shadow:0 2px 10px rgba(26,50,53,.035)!important;border-radius:11px!important;padding:4px!important}
.quick-nav-button{color:#617276!important;border-radius:7px!important}.quick-nav-button:hover{background:#f2f8f6!important;color:var(--ak-green-2)!important}.quick-nav-button.active{background:var(--ak-green)!important;color:#fff!important}
.dashboard-modern{animation:akPageIn .42s cubic-bezier(.2,.8,.2,1) both}
.dashboard-topline{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:18px}
.dashboard-topline h1{margin-top:7px;font-size:29px;letter-spacing:-.035em}
.dashboard-topline p{margin-top:7px;color:var(--ak-muted);font-size:11px}
.dashboard-primary-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.dashboard-action{height:40px!important;padding:0 13px!important;font-size:10px!important;white-space:nowrap}
.workshop-strip{min-height:86px;border:1px solid #dce9e4;border-radius:14px;background:linear-gradient(90deg,#f4faf7,#fffaf1);display:flex;align-items:center;justify-content:space-between;padding:14px 18px;margin-bottom:15px;box-shadow:var(--ak-shadow);overflow:hidden;position:relative}
.workshop-strip:after{content:"";position:absolute;right:-50px;top:-80px;width:220px;height:220px;border-radius:50%;border:1px solid rgba(22,129,110,.09)}
.workshop-strip-main{display:flex;align-items:center;gap:12px;position:relative;z-index:1}.workshop-badge{width:43px;height:43px;border-radius:12px;background:var(--ak-lime);display:grid;place-items:center;color:#2b564b}.workshop-strip-main strong,.workshop-strip-main span{display:block}.workshop-strip-main strong{font-size:12px}.workshop-strip-main span{font-size:9px;color:var(--ak-muted);margin-top:3px}
.workshop-strip-items{display:flex;gap:28px;position:relative;z-index:1}.workshop-strip-items div{padding-left:20px;border-left:1px solid #dce7e3}.workshop-strip-items small,.workshop-strip-items strong{display:block}.workshop-strip-items small{font-size:7px;color:#8b989a;font-weight:800;letter-spacing:.13em}.workshop-strip-items strong{margin-top:5px;font-size:13px}.dashboard-stats{margin-top:0!important;margin-bottom:15px!important;grid-template-columns:repeat(4,1fr)!important;gap:12px!important}
.stat{background:#fff!important;border:1px solid var(--ak-line)!important;border-radius:13px!important;box-shadow:var(--ak-shadow)!important;min-height:99px!important;padding:16px!important;transition:transform .2s ease,box-shadow .2s ease!important}.stat:hover{transform:translateY(-2px)!important;box-shadow:var(--ak-shadow-hover)!important}.stat-icon{border-radius:10px!important}.stat strong{font-size:18px!important}.stat small{font-size:8px!important}
.dashboard-main-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(330px,.8fr);gap:15px}.dashboard-bottom-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(330px,.8fr);gap:15px;margin-top:15px}
.dashboard-card{border:1px solid var(--ak-line)!important;border-radius:14px!important;box-shadow:var(--ak-shadow)!important;background:#fff!important;transition:box-shadow .22s ease,transform .22s ease!important}.dashboard-card:hover{transform:translateY(-2px)!important;box-shadow:var(--ak-shadow-hover)!important}.dashboard-card .card-header{padding:17px 18px 12px!important}.dashboard-card .card-header h2{font-size:14px!important}.dashboard-card .card-header p{font-size:8px!important}
.dashboard-table{padding:0 14px}.dashboard-table-head,.dashboard-table-row{display:grid;grid-template-columns:1.35fr 1.1fr .8fr .75fr 24px;gap:10px;align-items:center}.dashboard-table-head{padding:7px 7px;color:#99a5a7;font-size:7px;font-weight:800;letter-spacing:.12em}.dashboard-table-row{width:100%;min-height:58px;padding:8px 7px;border-top:1px solid #edf1f0;background:#fff;color:#5d6e71;text-align:left;font-size:9px;transition:background .16s ease,transform .16s ease}.dashboard-table-row:hover{background:#f8fbfa;transform:translateX(2px)}.dashboard-table-row>svg{color:#9aa6a8}.dashboard-table-row>strong{color:#263a3d;font-size:10px}.job-customer{display:flex;align-items:center;gap:8px;min-width:0}.job-customer i{width:29px;height:29px;border-radius:9px;background:#eef7f4;color:var(--ak-green);display:grid;place-items:center;font-style:normal;font-size:9px;font-weight:800;flex:none}.job-customer b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#25383b;font-size:9px}.dashboard-card-footer{display:flex;justify-content:space-between;padding:10px 18px 14px;border-top:1px solid #edf1f0}.dashboard-card-footer .text-button{font-size:9px}
.dashboard-action-list{padding:0 12px 8px}.dashboard-action-list .quick-action{border-radius:9px!important;padding:10px 8px!important;transition:background .16s ease,transform .16s ease!important}.dashboard-action-list .quick-action:hover{background:#f5faf8!important;transform:translateX(3px)}.action-link-row{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:9px 16px 15px;border-top:1px solid #edf1f0}.action-link-row button{height:34px;border:1px solid var(--ak-line);border-radius:8px;background:#fbfcfc;color:#526568;display:flex;align-items:center;justify-content:center;gap:6px;font-size:8px;font-weight:800}.action-link-row button:hover{background:var(--ak-green-soft);color:var(--ak-green-2)}
.activity-list{padding:0 18px 12px}.activity-row{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid #edf1f0}.activity-row:first-child{border-top:0}.activity-icon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center}.activity-icon.income{background:#eaf7f2;color:var(--ak-green)}.activity-icon.expense{background:#fff1ef;color:#b85f55}.activity-copy{flex:1;min-width:0}.activity-copy strong,.activity-copy span{display:block}.activity-copy strong{font-size:9px;color:#273a3d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity-copy span{font-size:8px;color:#96a1a3;margin-top:3px}.activity-row>strong{font-size:10px}.income{color:var(--ak-green)!important}.expense{color:#b85f55!important}
.finance-hero{margin:0 18px;padding:14px;border-radius:11px;background:#f5faf8;border:1px solid #e0eee9}.finance-hero span,.finance-hero small{display:block;color:#7d8e91;font-size:8px}.finance-hero strong{display:block;margin-top:5px;font-size:22px;letter-spacing:-.02em}.mini-progress{height:6px;background:#dfece7;border-radius:99px;overflow:hidden;margin:11px 0 6px}.mini-progress i{display:block;height:100%;background:var(--ak-green);border-radius:99px;transition:width .7s cubic-bezier(.2,.8,.2,1)}.finance-lines{padding:7px 18px 10px}.finance-lines div{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #edf1f0}.finance-lines span{font-size:9px;color:#748386}.finance-lines strong{font-size:10px}.orange-text{color:#b9792f!important}.finance-view-button{margin:0 18px 16px;width:calc(100% - 36px);height:35px;border:1px solid #dce8e4;background:#fff;border-radius:8px;color:var(--ak-green-2);display:flex;align-items:center;justify-content:center;gap:6px;font-size:9px;font-weight:800}.finance-view-button:hover{background:var(--ak-green-soft)}
/* Fix the unstyled summary that previously appeared as raw text. */
.billing-summary-list{padding:4px 20px 15px}.billing-summary-list>div{display:flex!important;align-items:center;justify-content:space-between!important;padding:9px 0!important;border-bottom:1px solid #edf1f0!important;color:#748386!important;font-size:9px!important}.billing-summary-list>div strong{font-size:10px!important;color:#263a3d!important}
@keyframes akPageIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media(max-width:1050px){.dashboard-main-grid,.dashboard-bottom-grid{grid-template-columns:1fr}.dashboard-primary-actions{justify-content:flex-start}.dashboard-topline{align-items:flex-start;flex-direction:column}.workshop-strip-items{gap:16px}}
@media(max-width:760px){.sidebar{width:218px!important}.content{padding:20px 14px 70px!important}.quick-nav{padding:0 14px 4px!important}.dashboard-stats{grid-template-columns:repeat(2,1fr)!important}.workshop-strip{align-items:flex-start;flex-direction:column;gap:14px}.workshop-strip-items{width:100%;justify-content:space-between}.workshop-strip-items div{padding-left:10px}.dashboard-table{overflow-x:auto}.dashboard-table-head,.dashboard-table-row{min-width:650px}.dashboard-primary-actions{width:100%}.dashboard-action{flex:1}.action-link-row{grid-template-columns:1fr}.topbar{min-height:62px!important}}
@media(max-width:480px){.dashboard-stats{grid-template-columns:1fr!important}.dashboard-action{flex:auto}.workshop-strip-items{gap:9px}.workshop-strip-items strong{font-size:11px}}

`;

const BILLING_BUTTON_FIX_CSS = `
/* ============================================================
   BILLING BUILDER / PRINT / SHARE
============================================================ */
.bill-builder-backdrop{align-items:center!important;z-index:1200}
.bill-builder-modal{width:min(1120px,96vw);max-height:92vh;overflow:auto;background:var(--white);border:1px solid var(--border);border-radius:24px;box-shadow:0 30px 100px rgba(0,0,0,.25);animation:akModalIn .28s cubic-bezier(.2,.8,.2,1) both}
.bill-builder-head{display:flex;justify-content:space-between;gap:20px;padding:24px 28px;border-bottom:1px solid var(--border)}
.bill-builder-head h2{margin:5px 0;font-family:Manrope,sans-serif;color:var(--text)}
.bill-builder-head p{margin:0;color:var(--muted);font-size:13px}
.bill-builder-grid{display:grid;grid-template-columns:1.1fr .9fr}
.bill-form-pane{padding:24px 28px;border-right:1px solid var(--border)}
.bill-preview-pane{padding:24px;background:var(--soft)}
.bill-section-title{display:flex;align-items:center;gap:11px;margin-bottom:13px}
.bill-section-title>span{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--green-light);color:var(--green);font-size:11px;font-weight:900}
.bill-section-title strong,.bill-section-title small{display:block}
.bill-section-title strong{font-size:14px}.bill-section-title small{font-size:11px;color:var(--muted);margin-top:2px}
.bill-fields{display:grid;gap:12px;margin-bottom:16px}.bill-fields.two{grid-template-columns:1fr 1fr}.bill-fields.three{grid-template-columns:repeat(3,1fr)}
.invoice-preview{background:var(--white);border:1px solid var(--border);border-radius:18px;padding:22px;box-shadow:0 12px 30px rgba(0,0,0,.06)}
.invoice-brand,.invoice-preview-meta,.invoice-item-preview,.invoice-totals span,.invoice-totals>strong{display:flex;justify-content:space-between;align-items:flex-start}
.invoice-brand{align-items:center;border-bottom:1px solid var(--border);padding-bottom:16px}
.invoice-brand strong{display:block;font-family:Manrope,sans-serif;font-size:19px;letter-spacing:2px;color:var(--text)}
.invoice-brand span{display:block;font-size:7px;letter-spacing:2.5px;color:var(--muted)}
.invoice-brand>b{font-size:11px;letter-spacing:2px;color:var(--green)}
.invoice-preview-meta{padding:18px 0;border-bottom:1px solid var(--border);gap:15px}
.invoice-preview-meta small,.invoice-preview-meta span{display:block;color:var(--muted);font-size:9px}.invoice-preview-meta strong{display:block;margin:4px 0;font-size:12px;color:var(--text)}
.invoice-item-preview{padding:18px 0;border-bottom:1px solid var(--border);gap:15px}.invoice-item-preview small,.invoice-item-preview span{display:block;color:var(--muted);font-size:9px}.invoice-item-preview strong{font-size:11px;color:var(--text)}
.invoice-totals{padding:15px 0}.invoice-totals span,.invoice-totals>strong{font-size:10px;color:var(--text-2);padding:5px 0}.invoice-totals b{color:var(--text)}
.invoice-totals>strong{border-top:1px solid var(--border);margin-top:5px;padding-top:12px;font-size:13px;color:var(--text)}.invoice-totals>strong b{font-size:17px;color:var(--green)}
.invoice-note{margin-top:8px;padding:11px;border-radius:10px;background:var(--green-light);color:var(--text-2);font-size:9px;line-height:1.5}
.bill-preview-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}
.post-print-backdrop{z-index:1300}.post-print-modal{width:min(650px,94vw);padding:28px;text-align:left}.post-print-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--green-light);color:var(--green);margin-bottom:14px}
.post-print-modal h2{margin:4px 0 7px}.post-print-modal p{color:var(--muted);line-height:1.55}.post-print-recipient{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--border);border-radius:13px;background:var(--soft);margin:16px 0}.post-print-recipient strong,.post-print-recipient span{display:block}.post-print-recipient span{font-size:11px;color:var(--muted);margin-top:3px}.customer-avatar{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--green-light);color:var(--green);font-weight:900}
.post-print-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.share-btn{min-height:42px;border:1px solid var(--border);border-radius:11px;background:var(--white);color:var(--text);display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:800;cursor:pointer}.share-btn:hover{transform:translateY(-1px)}.share-btn.whatsapp{background:#eaf8ef;border-color:#c7ebd2;color:#168044}.share-btn.botim{background:#eef3ff;border-color:#d5def7;color:#3158a6}.post-print-footer{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}
.print-invoice-sheet{display:none}
@media(max-width:900px){.bill-builder-grid{grid-template-columns:1fr}.bill-form-pane{border-right:0;border-bottom:1px solid var(--border)}.bill-fields.two,.bill-fields.three{grid-template-columns:1fr}.post-print-actions{grid-template-columns:1fr 1fr}}
@media print{
  body.printing-invoice *{visibility:hidden!important}
  body.printing-invoice .print-invoice-sheet,body.printing-invoice .print-invoice-sheet *{visibility:visible!important}
  body.printing-invoice .print-invoice-sheet{display:block!important;position:absolute;left:0;top:0;width:100%;min-height:100vh;padding:45px;font-family:Arial,sans-serif;background:#fff;color:#111}
  .print-sheet-brand{display:flex;justify-content:space-between;align-items:center}.print-sheet-brand strong{font-size:20px;letter-spacing:2px}.print-sheet-brand span{display:block;font-size:8px;letter-spacing:2px;color:#777}.print-sheet-brand b{font-size:13px;letter-spacing:2px}
  .print-sheet-line{height:1px;background:#ddd;margin:25px 0}.print-sheet-meta{display:flex;justify-content:space-between;margin-bottom:35px}.print-sheet-meta small,.print-sheet-meta span{display:block;color:#777;font-size:10px}.print-sheet-meta strong{display:block;margin:5px 0;font-size:15px}
  .print-sheet-item{display:flex;justify-content:space-between;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:18px 0}.print-sheet-item span{display:block;color:#777;font-size:11px;margin-top:5px}.print-sheet-totals{width:300px;margin:25px 0 25px auto}.print-sheet-totals span,.print-sheet-totals>strong{display:flex;justify-content:space-between;padding:7px 0;font-size:11px}.print-sheet-totals>strong{border-top:2px solid #111;font-size:15px;padding-top:12px}.print-sheet-footer{border-top:1px solid #ddd;padding-top:20px;color:#777;font-size:10px;text-align:center}
}
`;


const AL_KANZ_PREMIUM_CRM_REPORT_CSS = `
/* ============================================================
   PREMIUM CRM / REPORTS / AI POLISH
============================================================ */
.crm-toolbar{display:flex;justify-content:space-between;gap:14px;align-items:center;margin:0 0 18px}.crm-search{min-height:46px;flex:1;max-width:700px;display:flex;align-items:center;gap:10px;padding:0 14px;border:1px solid var(--border);background:var(--white);border-radius:13px;box-shadow:0 6px 18px rgba(20,50,45,.04)}.crm-search input{border:0;outline:0;background:transparent;flex:1;color:var(--text);font:inherit;font-size:12px}.crm-search span{font-size:9px;color:var(--muted);font-weight:800}.crm-toolbar-stats{display:flex;gap:9px}.crm-toolbar-stats span{padding:10px 12px;border:1px solid var(--border);background:var(--soft);border-radius:11px;color:var(--muted);font-size:9px}.crm-toolbar-stats strong{color:var(--text);font-size:11px;margin-right:3px}.customer-grid-premium{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}.customer-card-premium{position:relative;overflow:hidden;transition:transform .22s ease,box-shadow .22s ease}.customer-card-premium:after{content:"";position:absolute;inset:auto -25px -50px auto;width:140px;height:140px;border-radius:50%;background:var(--green-light);opacity:.45;pointer-events:none}.customer-card-premium:hover,.supplier-premium-card:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(23,62,55,.09)}.customer-avatar-large{width:48px;height:48px;font-size:14px}.customer-avatar-xl{width:62px;height:62px;font-size:18px}.customer-tier,.supplier-status{font-size:8px;font-weight:900;letter-spacing:.12em;padding:6px 8px;border-radius:999px;background:var(--green-light);color:var(--green);margin-left:auto;margin-right:8px}.customer-card-premium h3{margin-top:14px}.customer-contact-line{display:flex;gap:7px;align-items:center;color:var(--muted);font-size:10px;margin:7px 0}.customer-finance-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:16px 0;padding-top:13px;border-top:1px solid var(--border)}.customer-finance-grid div{min-width:0}.customer-finance-grid small,.supplier-finance small,.crm-kpis small,.crm-contact-grid small{display:block;color:var(--muted);font-size:7px;letter-spacing:.1em;font-weight:900}.customer-finance-grid strong,.supplier-finance strong{display:block;margin-top:5px;font-size:10px}.customer-card-actions{display:flex;gap:8px;position:relative;z-index:2}.customer-card-actions button{flex:1;justify-content:center}.full-width{width:100%;justify-content:center}.supplier-premium-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}.supplier-premium-card{background:var(--white);border:1px solid var(--border);border-radius:17px;padding:19px;transition:transform .22s ease,box-shadow .22s ease}.supplier-card-head{display:flex;align-items:center}.supplier-logo{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:var(--green-light);color:var(--green)}.supplier-logo-xl{width:62px;height:62px}.supplier-premium-card h3{margin:16px 0 4px}.supplier-premium-card p{margin:0;color:var(--muted);font-size:10px}.supplier-contact-stack{display:grid;gap:8px;margin:16px 0}.supplier-contact-stack span{display:flex;gap:7px;align-items:center;color:var(--muted);font-size:10px}.supplier-finance{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:14px}.crm-backdrop{z-index:1400}.crm-profile-modal{width:min(900px,95vw);max-height:90vh;overflow:auto;padding:28px;position:relative}.crm-profile-head{display:flex;gap:15px;align-items:center;padding-right:30px}.crm-profile-head h2{margin:4px 0}.crm-profile-head p{margin:0;color:var(--muted);font-size:11px}.crm-contact-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.crm-contact-grid>div{padding:12px;border:1px solid var(--border);background:var(--soft);border-radius:12px;min-width:0}.crm-contact-grid strong{display:block;margin-top:6px;font-size:10px;word-break:break-word}.crm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.crm-kpis>div{padding:14px;border:1px solid var(--border);border-radius:13px;background:var(--white)}.crm-kpis strong{display:block;margin-top:7px;font-size:14px}.crm-kpis .is-warning{background:rgba(245,179,79,.08);border-color:rgba(245,179,79,.3)}.crm-history-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.section-mini-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.section-mini-head strong{font-size:11px}.section-mini-head span{font-size:8px;color:var(--muted)}.crm-history-list{border:1px solid var(--border);border-radius:13px;overflow:hidden}.crm-history-list>div{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;border-bottom:1px solid var(--border)}.crm-history-list>div:last-child{border-bottom:0}.crm-history-list span b,.crm-history-list span small{display:block}.crm-history-list span b{font-size:9px}.crm-history-list span small{font-size:8px;color:var(--muted);margin-top:3px}.crm-history-list>div>strong{font-size:10px;white-space:nowrap}.report-control-panel{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:18px;padding:10px;border:1px solid var(--border);background:var(--white);border-radius:15px;box-shadow:0 8px 25px rgba(20,50,45,.04)}.report-view-tabs{display:flex;gap:4px;overflow:auto}.report-view-tabs button{border:0;background:transparent;padding:9px 11px;border-radius:9px;color:var(--muted);font-size:9px;font-weight:800;cursor:pointer;white-space:nowrap}.report-view-tabs button.active{background:var(--green-light);color:var(--green)}.report-filters{display:flex;gap:7px;align-items:center}.report-filters select{height:34px;border:1px solid var(--border);border-radius:8px;background:var(--soft);color:var(--text);padding:0 9px;font-size:9px}.report-grid-rich{grid-template-columns:repeat(6,1fr)}.reports-main-grid{display:grid;grid-template-columns:1.7fr .8fr;gap:16px;margin-top:16px}.report-chart-large{min-height:350px}.report-bars-large{height:250px!important}.report-bars-large .bar-wrap>strong{font-size:7px;color:var(--muted);margin-bottom:5px}.report-breakdown-card{padding-bottom:18px}.report-status-ring{width:150px;height:150px;margin:20px auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--green) 0 62%,var(--green-light) 62% 100%);position:relative}.report-status-ring:after{content:"";position:absolute;width:112px;height:112px;background:var(--white);border-radius:50%}.report-status-ring div{position:relative;z-index:1;text-align:center}.report-status-ring strong,.report-status-ring span{display:block}.report-status-ring strong{font-size:28px}.report-status-ring span{font-size:8px;color:var(--muted)}.status-breakdown{display:grid;gap:8px}.status-breakdown div{display:flex;justify-content:space-between;font-size:9px}.status-breakdown span{color:var(--muted)}.status-dot{width:7px;height:7px;display:inline-block;border-radius:50%;margin-right:5px;background:var(--green)}.status-dot.progress{opacity:.7}.status-dot.ready{opacity:.5}.status-dot.delivered{opacity:.35}.reports-bottom-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}.report-list{border-top:1px solid var(--border)}.report-list>div{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)}.report-list span strong,.report-list span small{display:block}.report-list span strong{font-size:9px}.report-list span small{font-size:8px;color:var(--muted);margin-top:3px}.report-list>div>strong{font-size:10px;white-space:nowrap}.ai-panel-rich{width:min(560px,calc(100vw - 32px))}.ai-mode-tabs{display:flex;gap:5px;padding:0 22px 12px;border-bottom:1px solid var(--border)}.ai-mode-tabs button{border:1px solid var(--border);background:var(--soft);border-radius:8px;padding:7px 10px;font-size:9px;font-weight:800;color:var(--muted);cursor:pointer}.ai-mode-tabs button.active{background:var(--green-light);color:var(--green);border-color:transparent}.ai-suggestion-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 22px}.ai-suggestion-grid button{display:flex;align-items:flex-start;gap:9px;text-align:left;padding:11px;border:1px solid var(--border);background:var(--white);border-radius:11px;color:var(--text);cursor:pointer}.ai-suggestion-grid button:hover{transform:translateY(-1px);border-color:var(--green);box-shadow:0 7px 18px rgba(20,80,60,.07)}.ai-card-icon{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--green-light);color:var(--green);flex:0 0 auto}.ai-suggestion-grid strong,.ai-suggestion-grid small{display:block}.ai-suggestion-grid strong{font-size:9px}.ai-suggestion-grid small{font-size:8px;line-height:1.4;color:var(--muted);margin-top:3px}.ai-ask{padding:14px 22px}.ai-answer{display:flex;gap:9px;padding:12px;border:1px solid var(--border);border-radius:11px;background:var(--soft);font-size:10px;line-height:1.5}.ai-input{display:flex;gap:7px;margin-top:10px}.ai-input input{flex:1;border:1px solid var(--border);border-radius:10px;padding:11px;background:var(--white);color:var(--text);outline:0;font-size:10px}.ai-input button{width:40px;border:0;border-radius:10px;background:var(--green);color:white}.ai-chip-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.ai-chip-row button{border:1px solid var(--border);background:var(--white);border-radius:999px;padding:6px 9px;color:var(--muted);font-size:8px}.ai-panel-footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding:11px 22px;color:var(--muted);font-size:8px}.ai-panel-footer button{border:0;background:transparent;color:var(--green);font-size:8px;font-weight:800}.theme-dark .crm-search,.theme-dark .report-control-panel,.theme-dark .crm-profile-modal,.theme-dark .supplier-premium-card,.theme-dark .customer-card-premium,.theme-dark .ai-suggestion-grid button,.theme-dark .ai-input input{background:var(--white)}
@media(max-width:1050px){.report-grid-rich{grid-template-columns:repeat(3,1fr)}.crm-contact-grid{grid-template-columns:repeat(2,1fr)}.report-control-panel{align-items:flex-start;flex-direction:column}.report-filters{flex-wrap:wrap}.reports-bottom-grid{grid-template-columns:1fr}.reports-main-grid{grid-template-columns:1fr}}
@media(max-width:700px){.crm-toolbar,.crm-toolbar-stats{flex-direction:column;align-items:stretch}.crm-toolbar-stats{display:grid;grid-template-columns:1fr 1fr}.report-grid-rich{grid-template-columns:1fr 1fr}.crm-contact-grid,.crm-kpis,.crm-history-grid{grid-template-columns:1fr}.ai-suggestion-grid{grid-template-columns:1fr}.report-filters{width:100%}.report-filters select,.report-filters button{flex:1}.report-view-tabs{width:100%}.report-control-panel{padding:8px}.crm-profile-modal{padding:20px}.customer-finance-grid,.supplier-finance{grid-template-columns:1fr 1fr}}
`;

const AL_KANZ_CRM_DETAIL_CSS = `
.form-section-label{display:flex;justify-content:space-between;align-items:center;margin:4px 0 11px;padding-top:4px}.form-section-label span{font-size:8px;font-weight:900;letter-spacing:.13em;color:var(--green)}.form-section-label small{font-size:8px;color:var(--muted)}
.invoice-contact-card{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}.invoice-contact-card>div{padding:10px;border:1px solid var(--border);background:var(--soft);border-radius:10px;min-width:0}.invoice-contact-card span{display:block;font-size:7px;color:var(--muted);font-weight:900;letter-spacing:.1em}.invoice-contact-card strong{display:block;margin-top:5px;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.invoice-share-center{margin-top:15px;padding:14px;border:1px solid var(--border);border-radius:13px;background:var(--soft)}.share-center-head strong,.share-center-head small{display:block}.share-center-head strong{font-size:11px;margin:3px 0}.share-center-head small{font-size:8px;color:var(--muted);line-height:1.45}.invoice-share-center .post-print-actions{margin-top:10px;padding:0}.invoice-share-center .share-btn{background:var(--white)}
.theme-dark .invoice-share-center .share-btn,.theme-dark .invoice-contact-card>div{background:var(--white)}
@media(max-width:700px){.invoice-contact-card{grid-template-columns:1fr}.invoice-share-center .post-print-actions{grid-template-columns:1fr 1fr}}
`;

const AL_KANZ_BILL_TEMPLATE_CSS = `
.invoice-detail-modal{width:min(920px,96vw);max-height:92vh;overflow:auto;padding:0;background:var(--white);border:1px solid var(--border);border-radius:22px;box-shadow:0 30px 80px rgba(10,30,25,.22)}
.invoice-detail-toolbar{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--border);background:var(--white);position:sticky;top:0;z-index:4}
.invoice-detail-toolbar strong{display:block;font-size:14px;margin-top:3px}
.invoice-paper-screen{margin:24px;background:#fff;color:#17201e;border:1px solid #e4e9e6;border-radius:18px;padding:34px;box-shadow:0 14px 40px rgba(20,40,35,.08)}
.bill-template-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.bill-brand-lockup{display:flex;align-items:center;gap:13px}.bill-brand-mark{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#c8f45b;color:#16251f;font-weight:950;font-size:15px;letter-spacing:-.04em}.bill-brand-lockup strong{display:block;font-size:20px;letter-spacing:.14em;line-height:1}.bill-brand-lockup span{display:block;font-size:8px;letter-spacing:.22em;font-weight:900;color:#718079;margin-top:5px}.bill-brand-lockup small{display:block;font-size:9px;color:#8a9691;margin-top:7px}
.bill-title-block{text-align:right}.bill-title-block span{display:block;font-size:8px;letter-spacing:.18em;font-weight:950;color:#4d7466}.bill-title-block strong{display:block;font-size:21px;margin-top:6px;letter-spacing:.02em}.bill-title-block small{display:block;color:#78857f;font-size:9px;margin-top:5px}
.bill-accent-line{height:4px;border-radius:99px;background:linear-gradient(90deg,#c8f45b 0 28%,#1e6658 28% 100%);margin:22px 0 10px}.bill-company-strip{display:flex;justify-content:space-between;gap:12px;color:#718079;font-size:8px;padding-bottom:20px;border-bottom:1px solid #e3e8e5}
.bill-parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0}.bill-party{padding:16px;border:1px solid #e1e7e4;border-radius:13px;background:#f8faf9}.bill-party-right{text-align:right}.bill-party small{display:block;font-size:7px;letter-spacing:.15em;font-weight:950;color:#789088}.bill-party strong{display:block;font-size:13px;margin:7px 0}.bill-party span{display:block;color:#718079;font-size:9px;line-height:1.65}
.bill-items-table{border:1px solid #dfe6e2;border-radius:13px;overflow:hidden}.bill-items-head,.bill-items-row{display:grid;grid-template-columns:minmax(0,2fr) .55fr 1fr 1fr;gap:12px;align-items:center}.bill-items-head{padding:10px 14px;background:#eff4f1;color:#687871;font-size:7px;font-weight:950;letter-spacing:.13em}.bill-items-row{padding:16px 14px;font-size:10px}.bill-items-row>span,.bill-items-row>strong{text-align:right}.bill-items-row div strong,.bill-items-row div span{display:block}.bill-items-row div strong{font-size:10px}.bill-items-row div span{font-size:8px;color:#7a8782;margin-top:4px;line-height:1.4}
.bill-bottom-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:24px;margin-top:22px}.bill-thanks{padding:17px;border-radius:13px;background:#f3f7f5;border:1px solid #e0e8e4}.bill-thanks span{font-size:7px;letter-spacing:.16em;font-weight:950;color:#4d7466}.bill-thanks strong{display:block;font-size:12px;margin-top:7px}.bill-thanks p{font-size:9px;color:#78857f;line-height:1.55;margin:7px 0 0}.bill-total-box{border:1px solid #dfe6e2;border-radius:13px;padding:13px}.bill-total-box>div{display:flex;justify-content:space-between;gap:15px;padding:6px 0;font-size:9px}.bill-total-box>div span{color:#718079}.bill-grand-total{margin:6px -4px;padding:11px 8px!important;border-radius:9px;background:#173f37;color:#fff}.bill-grand-total span,.bill-grand-total strong{color:#fff!important;font-size:11px!important}.bill-balance{border-top:1px dashed #d8dfdc;margin-top:4px;padding-top:10px!important}.bill-template-footer{display:flex;justify-content:space-between;gap:12px;margin-top:25px;padding-top:13px;border-top:1px solid #e1e7e4;color:#7a8782;font-size:8px}
.invoice-contact-card{padding:0 24px}.invoice-share-center{margin:16px 24px 24px}.invoice-modal-actions{padding:0 24px 24px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.theme-dark .invoice-detail-modal{background:#151c1a;color:#f0f5f2}.theme-dark .invoice-detail-toolbar{background:#151c1a}.theme-dark .invoice-paper-screen{background:#fff;color:#17201e}.theme-dark .invoice-contact-card>div,.theme-dark .invoice-share-center{background:#1b2522}
@media(max-width:700px){.invoice-paper-screen{margin:12px;padding:20px}.bill-template-header,.bill-company-strip{flex-direction:column}.bill-title-block,.bill-party-right{text-align:left}.bill-parties,.bill-bottom-grid{grid-template-columns:1fr}.bill-items-table{overflow-x:auto}.bill-items-head,.bill-items-row{min-width:600px}.bill-template-footer{flex-direction:column}.invoice-contact-card,.invoice-share-center{margin-left:12px;margin-right:12px;padding-left:0;padding-right:0}.invoice-modal-actions{padding-left:12px;padding-right:12px}}
@media print{.invoice-paper-screen{box-shadow:none;border:0;margin:0;border-radius:0}.invoice-detail-toolbar,.invoice-contact-card,.invoice-share-center,.invoice-modal-actions{display:none!important}}
`;
const FINAL_CSS = CSS + AL_KANZ_BILL_TEMPLATE_CSS + AL_KANZ_CRM_DETAIL_CSS + AL_KANZ_PREMIUM_CRM_REPORT_CSS + AL_KANZ_FINAL_RESPONSIVE + AL_KANZ_FINAL_FIX + AL_KANZ_LAST_FIX + AL_KANZ_TRUE_FINAL_FIX + AL_KANZ_FULL_MOTION_CSS + AL_KANZ_LIGHT_UI + BILLING_BUTTON_FIX_CSS;

export default App;
