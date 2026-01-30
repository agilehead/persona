import { createSchema } from "@tinqerjs/tinqer";
import type { DatabaseSchema as DatabaseSchemaType } from "./schema.js";

// Export the DatabaseSchema type for use in other files
export type DatabaseSchema = DatabaseSchemaType;

// Create the Tinqer schema instance (shared across implementations)
export const schema = createSchema<DatabaseSchema>();
