import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const medicalReports = pgTable("medical_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inputType: text("input_type").notNull(), // 'text' | 'image'
  originalInput: text("original_input"), // base64 for images, text for text input
  ocrResults: jsonb("ocr_results"),
  normalizedTests: jsonb("normalized_tests"),
  patientSummary: jsonb("patient_summary"),
  finalOutput: jsonb("final_output"),
  status: text("status").notNull().default("processing"), // 'processing' | 'completed' | 'failed' | 'unprocessed'
  errorReason: text("error_reason"),
  confidence: real("confidence"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Zod schemas for API validation
export const ocrResultSchema = z.object({
  tests_raw: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const referenceRangeSchema = z.object({
  low: z.number(),
  high: z.number(),
});

export const normalizedTestSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  status: z.enum(["low", "normal", "high"]),
  ref_range: referenceRangeSchema,
});

export const normalizedTestsSchema = z.object({
  tests: z.array(normalizedTestSchema),
  normalization_confidence: z.number().min(0).max(1),
});

export const patientSummarySchema = z.object({
  summary: z.string(),
  explanations: z.array(z.string()),
});

export const finalOutputSchema = z.object({
  tests: z.array(normalizedTestSchema),
  summary: z.string(),
  explanations: z.array(z.string()).optional(),
  status: z.literal("ok"),
  confidence: z.number().min(0).max(1).optional(),
  processing_time: z.string().optional(),
});

export const errorOutputSchema = z.object({
  status: z.literal("unprocessed"),
  reason: z.string(),
  details: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
});

export const processRequestSchema = z.object({
  input_type: z.enum(["text", "image"]),
  data: z.string(), // text content or base64 image
});

export const batchProcessRequestSchema = z.object({
  reports: z.array(processRequestSchema).min(1).max(10), // Allow 1-10 reports per batch
  batch_id: z.string().optional(), // Optional batch identifier
});

export const batchProcessResponseSchema = z.object({
  batch_id: z.string(),
  total_reports: z.number(),
  successful: z.number(),
  failed: z.number(),
  processing_time: z.string(),
  results: z.array(z.union([finalOutputSchema, errorOutputSchema])),
  status: z.enum(["completed", "partial_failure", "failed"]),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertMedicalReportSchema = createInsertSchema(medicalReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type MedicalReport = typeof medicalReports.$inferSelect;
export type InsertMedicalReport = z.infer<typeof insertMedicalReportSchema>;
export type OcrResult = z.infer<typeof ocrResultSchema>;
export type NormalizedTest = z.infer<typeof normalizedTestSchema>;
export type NormalizedTests = z.infer<typeof normalizedTestsSchema>;
export type PatientSummary = z.infer<typeof patientSummarySchema>;
export type FinalOutput = z.infer<typeof finalOutputSchema>;
export type ErrorOutput = z.infer<typeof errorOutputSchema>;
export type ProcessRequest = z.infer<typeof processRequestSchema>;
