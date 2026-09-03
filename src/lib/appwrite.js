import { Client, TablesDB, ID, Query, Account } from "appwrite";

const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;

if (!projectId) {
  throw new Error(
    "Missing VITE_APPWRITE_PROJECT_ID. Create a .env.local file in the project root."
  );
}

const client = new Client()
  .setEndpoint(
    import.meta.env.VITE_APPWRITE_ENDPOINT ||
      "https://sgp.cloud.appwrite.io/v1"
  )
  .setProject(projectId);

export const databases = new TablesDB(client);
export const account = new Account(client);

export { ID, Query };

