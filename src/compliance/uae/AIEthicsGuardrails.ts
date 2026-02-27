import { Decision } from '../../types';
import { PDPLChecker } from './PDPLChecker';
import { ComplianceCheck, UAEComplianceConfig } from './types';

const SENSITIVE_PROMPT_MARKERS = [
  'api_key',
  'password',
  'private_key',
  'secret',
  'token=',
  'ssh-rsa',
  'begin rsa private key',
];

const BIAS_MARKERS = [
  'race',
  'ethnicity',
  'religion',
  'gender',
  'nationality',
  'disability',
  'tribe',
];

export class AIEthicsGuardrails {
  private pdplChecker: PDPLChecker;

  constructor() {
    this.pdplChecker = new PDPLChecker();
  }

  evaluate(
    decision: Decision,
    input: Record<string, unknown>,
    config: UAEComplianceConfig
  ): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [
      this.checkInclusiveness(input),
      this.checkReliability(decision),
      this.checkTransparency(decision),
      this.checkSecurity(input),
      this.checkAccountability(decision),
    ];

    const pdplPrivacyChecks = this.pdplChecker.check(input, config);
    const privacyPassed = pdplPrivacyChecks.every(check => check.passed);
    checks.push({
      framework: 'UAE_AI_ETHICS',
      article: 'Privacy Principle',
      status: privacyPassed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'AI systems must preserve privacy and protect personal data.',
      requirementAr: 'يجب أن تحافظ أنظمة الذكاء الاصطناعي على الخصوصية وحماية البيانات الشخصية.',
      passed: privacyPassed,
      details: privacyPassed
        ? 'Privacy checks passed via PDPL-aligned controls.'
        : 'Privacy guardrail failed based on PDPL-aligned control results.',
      remediation: 'Apply PDPL controls for consent, minimization, and transfer restrictions.',
      remediationAr: 'طبق ضوابط قانون حماية البيانات المتعلقة بالموافقة وتقليل البيانات ونقلها.',
    });

    return checks;
  }

  private checkInclusiveness(input: Record<string, unknown>): ComplianceCheck {
    const payload = JSON.stringify(input).toLowerCase();
    const matched = BIAS_MARKERS.filter(marker => payload.includes(marker));
    const passed = matched.length === 0;

    return {
      framework: 'UAE_AI_ETHICS',
      article: 'Inclusiveness Principle',
      status: passed ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Inputs should avoid discriminatory or bias-sensitive profiling markers.',
      requirementAr: 'يجب تجنب المؤشرات التمييزية أو الحساسة للتحيز في المدخلات.',
      passed,
      details: passed
        ? 'No direct demographic-bias markers detected.'
        : `Potential bias markers detected: ${matched.join(', ')}.`,
      remediation: 'Use fairness review and remove protected-attribute targeting unless legally justified.',
      remediationAr: 'قم بمراجعة العدالة وأزل الاستهداف المرتبط بالصفات المحمية ما لم يكن مبرراً قانونياً.',
    };
  }

  private checkReliability(decision: Decision): ComplianceCheck {
    const confidence = this.extractConfidence(decision);
    const passed = confidence >= 0.6;

    return {
      framework: 'UAE_AI_ETHICS',
      article: 'Reliability Principle',
      status: passed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Decisions should meet minimum confidence threshold.',
      requirementAr: 'يجب أن تحقق القرارات حداً أدنى من الثقة.',
      passed,
      details: `Confidence score: ${confidence.toFixed(2)} (threshold: 0.60).`,
      remediation: 'Route low-confidence outcomes to human review before action.',
      remediationAr: 'وجّه النتائج منخفضة الثقة إلى مراجعة بشرية قبل التنفيذ.',
    };
  }

  private checkTransparency(decision: Decision): ComplianceCheck {
    const typedDecision = decision as Decision & {
      explanation?: unknown;
      explainable?: unknown;
    };
    const hasAudit = Boolean(decision.auditId);
    const explainable = Boolean(
      typedDecision.explanation ||
        typedDecision.explainable === true ||
        (decision.reason && decision.reason.length > 10)
    );
    const passed = hasAudit && explainable;

    return {
      framework: 'UAE_AI_ETHICS',
      article: 'Transparency Principle',
      status: passed ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'Decisions must be auditable and explainable.',
      requirementAr: 'يجب أن تكون القرارات قابلة للتدقيق والتفسير.',
      passed,
      details: passed
        ? 'Audit ID and explainability markers are present.'
        : 'Missing audit or explainability marker for decision traceability.',
      remediation: 'Provide explanation fields and ensure audit trail IDs are retained.',
      remediationAr: 'أضف حقول التفسير وتأكد من الاحتفاظ بمعرفات سجل التدقيق.',
    };
  }

  private checkSecurity(input: Record<string, unknown>): ComplianceCheck {
    const flattened = JSON.stringify(input).toLowerCase();
    const matched = SENSITIVE_PROMPT_MARKERS.filter(marker => flattened.includes(marker));
    const passed = matched.length === 0;

    return {
      framework: 'UAE_AI_ETHICS',
      article: 'Security Principle',
      status: passed ? 'COMPLIANT' : 'NON_COMPLIANT',
      requirement: 'Prompts and payloads must not expose sensitive system credentials.',
      requirementAr: 'يجب ألا تكشف المطالبات والحمولات عن بيانات اعتماد حساسة للنظام.',
      passed,
      details: passed
        ? 'No sensitive prompt markers detected.'
        : `Sensitive markers found: ${matched.join(', ')}.`,
      remediation: 'Remove credentials/secrets and use secure vault references.',
      remediationAr: 'أزل بيانات الاعتماد والأسرار واستخدم مراجع خزنة آمنة.',
    };
  }

  private checkAccountability(decision: Decision): ComplianceCheck {
    const typedDecision = decision as Decision & {
      humanOversight?: unknown;
      reviewByHuman?: unknown;
    };
    const requiresHumanOversight = decision.result !== 'APPROVED' || this.extractConfidence(decision) < 0.75;
    const hasHumanOversight = typedDecision.humanOversight === true || typedDecision.reviewByHuman === true;
    const passed = !requiresHumanOversight || hasHumanOversight;

    return {
      framework: 'UAE_AI_ETHICS',
      article: 'Accountability Principle',
      status: passed ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      requirement: 'High-impact or uncertain decisions must support human oversight.',
      requirementAr: 'يجب دعم الإشراف البشري للقرارات عالية التأثير أو غير المؤكدة.',
      passed,
      details: requiresHumanOversight
        ? hasHumanOversight
          ? 'Human oversight marker present for this decision.'
          : 'Human oversight is required but not indicated.'
        : 'No mandatory human oversight triggered by this decision profile.',
      remediation: 'Add humanOversight/reviewByHuman flags for escalated decisions.',
      remediationAr: 'أضف مؤشرات humanOversight أو reviewByHuman للقرارات المصعّدة.',
    };
  }

  private extractConfidence(decision: Decision): number {
    const typedDecision = decision as Decision & { confidence?: unknown };
    if (typeof typedDecision.confidence === 'number') {
      return Math.max(0, Math.min(1, typedDecision.confidence));
    }
    return Math.max(0, Math.min(1, decision.score / 100));
  }
}
