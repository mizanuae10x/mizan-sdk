import { AuditEntry, Decision } from '../../types';
import { ComplianceCheck, UAEComplianceConfig } from './types';
import { PDPLChecker } from './PDPLChecker';

type IncidentLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET';

export class NESAControls {
  private pdplChecker: PDPLChecker;

  constructor() {
    this.pdplChecker = new PDPLChecker();
  }

  assess(auditEntry: AuditEntry, _config: UAEComplianceConfig): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];
    const hasAuditHash = Boolean(auditEntry.hash && auditEntry.previousHash);
    checks.push({
      framework: 'NESA',
      article: 'Audit Control AU-01',
      status: hasAuditHash ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Security events must be recorded in tamper-evident audit trails.',
      requirementAr: 'يجب تسجيل الأحداث الأمنية في سجل تدقيق مقاوم للتلاعب.',
      passed: hasAuditHash,
      details: hasAuditHash
        ? 'Hash-chain audit markers detected.'
        : 'Missing hash-chain markers required for audit integrity.',
      remediation: 'Enable persistent hash-chain audit logging for all AI decisions.',
      remediationAr: 'فعّل تسجيل التدقيق بسلسلة تجزئة لجميع قرارات الذكاء الاصطناعي.',
    });

    const incidentLevel = this.classifyIncident(auditEntry.output);
    checks.push({
      framework: 'NESA',
      article: 'Incident Response IR-02',
      status: incidentLevel === 'LOW' || incidentLevel === 'MEDIUM' ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Incident severity must be classified for response handling.',
      requirementAr: 'يجب تصنيف شدة الحوادث لتحديد آلية الاستجابة.',
      passed: incidentLevel === 'LOW' || incidentLevel === 'MEDIUM',
      details: `Incident classification: ${incidentLevel}.`,
      remediation: 'Escalate HIGH/CRITICAL incidents to SOC and incident command workflows.',
      remediationAr: 'قم بتصعيد الحوادث العالية أو الحرجة إلى مركز العمليات الأمنية.',
    });

    const dataClass = this.classifyData(auditEntry.input);
    checks.push({
      framework: 'NESA',
      article: 'Data Security DS-01',
      status: dataClass === 'PUBLIC' || dataClass === 'INTERNAL' ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Data processed by AI systems must be classified by sensitivity.',
      requirementAr: 'يجب تصنيف البيانات التي تعالجها أنظمة الذكاء الاصطناعي حسب الحساسية.',
      passed: dataClass === 'PUBLIC' || dataClass === 'INTERNAL',
      details: `Data classification: ${dataClass}.`,
      remediation: 'Apply stricter controls and handling procedures for confidential data.',
      remediationAr: 'طبق ضوابط وإجراءات أكثر صرامة للبيانات السرية.',
    });

    const input = auditEntry.input;
    const hasAccessControl = Boolean(
      input.accessControl === true ||
        input.authenticated === true ||
        input.role ||
        input.accessLevel ||
        input.userRole
    );
    checks.push({
      framework: 'NESA',
      article: 'Access Control AC-01',
      status: hasAccessControl ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Access control markers must exist for AI requests and operators.',
      requirementAr: 'يجب وجود مؤشرات التحكم بالوصول لطلبات ومشغلي الذكاء الاصطناعي.',
      passed: hasAccessControl,
      details: hasAccessControl
        ? 'Access control marker detected in request context.'
        : 'No role/access marker found in request context.',
      remediation: 'Attach authenticated identity and role metadata to each request.',
      remediationAr: 'أرفق هوية موثقة وبيانات الدور بكل طلب.',
    });

    const hasSensitiveData = this.classifyData(input) === 'CONFIDENTIAL' || this.classifyData(input) === 'SECRET';
    const encrypted = Boolean(
      input.encrypted === true ||
        input.encryption === true ||
        input.encryptionAtRest === true ||
        input.encryptionInTransit === true
    );
    const encryptionPassed = !hasSensitiveData || encrypted;
    checks.push({
      framework: 'NESA',
      article: 'Cryptography CR-01',
      status: encryptionPassed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Sensitive data must be encrypted in storage and transit.',
      requirementAr: 'يجب تشفير البيانات الحساسة أثناء التخزين والنقل.',
      passed: encryptionPassed,
      details: encryptionPassed
        ? 'Encryption requirement satisfied for current data class.'
        : 'Sensitive data detected without encryption marker.',
      remediation: 'Enable encryptionInTransit/encryptionAtRest for sensitive workloads.',
      remediationAr: 'فعّل التشفير أثناء النقل والتخزين لأحمال العمل الحساسة.',
    });

    return checks;
  }

  classifyIncident(decision: Decision): IncidentLevel {
    if (decision.result === 'REJECTED' && decision.score <= 20) return 'CRITICAL';
    if (decision.result === 'REJECTED' || decision.score < 40) return 'HIGH';
    if (decision.result === 'REVIEW' || decision.score < 70) return 'MEDIUM';
    return 'LOW';
  }

  classifyData(input: Record<string, unknown>): DataClassification {
    const pii = this.pdplChecker.detectPII(input);
    const flattened = JSON.stringify(input).toLowerCase();
    const hasSecrets =
      flattened.includes('private_key') ||
      flattened.includes('secret') ||
      flattened.includes('token') ||
      flattened.includes('password');

    if (hasSecrets) return 'SECRET';
    if (pii.length > 0) return 'CONFIDENTIAL';
    if (Object.keys(input).length > 0) return 'INTERNAL';
    return 'PUBLIC';
  }
}
