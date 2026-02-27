import * as crypto from 'crypto';
import { AuditEntry, Decision } from '../../types';
import { AIEthicsGuardrails } from './AIEthicsGuardrails';
import { NESAControls } from './NESAControls';
import { PDPLChecker } from './PDPLChecker';
import {
  ComplianceCheck,
  ComplianceStatus,
  ReportLanguage,
  UAEComplianceConfig,
  UAEComplianceReport,
  UAEFramework,
} from './types';

export class UAEComplianceLayer {
  private config: Required<Omit<UAEComplianceConfig, 'frameworks'>> & { frameworks: UAEFramework[] };
  private pdplChecker: PDPLChecker;
  private aiEthics: AIEthicsGuardrails;
  private nesa: NESAControls;
  private activeFrameworks: UAEFramework[] = [];

  constructor(config: UAEComplianceConfig) {
    this.config = {
      frameworks: config.frameworks,
      language: config.language ?? 'both',
      auditLevel: config.auditLevel ?? 'full',
      dataResidency: config.dataResidency ?? 'UAE',
    };
    this.pdplChecker = new PDPLChecker();
    this.aiEthics = new AIEthicsGuardrails();
    this.nesa = new NESAControls();
  }

  evaluate(
    input: Record<string, unknown>,
    decision: Decision,
    auditEntry: AuditEntry
  ): UAEComplianceReport {
    const checks: ComplianceCheck[] = [];
    const frameworkSet = new Set<UAEFramework>(this.config.frameworks);
    this.activeFrameworks = [...frameworkSet];

    if (frameworkSet.has('PDPL')) {
      checks.push(...this.pdplChecker.check(input, this.config));
    }
    if (frameworkSet.has('UAE_AI_ETHICS')) {
      checks.push(...this.aiEthics.evaluate(decision, input, this.config));
    }
    if (frameworkSet.has('NESA')) {
      checks.push(...this.nesa.assess(auditEntry, this.config));
    }
    if (frameworkSet.has('DUBAI_AI_LAW')) {
      checks.push({
        framework: 'DUBAI_AI_LAW',
        article: 'Art. 8',
        status: 'REVIEW_REQUIRED',
        requirement: 'AI system deployment should align with Dubai AI governance obligations.',
        requirementAr: 'يجب أن يتوافق نشر نظام الذكاء الاصطناعي مع التزامات حوكمة الذكاء الاصطناعي في دبي.',
        passed: false,
        details: 'Dubai-specific legal controls are enabled but require contextual legal mapping.',
        remediation: 'Map business use case to Dubai AI Law obligations and sector guidance.',
        remediationAr: 'قم بمواءمة حالة الاستخدام مع متطلبات قانون الذكاء الاصطناعي في دبي.',
      });
    }
    if (frameworkSet.has('ADGM')) {
      checks.push({
        framework: 'ADGM',
        article: 'Data Protection Regulations 2021',
        status: 'REVIEW_REQUIRED',
        requirement: 'ADGM entities must align AI processing with ADGM data and risk controls.',
        requirementAr: 'يجب على الجهات الخاضعة لسوق أبوظبي العالمي مواءمة المعالجة مع ضوابط البيانات والمخاطر.',
        passed: false,
        details: 'ADGM framework selected; manual legal confirmation is required.',
        remediation: 'Perform ADGM-specific legal and supervisory review before production use.',
        remediationAr: 'أجرِ مراجعة قانونية خاصة بسوق أبوظبي العالمي قبل الاستخدام الإنتاجي.',
      });
    }

    return this.generateReport(checks, this.config.language);
  }

  generateReport(checks: ComplianceCheck[], language: ReportLanguage): UAEComplianceReport {
    const score = checks.length === 0
      ? 100
      : Math.round((checks.filter(check => check.passed).length / checks.length) * 100);
    const overallStatus = this.deriveOverallStatus(checks);
    const timestamp = new Date().toISOString();
    const reportId = crypto.randomUUID();
    const summary = language === 'ar' ? '' : this.summarizeEn(checks);
    const summaryAr = language === 'en' ? '' : this.summarizeAr(checks);
    const auditHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ reportId, timestamp, checks, frameworks: this.activeFrameworks }))
      .digest('hex');

    return {
      reportId,
      timestamp,
      overallStatus,
      frameworks: this.activeFrameworks,
      checks,
      score,
      summary,
      summaryAr,
      auditHash,
    };
  }

  quickCheck(input: Record<string, unknown>, decision: Decision): { passed: boolean; issues: string[] } {
    const checks: ComplianceCheck[] = [];
    checks.push(...this.pdplChecker.check(input, this.config));
    checks.push(...this.aiEthics.evaluate(decision, input, this.config));

    const critical = checks.filter(check => check.status === 'NON_COMPLIANT');
    return {
      passed: critical.length === 0,
      issues: critical.map(check => `${check.framework}${check.article ? ` ${check.article}` : ''}: ${check.details}`),
    };
  }

  private summarizeAr(checks: ComplianceCheck[]): string {
    if (checks.length === 0) return 'لا توجد فحوصات امتثال مطلوبة.';
    const passed = checks.filter(check => check.passed).length;
    const nonCompliant = checks.filter(check => check.status === 'NON_COMPLIANT').length;
    const review = checks.filter(check => check.status === 'REVIEW_REQUIRED').length;
    return `تم اجتياز ${passed} من أصل ${checks.length} فحوصات. حالات عدم الامتثال: ${nonCompliant}. حالات المراجعة المطلوبة: ${review}.`;
  }

  private summarizeEn(checks: ComplianceCheck[]): string {
    if (checks.length === 0) return 'No compliance checks were required.';
    const passed = checks.filter(check => check.passed).length;
    const nonCompliant = checks.filter(check => check.status === 'NON_COMPLIANT').length;
    const review = checks.filter(check => check.status === 'REVIEW_REQUIRED').length;
    return `Passed ${passed}/${checks.length} checks. Non-compliant: ${nonCompliant}. Review-required: ${review}.`;
  }

  private deriveOverallStatus(checks: ComplianceCheck[]): ComplianceStatus {
    if (checks.some(check => check.status === 'NON_COMPLIANT')) return 'NON_COMPLIANT';
    if (checks.some(check => check.status === 'REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
    return 'COMPLIANT';
  }
}
