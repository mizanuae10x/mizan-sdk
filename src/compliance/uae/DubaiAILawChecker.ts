/**
 * Dubai AI Law Compliance Checker
 * Based on: Dubai Law No. (9) of 2023 Regulating Artificial Intelligence in Dubai
 * Issued by: His Highness Sheikh Mohammed bin Rashid Al Maktoum
 */

import { ComplianceCheck, UAEComplianceConfig } from './types';

// Art. 3 — Prohibited AI applications
const PROHIBITED_USE_MARKERS = [
  'deepfake', 'deep_fake', 'voice_clone', 'face_swap',
  'social_scoring', 'mass_surveillance', 'subliminal',
  'emotional_manipulation', 'dark_pattern'
];

// Art. 5 — High-risk AI indicators
const HIGH_RISK_CATEGORIES = [
  'critical_infrastructure', 'law_enforcement', 'judiciary',
  'healthcare_decision', 'employment_screening', 'credit_scoring',
  'biometric_identification', 'education_scoring', 'migration_control'
];

export class DubaiAILawChecker {

  check(input: Record<string, unknown>, _config: UAEComplianceConfig): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];
    const payload = JSON.stringify(input).toLowerCase();

    // Art. 3 — Prohibited uses check
    const prohibitedFound = PROHIBITED_USE_MARKERS.filter(m => payload.includes(m));
    checks.push({
      framework: 'DUBAI_AI_LAW',
      article: 'Art. 3 — Prohibited Uses',
      status: prohibitedFound.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'AI systems must not engage in deepfakes, social scoring, subliminal manipulation, or mass surveillance.',
      requirementAr: 'يُحظر استخدام أنظمة الذكاء الاصطناعي في التزوير العميق، والتسجيل الاجتماعي، والتلاعب العاطفي، والمراقبة الجماعية.',
      passed: prohibitedFound.length === 0,
      details: prohibitedFound.length === 0
        ? 'No prohibited AI use markers detected.'
        : `Prohibited use indicators found: ${prohibitedFound.join(', ')}`,
      remediation: 'Remove any functionality related to prohibited AI uses listed in Art. 3 of Dubai AI Law.',
      remediationAr: 'أزل أي وظائف تتعلق بالاستخدامات المحظورة المدرجة في المادة 3 من قانون الذكاء الاصطناعي لدبي.',
    });

    // Art. 5 — High-risk AI registration
    const highRiskFound = HIGH_RISK_CATEGORIES.filter(m => payload.includes(m));
    const isHighRisk = highRiskFound.length > 0;
    const hasRegistration = Boolean(
      input.aiRegistrationId || input.conformityId || input.dga_registration ||
      input.registration_number || input.product_registration
    );
    const registrationPassed = !isHighRisk || hasRegistration;
    checks.push({
      framework: 'DUBAI_AI_LAW',
      article: 'Art. 5 — AI Registration',
      status: registrationPassed ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'High-risk AI products must be registered with Dubai Digital Authority (DDA) and obtain conformity assessment.',
      requirementAr: 'يجب تسجيل منتجات الذكاء الاصطناعي عالية المخاطر لدى هيئة دبي الرقمية والحصول على تقييم المطابقة.',
      passed: registrationPassed,
      details: isHighRisk
        ? (hasRegistration ? `High-risk category detected (${highRiskFound.join(', ')}) — registration ID present.` : `High-risk AI category detected: ${highRiskFound.join(', ')} — no registration ID found.`)
        : 'Not classified as high-risk AI product.',
      remediation: 'Register with Dubai Digital Authority and include aiRegistrationId in requests.',
      remediationAr: 'سجّل لدى هيئة دبي الرقمية وأضف معرّف التسجيل في الطلبات.',
    });

    // Art. 8 — Transparency and disclosure
    const hasDisclosure = Boolean(
      input.aiDisclosure === true || input.isAI === true ||
      input.ai_generated === true || input.disclosedAsAI === true ||
      (input.disclosure && String(input.disclosure).length > 0)
    );
    checks.push({
      framework: 'DUBAI_AI_LAW',
      article: 'Art. 8 — Transparency Disclosure',
      status: hasDisclosure ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'AI systems interacting with individuals must disclose their AI nature when requested.',
      requirementAr: 'يجب على أنظمة الذكاء الاصطناعي التي تتفاعل مع الأفراد الإفصاح عن طبيعتها الاصطناعية عند الطلب.',
      passed: hasDisclosure,
      details: hasDisclosure
        ? 'AI disclosure marker present in request.'
        : 'No AI disclosure marker found — recommended for user-facing AI.',
      remediation: 'Add aiDisclosure=true or isAI=true field when AI interacts with end users.',
      remediationAr: 'أضف aiDisclosure=true أو isAI=true عند تفاعل الذكاء الاصطناعي مع المستخدمين.',
    });

    // Art. 10 — Human oversight for consequential decisions
    const isConsequential = Boolean(
      input.consequential === true || input.automated_decision === true ||
      HIGH_RISK_CATEGORIES.some(cat => payload.includes(cat))
    );
    const hasHumanOversight = Boolean(
      input.humanReview === true || input.humanInLoop === true ||
      input.human_oversight === true || input.requires_approval === true ||
      input.hitl === true
    );
    const oversightPassed = !isConsequential || hasHumanOversight;
    checks.push({
      framework: 'DUBAI_AI_LAW',
      article: 'Art. 10 — Human Oversight',
      status: oversightPassed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Consequential AI decisions must retain a human-in-the-loop approval mechanism.',
      requirementAr: 'يجب الاحتفاظ بآلية مراجعة بشرية في قرارات الذكاء الاصطناعي ذات الأثر العالي.',
      passed: oversightPassed,
      details: isConsequential
        ? (hasHumanOversight ? 'Human oversight marker detected for consequential decision.' : 'Consequential AI decision detected without human oversight marker.')
        : 'No consequential decision markers — oversight not required.',
      remediation: 'Add humanReview=true or humanInLoop=true for any AI decision affecting individual rights or services.',
      remediationAr: 'أضف humanReview=true أو humanInLoop=true لأي قرار يؤثر على حقوق الأفراد أو الخدمات.',
    });

    // Art. 12 — Data governance alignment
    const hasDataGovernance = Boolean(
      input.dataGovernance || input.data_governance ||
      input.dataPolicy || input.privacyPolicy
    );
    checks.push({
      framework: 'DUBAI_AI_LAW',
      article: 'Art. 12 — Data Governance',
      status: hasDataGovernance ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'AI providers must align with Dubai Data Law and PDPL on data usage and governance.',
      requirementAr: 'يجب على مزودي الذكاء الاصطناعي الامتثال لقانون بيانات دبي وقانون حماية البيانات الشخصية.',
      passed: hasDataGovernance,
      details: hasDataGovernance
        ? 'Data governance reference present.'
        : 'No data governance policy reference found.',
      remediation: 'Include a reference to your data governance policy (dataGovernance/dataPolicy field).',
      remediationAr: 'أضف مرجعاً لسياسة حوكمة البيانات الخاصة بك.',
    });

    return checks;
  }
}
