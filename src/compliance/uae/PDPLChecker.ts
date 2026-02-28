import { ComplianceCheck, UAEComplianceConfig } from './types';

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PASSPORT_REGEX = /\b[A-Z]\d{6,8}\b/i;

export class PDPLChecker {
  check(input: Record<string, unknown>, config: UAEComplianceConfig): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];
    const piiTypes = this.detectPII(input);
    const hasPII = piiTypes.length > 0;
    const loweredKeys = Object.keys(input).map(key => key.toLowerCase());

    const hasPurpose = loweredKeys.some(
      key => key.includes('purpose') || key.includes('action') || key.includes('usecase')
    );
    checks.push({
      framework: 'PDPL',
      article: 'Art. 4',
      status: hasPurpose ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Processing must have a lawful and explicit purpose.',
      requirementAr: 'يجب أن تكون المعالجة ذات غرض قانوني ومحدد.',
      passed: hasPurpose,
      details: hasPurpose
        ? 'Purpose marker detected in request payload.'
        : 'No clear purpose marker found (e.g., purpose/action/useCase).',
      remediation: 'Add a clear purpose/action field describing legal processing basis.',
      remediationAr: 'أضف حقلاً يوضح الغرض من المعالجة والأساس القانوني.',
    });

    const minimalPII = piiTypes.length <= 2;
    checks.push({
      framework: 'PDPL',
      article: 'Art. 10',
      status: minimalPII ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Collect only data that is necessary for the stated purpose.',
      requirementAr: 'يجب جمع البيانات الضرورية فقط للغرض المحدد.',
      passed: minimalPII,
      details: hasPII ? `Detected PII types: ${piiTypes.join(', ')}` : 'No obvious PII detected.',
      remediation: 'Remove unnecessary PII fields or justify each personal data element.',
      remediationAr: 'أزل البيانات الشخصية غير الضرورية أو قدم مبرراً لكل عنصر.',
    });

    const requiresUAEResidency = (config.dataResidency ?? 'UAE') === 'UAE';
    const residencyValue = [
      input.dataResidency,
      input.residency,
      input.region,
      input.country,
      input.location,
    ]
      .filter(Boolean)
      .map(value => String(value).toUpperCase())
      .join(' ');
    const inUAE =
      residencyValue.includes('UAE') ||
      residencyValue.includes('AE') ||
      residencyValue.includes('DUBAI') ||
      residencyValue.includes('ABU DHABI');
    const residencyPassed = !requiresUAEResidency || inUAE;
    checks.push({
      framework: 'PDPL',
      article: 'Art. 14',
      status: residencyPassed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Cross-border data transfers must comply with UAE transfer controls.',
      requirementAr: 'يجب أن تتوافق عمليات نقل البيانات عبر الحدود مع ضوابط الإمارات.',
      passed: residencyPassed,
      details: residencyPassed
        ? 'Data residency requirement satisfied.'
        : 'UAE data residency is required but was not indicated in the payload.',
      remediation: 'Set dataResidency/region to UAE or route processing to UAE-hosted systems.',
      remediationAr: 'حدد إقامة البيانات داخل الإمارات أو استخدم بنية معالجة مستضافة في الإمارات.',
    });

    const consentMarker = Boolean(
      input.consent === true ||
      input.userConsent === true ||
      input.consentGiven === true ||
      input.consentTimestamp ||
      input.consentId
    );
    const consentPassed = !hasPII || consentMarker;
    checks.push({
      framework: 'PDPL',
      article: 'Art. 6',
      status: consentPassed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Consent must be captured for personal data processing where required.',
      requirementAr: 'يجب توثيق الموافقة عند معالجة البيانات الشخصية عند الاقتضاء.',
      passed: consentPassed,
      details: consentPassed
        ? 'Consent controls present or no personal data detected.'
        : `Personal data detected (${piiTypes.join(', ')}) without consent marker.`,
      remediation: 'Add explicit consent fields (consent=true, consentTimestamp, consentId).',
      remediationAr: 'أضف حقول موافقة صريحة مثل consent=true ووقت الموافقة ومعرفها.',
    });

    return checks;
  }

  detectPII(data: unknown): string[] {
    const detected = new Set<string>();

    const inspect = (value: unknown): void => {
      if (value === null || value === undefined) return;

      if (typeof value === 'string') {
        if (EMAIL_REGEX.test(value)) detected.add('EMAIL');
        if (this.hasUAEPhone(value)) detected.add('UAE_PHONE');
        if (this.hasEmiratesId(value)) detected.add('EMIRATES_ID');
        if (PASSPORT_REGEX.test(value)) detected.add('PASSPORT');
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) inspect(item);
        return;
      }

      if (typeof value === 'object') {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          inspect(nested);
        }
      }
    };

    inspect(data);
    return [...detected];
  }

  // Additional PDPL checks: Art.3 (rights), Art.16 (sensitive data), Art.18 (breach notification)
  checkExtended(input: Record<string, unknown>, _config: UAEComplianceConfig): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];
    const payload = JSON.stringify(input).toLowerCase();

    // Art. 3 — Data Subject Rights
    const hasSubjectRights = Boolean(
      input.allowAccess || input.allowDeletion || input.allowCorrection ||
      input.dataSubjectRights || input.dsr_enabled === true || input.subject_rights
    );
    checks.push({
      framework: 'PDPL',
      article: 'Art. 3 — Data Subject Rights',
      status: hasSubjectRights ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Individuals have the right to access, correct, and delete their personal data.',
      requirementAr: 'للأفراد الحق في الوصول إلى بياناتهم الشخصية وتصحيحها وحذفها.',
      passed: hasSubjectRights,
      details: hasSubjectRights
        ? 'Data subject rights configuration marker present.'
        : 'No data subject rights markers found — required for personal data processing systems.',
      remediation: 'Implement and indicate data subject rights: access, correction, deletion, objection (dsr_enabled=true).',
      remediationAr: 'طبّق وأشر إلى حقوق صاحب البيانات: الوصول، التصحيح، الحذف، الاعتراض.',
    });

    // Art. 16 — Sensitive Categories of Data
    const SENSITIVE_MARKERS = [
      'health', 'medical', 'biometric', 'genetic', 'ethnic', 'race',
      'religion', 'political_opinion', 'sexual', 'criminal', 'child',
      'minor', 'underage', 'financial_detail', 'bank_account'
    ];
    const sensitiveFound = SENSITIVE_MARKERS.filter(m => payload.includes(m));
    const hasSensitive = sensitiveFound.length > 0;
    const hasSensitiveConsent = Boolean(
      input.sensitiveDataConsent === true || input.explicit_consent === true ||
      input.health_consent === true || input.biometric_consent === true
    );
    const sensitiveOk = !hasSensitive || hasSensitiveConsent;
    checks.push({
      framework: 'PDPL',
      article: 'Art. 16 — Sensitive Personal Data',
      status: sensitiveOk ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Sensitive data (health, biometric, genetic, religious, criminal) requires explicit separate consent and enhanced protection.',
      requirementAr: 'تتطلب البيانات الحساسة (الصحية، البيومترية، الجينية، الدينية، الجنائية) موافقة صريحة منفصلة وحماية معززة.',
      passed: sensitiveOk,
      details: hasSensitive
        ? (hasSensitiveConsent
          ? `Sensitive data markers detected (${sensitiveFound.join(', ')}) with explicit consent.`
          : `Sensitive data detected (${sensitiveFound.join(', ')}) without explicit separate consent.`)
        : 'No sensitive data category markers detected.',
      remediation: 'Add sensitiveDataConsent=true and implement enhanced controls (encryption, access restriction) for sensitive categories.',
      remediationAr: 'أضف sensitiveDataConsent=true ونفّذ ضوابط معززة (تشفير، تقييد وصول) للفئات الحساسة.',
    });

    // Art. 18 — Data Breach Notification (72-hour rule)
    const hasBreachPlan = Boolean(
      input.breachNotificationEnabled === true || input.incident_response === true ||
      input.breach_plan || input.breach_contact || input.dpo_contact
    );
    checks.push({
      framework: 'PDPL',
      article: 'Art. 18 — Breach Notification',
      status: hasBreachPlan ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Data breaches must be reported to UAE Data Office within 72 hours. Organizations must maintain an incident response plan.',
      requirementAr: 'يجب الإبلاغ عن اختراقات البيانات لمكتب بيانات الإمارات خلال 72 ساعة مع وجود خطة استجابة للحوادث.',
      passed: hasBreachPlan,
      details: hasBreachPlan
        ? 'Breach notification or incident response configuration detected.'
        : 'No breach notification plan or DPO contact specified.',
      remediation: 'Add breachNotificationEnabled=true and specify dpo_contact for breach reporting procedures.',
      remediationAr: 'أضف breachNotificationEnabled=true وحدد جهة اتصال مسؤول حماية البيانات.',
    });

    return checks;
  }

  private hasEmiratesId(str: string): boolean {
    return /\b784-\d{4}-\d{7}-\d\b/.test(str);
  }

  private hasUAEPhone(str: string): boolean {
    return /(?:\+971|00971|0)(?:5\d|[234679]\d)\d{7}\b/.test(str.replace(/[\s-]/g, ''));
  }
}
