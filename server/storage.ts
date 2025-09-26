import { type User, type InsertUser, type MedicalReport, type InsertMedicalReport } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Medical report methods
  getMedicalReport(id: string): Promise<MedicalReport | undefined>;
  createMedicalReport(report: InsertMedicalReport): Promise<MedicalReport>;
  updateMedicalReport(id: string, updates: Partial<MedicalReport>): Promise<MedicalReport | undefined>;
  getMedicalReports(limit?: number, offset?: number): Promise<MedicalReport[]>;
  getMedicalReportsByStatus(status: string): Promise<MedicalReport[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private medicalReports: Map<string, MedicalReport>;

  constructor() {
    this.users = new Map();
    this.medicalReports = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getMedicalReport(id: string): Promise<MedicalReport | undefined> {
    return this.medicalReports.get(id);
  }

  async createMedicalReport(insertReport: InsertMedicalReport): Promise<MedicalReport> {
    const id = randomUUID();
    const now = new Date();
    const report: MedicalReport = {
      id,
      inputType: insertReport.inputType,
      originalInput: insertReport.originalInput ?? null,
      ocrResults: insertReport.ocrResults ?? null,
      normalizedTests: insertReport.normalizedTests ?? null,
      patientSummary: insertReport.patientSummary ?? null,
      finalOutput: insertReport.finalOutput ?? null,
      status: insertReport.status || "processing",
      errorReason: insertReport.errorReason ?? null,
      confidence: insertReport.confidence ?? null,
      processingTimeMs: insertReport.processingTimeMs ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.medicalReports.set(id, report);
    return report;
  }

  async updateMedicalReport(id: string, updates: Partial<MedicalReport>): Promise<MedicalReport | undefined> {
    const existing = this.medicalReports.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: MedicalReport = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.medicalReports.set(id, updated);
    return updated;
  }

  async getMedicalReports(limit = 50, offset = 0): Promise<MedicalReport[]> {
    const reports = Array.from(this.medicalReports.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    
    return reports.slice(offset, offset + limit);
  }

  async getMedicalReportsByStatus(status: string): Promise<MedicalReport[]> {
    return Array.from(this.medicalReports.values())
      .filter(report => report.status === status)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }
}

export const storage = new MemStorage();
