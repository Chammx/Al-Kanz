import { databases, ID, Query, APPWRITE_DATABASE_ID } from "./appwrite";

const DB = APPWRITE_DATABASE_ID;

// Appwrite table IDs
export const TABLES = {
  customers: "customers",
  jobs: "jobs",
  invoices: "invoices",
  payments: "payments",
  transactions: "transactions",
  expenses: "expenses",
  materials: "materials",
  suppliers: "suppliers",
  staff: "staff",
  auditLogs: "audit_logs",
  moneyTransfers: "money_transfers",
};

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------

const clean = (data) =>
  Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined
    )
  );

const getError = (error) => {
  console.error("Appwrite error:", error);
  return error;
};

async function list(table, queries = []) {
  try {
    const response = await databases.listRows({
      databaseId: DB,
      tableId: table,
      queries,
    });

    return response.rows || [];
  } catch (error) {
    getError(error);
    throw error;
  }
}

async function create(table, data) {
  try {
    return await databases.createRow({
      databaseId: DB,
      tableId: table,
      rowId: ID.unique(),
      data: clean(data),
    });
  } catch (error) {
    getError(error);
    throw error;
  }
}

async function update(table, rowId, data) {
  try {
    return await databases.updateRow({
      databaseId: DB,
      tableId: table,
      rowId,
      data: clean(data),
    });
  } catch (error) {
    getError(error);
    throw error;
  }
}

async function remove(table, rowId) {
  try {
    return await databases.deleteRow({
      databaseId: DB,
      tableId: table,
      rowId,
    });
  } catch (error) {
    getError(error);
    throw error;
  }
}

// ----------------------------------------------------
// CUSTOMERS
// ----------------------------------------------------

export const customerDB = {
  async all() {
    return list(TABLES.customers, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async findByPhone(phone) {
    const rows = await list(TABLES.customers, [
      Query.equal("phone", phone),
      Query.limit(1),
    ]);

    return rows[0] || null;
  },

  async create(customer) {
    return create(TABLES.customers, {
      name: customer.name,
      phone: customer.phone,
      location: customer.location || "Dubai",
      address: customer.address || "",
      jobs_count: Number(customer.jobs_count || 0),
      outstanding: Number(customer.outstanding || 0),
    });
  },

  async update(id, customer) {
    return update(TABLES.customers, id, {
      name: customer.name,
      phone: customer.phone,
      location: customer.location || "Dubai",
      address: customer.address || "",
      jobs_count: Number(customer.jobs_count || 0),
      outstanding: Number(customer.outstanding || 0),
    });
  },

  async delete(id) {
    return remove(TABLES.customers, id);
  },
};

// ----------------------------------------------------
// JOBS
// ----------------------------------------------------

export const jobDB = {
  async all() {
    return list(TABLES.jobs, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async findByNumber(jobNumber) {
    const rows = await list(TABLES.jobs, [
      Query.equal("job_number", jobNumber),
      Query.limit(1),
    ]);

    return rows[0] || null;
  },

  async create(job) {
    return create(TABLES.jobs, {
      job_number: job.job_number,
      customer_id: job.customer_id || "",
      customer_name: job.customer_name || job.customer || "",
      phone: job.phone || "",
      item: job.item || "",
      description: job.description || "",
      work: job.work || "",
      material: job.material || "",
      colour: job.colour || "",
      quantity: Number(job.quantity || 1),
      material_cost: Number(job.material_cost || job.materialCost || 0),
      labour: Number(job.labour || 0),
      other_charges: Number(
        job.other_charges || job.otherCharges || 0
      ),
      discount: Number(job.discount || 0),
      amount: Number(job.amount || 0),
      paid: Number(job.paid || 0),
      status: job.status || "Received",
      progress: Number(job.progress || 0),
      delivery_date: job.delivery_date || job.deliveryDate || "",
      notes: job.notes || "",
    });
  },

  async update(id, data) {
    return update(TABLES.jobs, id, {
      ...data,
      quantity:
        data.quantity !== undefined
          ? Number(data.quantity)
          : undefined,
      amount:
        data.amount !== undefined
          ? Number(data.amount)
          : undefined,
      paid:
        data.paid !== undefined
          ? Number(data.paid)
          : undefined,
      progress:
        data.progress !== undefined
          ? Number(data.progress)
          : undefined,
    });
  },

  async updateStatus(jobNumber, status) {
    const job = await this.findByNumber(jobNumber);

    if (!job) {
      throw new Error(`Job ${jobNumber} not found`);
    }

    return update(TABLES.jobs, job.$id, {
      status,
      progress:
        status === "Received"
          ? 5
          : status === "In Progress"
          ? 50
          : status === "Ready"
          ? 90
          : status === "Delivered"
          ? 100
          : undefined,
    });
  },

  async delete(id) {
    return remove(TABLES.jobs, id);
  },
};

// ----------------------------------------------------
// PAYMENTS
// ----------------------------------------------------

export const paymentDB = {
  async all() {
    return list(TABLES.payments, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(payment) {
    return create(TABLES.payments, {
      job_id: payment.job_id || "",
      customer_id: payment.customer_id || "",
      customer: payment.customer || "",
      amount: Number(payment.amount || 0),
      payment_method:
        payment.payment_method || "Cash",
      paid_at:
        payment.paid_at || new Date().toISOString(),
      notes: payment.notes || "",
    });
  },

  async delete(id) {
    return remove(TABLES.payments, id);
  },
};

// ----------------------------------------------------
// TRANSACTIONS
// ----------------------------------------------------

export const transactionDB = {
  async all() {
    return list(TABLES.transactions, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(transaction) {
    return create(TABLES.transactions, {
      transaction_type:
        transaction.transaction_type || "Income",
      description: transaction.description || "",
      amount: Number(transaction.amount || 0),
      account: transaction.account || "Cash",
      job_id: transaction.job_id || "",
      customer_id: transaction.customer_id || "",
      payment_id: transaction.payment_id || "",
      transaction_date:
        transaction.transaction_date ||
        new Date().toISOString(),
    });
  },

  async delete(id) {
    return remove(TABLES.transactions, id);
  },
};

// ----------------------------------------------------
// EXPENSES
// ----------------------------------------------------

export const expenseDB = {
  async all() {
    return list(TABLES.expenses, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(expense) {
    return create(TABLES.expenses, {
      description: expense.description || "",
      amount: Number(expense.amount || 0),
      category: expense.category || "",
      expense_date:
        expense.expense_date ||
        new Date().toISOString(),
      payment_method:
        expense.payment_method || "Cash",
      notes: expense.notes || "",
    });
  },

  async update(id, expense) {
    return update(TABLES.expenses, id, {
      description: expense.description || "",
      amount: Number(expense.amount || 0),
      category: expense.category || "",
      expense_date:
        expense.expense_date ||
        new Date().toISOString(),
      payment_method:
        expense.payment_method || "Cash",
      notes: expense.notes || "",
    });
  },

  async delete(id) {
    return remove(TABLES.expenses, id);
  },
};

// ----------------------------------------------------
// MATERIALS
// ----------------------------------------------------

export const materialDB = {
  async all() {
    return list(TABLES.materials, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(material) {
    return create(TABLES.materials, {
      name: material.name || "",
      category: material.category || "",
      unit: material.unit || "",
      stock: Number(material.stock || 0),
      price: Number(material.price || 0),
    });
  },

  async update(id, material) {
    return update(TABLES.materials, id, {
      name: material.name || "",
      category: material.category || "",
      unit: material.unit || "",
      stock: Number(material.stock || 0),
      price: Number(material.price || 0),
    });
  },

  async delete(id) {
    return remove(TABLES.materials, id);
  },
};

// ----------------------------------------------------
// SUPPLIERS
// ----------------------------------------------------

export const supplierDB = {
  async all() {
    return list(TABLES.suppliers, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(supplier) {
    return create(TABLES.suppliers, {
      name: supplier.name || "",
      phone: supplier.phone || "",
      location: supplier.location || "Dubai",
      category: supplier.category || "",
      status: supplier.status || "Active",
    });
  },

  async update(id, supplier) {
    return update(TABLES.suppliers, id, {
      name: supplier.name || "",
      phone: supplier.phone || "",
      location: supplier.location || "Dubai",
      category: supplier.category || "",
      status: supplier.status || "Active",
    });
  },

  async delete(id) {
    return remove(TABLES.suppliers, id);
  },
};

// ----------------------------------------------------
// STAFF
// ----------------------------------------------------

export const staffDB = {
  async all() {
    return list(TABLES.staff, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(staff) {
    return create(TABLES.staff, {
      name: staff.name || "",
      role: staff.role || "",
      phone: staff.phone || "",
      status: staff.status || "Active",
      username: staff.username || "",
      password: staff.password || "",
      is_superadmin: staff.is_superadmin ? "true" : "false",
    });
  },

  async update(id, staff) {
    return update(TABLES.staff, id, {
      name: staff.name || "",
      role: staff.role || "",
      phone: staff.phone || "",
      status: staff.status || "Active",
      username: staff.username || "",
      password: staff.password || "",
      is_superadmin: staff.is_superadmin ? "true" : "false",
    });
  },

  async delete(id) {
    return remove(TABLES.staff, id);
  },
};

// ----------------------------------------------------
// INVOICES
// ----------------------------------------------------

export const invoiceDB = {
  async all() {
    return list(TABLES.invoices, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(invoice) {
    return create(TABLES.invoices, {
      invoice_number: invoice.invoice_number || "",
      job_id: invoice.job_id || "",
      customer_id: invoice.customer_id || "",
      customer_name: invoice.customer_name || "",
      subtotal: Number(invoice.subtotal || 0),
      discount: Number(invoice.discount || 0),
      vat: Number(invoice.vat || 0),
      total: Number(invoice.total || 0),
      status: invoice.status || "Draft",
      invoice_date:
        invoice.invoice_date ||
        new Date().toISOString(),
      due_date: invoice.due_date || "",
    });
  },

  async update(id, invoice) {
    return update(TABLES.invoices, id, {
      ...invoice,
      subtotal:
        invoice.subtotal !== undefined
          ? Number(invoice.subtotal)
          : undefined,
      discount:
        invoice.discount !== undefined
          ? Number(invoice.discount)
          : undefined,
      vat:
        invoice.vat !== undefined
          ? Number(invoice.vat)
          : undefined,
      total:
        invoice.total !== undefined
          ? Number(invoice.total)
          : undefined,
    });
  },

  async delete(id) {
    return remove(TABLES.invoices, id);
  },
};

// ----------------------------------------------------
// MONEY TRANSFERS
// ----------------------------------------------------

export const transferDB = {
  async all() {
    return list(TABLES.moneyTransfers, [
      Query.orderDesc("$createdAt"),
    ]);
  },

  async create(transfer) {
    return create(TABLES.moneyTransfers, {
      from_account: transfer.from_account || "",
      to_account: transfer.to_account || "",
      amount: Number(transfer.amount || 0),
      description: transfer.description || "",
      transfer_date:
        transfer.transfer_date ||
        new Date().toISOString(),
    });
  },

  async delete(id) {
    return remove(TABLES.moneyTransfers, id);
  },
};

// ----------------------------------------------------
// AUDIT LOGS
// ----------------------------------------------------

export const auditDB = {
  async all() {
    return list(TABLES.auditLogs, [
      Query.orderDesc("$createdAt"),
      Query.limit(500),
    ]);
  },

  async create(log) {
    return create(TABLES.auditLogs, {
      action: log.action || "",
      entity_type: log.entity_type || "",
      entity_id: log.entity_id || "",
      details:
        typeof log.details === "string"
          ? log.details
          : JSON.stringify(log.details || {}),
    });
  },
};

// ----------------------------------------------------
// LOAD EVERYTHING
// ----------------------------------------------------

export async function loadAllData() {
  const [
    jobs,
    customers,
    materials,
    suppliers,
    staff,
    payments,
    expenses,
    transfers,
    transactions,
    auditLogs,
    invoices,
  ] = await Promise.all([
    jobDB.all(),
    customerDB.all(),
    materialDB.all(),
    supplierDB.all(),
    staffDB.all(),
    paymentDB.all(),
    expenseDB.all(),
    transferDB.all(),
    transactionDB.all(),
    auditDB.all(),
    invoiceDB.all(),
  ]);

  return {
    jobs,
    customers,
    materials,
    suppliers,
    staff,
    payments,
    expenses,
    transfers,
    transactions,
    auditLogs,
    invoices,
  };
}