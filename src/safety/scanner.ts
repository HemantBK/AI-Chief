/**
 * Food Safety Scanner
 * Domain-specific checks for dangerous food advice.
 */

import { CONFIG } from '../config.js';
import { SafetyFlag } from '../types.js';

class SafetyScanner {
  /**
   * Scan a response text for food safety issues
   */
  scan(responseText: string): SafetyFlag[] {
    const flags: SafetyFlag[] = [];
    const lower = responseText.toLowerCase();

    // Check 1: Temperature recommendations below USDA minimums
    this.checkTemperatures(lower, flags);

    // Check 2: Dangerous raw food claims
    this.checkRawFoodClaims(lower, flags);

    // Check 3: Incorrect storage advice
    this.checkStorageAdvice(lower, flags);

    // Check 4: Missing allergen warnings
    this.checkAllergenWarnings(lower, responseText, flags);

    // Check 5: Unreliable safety testing claims
    this.checkUnreliableTesting(lower, flags);

    // Check 6: Dangerous preservation advice
    this.checkPreservationAdvice(lower, flags);

    // Check 7: Incorrect bacteria/freezing claims
    this.checkFreezingClaims(lower, flags);

    return flags;
  }

  private checkTemperatures(text: string, flags: SafetyFlag[]): void {
    // Look for temperature mentions and compare against USDA minimums
    const tempPattern = /(\d{2,3})\s*°?\s*[fF]/g;
    let match;

    while ((match = tempPattern.exec(text)) !== null) {
      const temp = parseInt(match[1]);
      const context = text.slice(Math.max(0, match.index - 100), match.index + 100);

      for (const [food, minTemp] of Object.entries(CONFIG.SAFE_TEMPS)) {
        if (context.includes(food) && temp < minTemp) {
          flags.push({
            severity: 'critical',
            category: 'temperature',
            message: `Recommended ${temp}°F for ${food}, but USDA minimum is ${minTemp}°F`,
          });
        }
      }
    }

    // Also check Celsius
    const celsiusPattern = /(\d{2,3})\s*°?\s*[cC]/g;
    while ((match = celsiusPattern.exec(text)) !== null) {
      const tempC = parseInt(match[1]);
      const tempF = tempC * 9 / 5 + 32;
      const context = text.slice(Math.max(0, match.index - 100), match.index + 100);

      for (const [food, minTemp] of Object.entries(CONFIG.SAFE_TEMPS)) {
        if (context.includes(food) && tempF < minTemp) {
          flags.push({
            severity: 'critical',
            category: 'temperature',
            message: `Recommended ${tempC}°C (${Math.round(tempF)}°F) for ${food}, but USDA minimum is ${minTemp}°F (${Math.round((minTemp - 32) * 5 / 9)}°C)`,
          });
        }
      }
    }
  }

  private checkRawFoodClaims(text: string, flags: SafetyFlag[]): void {
    const dangerousPatterns = [
      { pattern: /raw\s+(chicken|poultry)\s+(is|are)\s+(safe|fine|ok)/i, msg: 'Claims raw poultry is safe' },
      { pattern: /raw\s+(pork)\s+(is|are)\s+(safe|fine|ok)/i, msg: 'Claims raw pork is safe' },
      { pattern: /raw\s+egg[s]?\s+(is|are)\s+(completely|totally|perfectly)\s+safe/i, msg: 'Claims raw eggs are completely safe' },
      { pattern: /raw\s+milk\s+(is|are)\s+(always|completely|perfectly)\s+safe/i, msg: 'Claims raw milk is always safe' },
      { pattern: /undercooked\s+(meat|chicken|pork).{0,30}(safe|fine|no\s+risk)/i, msg: 'Claims undercooked meat is safe' },
    ];

    for (const { pattern, msg } of dangerousPatterns) {
      if (pattern.test(text)) {
        flags.push({ severity: 'critical', category: 'raw-food', message: msg });
      }
    }
  }

  private checkStorageAdvice(text: string, flags: SafetyFlag[]): void {
    // Check for claims about leaving food at room temperature
    if (/room\s+temperature.{0,50}(hours|overnight|all\s+day)/i.test(text) &&
        !/danger\s+zone|not\s+recommended|avoid|unsafe/i.test(text)) {
      flags.push({
        severity: 'warning',
        category: 'storage',
        message: 'Mentions room temperature storage without danger zone warning',
      });
    }

    // Check for excessively long fridge storage claims
    const fridgePattern = /(?:fridge|refrigerat).{0,30}(\d+)\s*(?:weeks|months)/i;
    const fridgeMatch = fridgePattern.exec(text);
    if (fridgeMatch) {
      const duration = parseInt(fridgeMatch[1]);
      if (fridgeMatch[0].includes('week') && duration > 2) {
        flags.push({
          severity: 'warning',
          category: 'storage',
          message: `Claims food lasts ${duration} weeks in fridge — verify specific food item`,
        });
      }
    }
  }

  private checkAllergenWarnings(text: string, originalText: string, flags: SafetyFlag[]): void {
    const allergens = ['peanut', 'tree nut', 'walnut', 'almond', 'cashew', 'milk', 'dairy',
      'egg', 'wheat', 'gluten', 'soy', 'fish', 'shellfish', 'shrimp', 'crab', 'sesame'];

    const mentionsAllergen = allergens.some(a => text.includes(a));
    const hasSubstitution = /substitut|replac|instead|alternative|swap/i.test(text);
    const hasDisclaimer = /allergi|consult|healthcare|doctor|medical|individual/i.test(text);

    if (mentionsAllergen && hasSubstitution && !hasDisclaimer) {
      flags.push({
        severity: 'warning',
        category: 'allergen',
        message: 'Discusses allergen substitutions without allergy disclaimer',
      });
    }
  }

  private checkUnreliableTesting(text: string, flags: SafetyFlag[]): void {
    const unreliablePatterns = [
      { pattern: /(?:smell|sniff)\s+(?:test|it).{0,30}(?:safe|tell|know|determine)/i, msg: 'Suggests smell test is reliable for food safety' },
      { pattern: /(?:look|visual).{0,30}(?:safe|tell|know|determine)\s+(?:if|whether)/i, msg: 'Suggests visual inspection is reliable for food safety' },
      { pattern: /(?:taste|try)\s+(?:a\s+)?(?:little|bit|small).{0,30}(?:safe|ok|fine)/i, msg: 'Suggests tasting to determine food safety' },
    ];

    for (const { pattern, msg } of unreliablePatterns) {
      if (pattern.test(text) && !/not\s+reliable|cannot|don't\s+rely|unreliable/i.test(text)) {
        flags.push({ severity: 'warning', category: 'testing', message: msg });
      }
    }
  }

  private checkPreservationAdvice(text: string, flags: SafetyFlag[]): void {
    // Home canning without pressure for low-acid foods
    if (/(?:can|canning).{0,50}(?:water\s+bath|boiling\s+water)/i.test(text) &&
        /(?:meat|chicken|fish|vegetable|bean|corn|pea)/i.test(text) &&
        !/(?:pressure\s+cann|not\s+safe|do\s+not|avoid)/i.test(text)) {
      flags.push({
        severity: 'critical',
        category: 'preservation',
        message: 'May suggest water bath canning for low-acid foods (requires pressure canning)',
      });
    }
  }

  private checkFreezingClaims(text: string, flags: SafetyFlag[]): void {
    if (/freez.{0,30}(?:kill|destroy|eliminate)\s+(?:all|every)\s+(?:bacteria|pathogen|germ)/i.test(text)) {
      flags.push({
        severity: 'warning',
        category: 'freezing',
        message: 'Claims freezing kills all bacteria (it only inhibits growth, some survive)',
      });
    }

    // Washing chicken recommendation
    if (/wash.{0,20}(?:chicken|poultry).{0,30}(?:running\s+water|before\s+cook|recommended)/i.test(text) &&
        !/(?:do\s+not|don't|avoid|not\s+recommend|USDA\s+advises\s+against)/i.test(text)) {
      flags.push({
        severity: 'warning',
        category: 'cross-contamination',
        message: 'May recommend washing chicken (USDA advises against — spreads bacteria)',
      });
    }
  }
}

export const safetyScanner = new SafetyScanner();
