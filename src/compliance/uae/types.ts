export type UAEFramework = 'PDPL' | 'UAE_AI_ETHICS' | 'NESA' | 'DUBAI_AI_LAW' | 'ADGM';
export type ComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'REVIEW_REQUIRED';
export type ReportLanguage = 'en' | 'ar' | 'both';

export interface UAEComplianceConfig {
  frameworks: UAEFramework[];
  language?: ReportLanguage;
  auditLevel?: 'basic' | 'full';
  dataResidency?: 'UAE' | 'ANY';
}

export interface ComplianceCheck {
  framework: UAEFramework;
  article?: string;
  status: ComplianceStatus;
  requirement: string;
  requirementAr?: string;
  passed: boolean;
  details: string;
  remediation?: string;
  remediationAr?: string;
}

export interface UAEComplianceReport {
  reportId: string;
  timestamp: string;
  overallStatus: ComplianceStatus;
  frameworks: UAEFramework[];
  checks: ComplianceCheck[];
  score: number;
  summary: string;
  summaryAr: string;
  auditHash: string;
}
