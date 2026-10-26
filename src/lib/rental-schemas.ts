import { z } from "zod";
import { parseDay } from "./leases";

/** Request bodies shared by the admin property / unit / lease routes. */

export const frequencySchema = z.enum(["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"]);

export const propertySchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  companyId: z.string().min(1, "Choose a company"),
  address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const unitSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  rentAmount: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  rentFrequency: frequencySchema.default("ANNUAL"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** "YYYY-MM-DD" → Date (midnight UTC) */
export const daySchema = z
  .string()
  .transform((v, ctx) => {
    const d = parseDay(v);
    if (!d) ctx.addIssue({ code: "custom", message: "Invalid date" });
    return d as Date;
  });

/** Optional day: blank / null → null */
export const optionalDaySchema = z
  .string()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = parseDay(v);
    if (!d) ctx.addIssue({ code: "custom", message: "Invalid date" });
    return d;
  });

export const leaseTermsSchema = z.object({
  startDate: daySchema,
  endDate: optionalDaySchema,
  rentAmount: z.number().nonnegative("Rent can't be negative").max(1_000_000_000),
  rentFrequency: frequencySchema,
  depositAmount: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export function firstIssue(err: z.ZodError) {
  const i = err.issues[0];
  if (!i) return "Invalid input";
  return i.path.length && i.message === "Invalid date" ? `${String(i.path[0])}: invalid date` : i.message;
}
