import { Client, Databases, ID } from "node-appwrite";

const client = new Client();

client
  .setEndpoint("https://sgp.cloud.appwrite.io/v1")
  .setProject("al-kanz-upholstery")
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);

const DATABASE_ID = "al-kanz-db";

const tables = {
  customers: [
    ["name", "string", true, 150],
    ["phone", "string", true, 30],
    ["location", "string", true, 100],
    ["address", "string", false, 200],
    ["jobs_count", "integer", true],
    ["outstanding", "float", true],
  ],

  jobs: [
    ["job_number", "string", true, 30],
    ["customer_id", "string", false, 50],
    ["customer_name", "string", true, 150],
    ["phone", "string", false, 30],
    ["item", "string", true, 100],
    ["description", "string", false, 500],
    ["work", "string", false, 500],
    ["material", "string", false, 150],
    ["colour", "string", false, 100],
    ["quantity", "integer", true],
    ["material_cost", "float", true],
    ["labour", "float", true],
    ["other_charges", "float", true],
    ["discount", "float", true],
    ["amount", "float", true],
    ["paid", "float", true],
    ["status", "string", true, 50],
    ["progress", "integer", true],
    ["delivery_date", "string", false, 30],
    ["notes", "string", false, 500],
  ],

  payments: [
    ["job_id", "string", false, 50],
    ["customer_id", "string", false, 50],
    ["customer", "string", false, 150],
    ["amount", "float", true],
    ["payment_method", "string", true, 50],
    ["paid_at", "datetime", false],
    ["notes", "string", false, 500],
  ],

  transactions: [
    ["transaction_type", "string", true, 50],
    ["description", "string", true, 500],
    ["amount", "float", true],
    ["account", "string", true, 100],
    ["job_id", "string", false, 50],
    ["customer_id", "string", false, 50],
    ["payment_id", "string", false, 50],
    ["transaction_date", "datetime", false],
  ],

  expenses: [
    ["description", "string", true, 500],
    ["amount", "float", true],
    ["category", "string", false, 100],
    ["expense_date", "datetime", false],
    ["payment_method", "string", false, 50],
    ["notes", "string", false, 500],
  ],

  materials: [
    ["name", "string", true, 150],
    ["category", "string", false, 100],
    ["unit", "string", true, 50],
    ["stock", "float", true],
    ["price", "float", true],
  ],

  suppliers: [
    ["name", "string", true, 150],
    ["phone", "string", false, 30],
    ["location", "string", false, 150],
    ["category", "string", false, 100],
    ["status", "string", false, 50],
  ],

  staff: [
    ["name", "string", true, 150],
    ["role", "string", false, 100],
    ["phone", "string", false, 30],
    ["status", "string", false, 50],
    ["username", "string", false, 50],
    ["password", "string", false, 100],
    ["is_superadmin", "string", false, 10],
  ],

  audit_logs: [
    ["action", "string", true, 200],
    ["entity_type", "string", true, 100],
    ["entity_id", "string", false, 100],
    ["details", "string", false, 2000],
  ],

  money_transfers: [
    ["from_account", "string", true, 100],
    ["to_account", "string", true, 100],
    ["amount", "float", true],
    ["description", "string", false, 500],
    ["transfer_date", "datetime", false],
  ],

  invoices: [
    ["invoice_number", "string", true, 50],
    ["job_id", "string", false, 50],
    ["customer_id", "string", false, 50],
    ["customer_name", "string", true, 150],
    ["subtotal", "float", true],
    ["discount", "float", true],
    ["vat", "float", true],
    ["total", "float", true],
    ["status", "string", true, 50],
    ["invoice_date", "datetime", false],
    ["due_date", "datetime", false],
  ],
};

async function createColumn(tableId, column) {
  const [key, type, required, size] = column;

  try {
    if (type === "string") {
      await db.createStringColumn(
        DATABASE_ID,
        tableId,
        key,
        size || 255,
        required
      );
    }

    if (type === "integer") {
      await db.createIntegerColumn(
        DATABASE_ID,
        tableId,
        key,
        required
      );
    }

    if (type === "float") {
      await db.createFloatColumn(
        DATABASE_ID,
        tableId,
        key,
        required
      );
    }

    if (type === "datetime") {
      await db.createDatetimeColumn(
        DATABASE_ID,
        tableId,
        key,
        required
      );
    }

    console.log(`   ✓ ${key}`);
  } catch (error) {
    if (
      error.code === 409 ||
      error.message?.toLowerCase().includes("already exists")
    ) {
      console.log(`   ↪ ${key} already exists`);
    } else {
      console.error(`   ✗ ${key}: ${error.message}`);
    }
  }
}

async function main() {
  console.log("\n🇦🇪 AL KANZ APPWRITE SETUP\n");

  for (const [tableId, columns] of Object.entries(tables)) {
    console.log(`\n📦 ${tableId}`);

    for (const column of columns) {
      await createColumn(tableId, column);
    }
  }

  console.log("\n✅ AL KANZ DATABASE SETUP FINISHED\n");
}

main().catch((error) => {
  console.error("\n❌ SETUP FAILED");
  console.error(error);
  process.exit(1);
});
