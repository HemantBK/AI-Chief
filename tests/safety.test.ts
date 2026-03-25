/**
 * Tests for the Safety Scanner module
 */

import { describe, it, expect } from 'vitest';
import { safetyScanner } from '../src/safety/scanner.js';

describe('SafetyScanner', () => {
  describe('Temperature checks', () => {
    it('flags cooking poultry below 165°F', () => {
      const flags = safetyScanner.scan('Cook the poultry to an internal temperature of 140°F for best results');
      const tempFlags = flags.filter(f => f.category === 'temperature');
      expect(tempFlags.length).toBeGreaterThan(0);
      expect(tempFlags[0].severity).toBe('critical');
    });

    it('does not flag chicken at safe temperature', () => {
      const flags = safetyScanner.scan('Cook chicken to an internal temperature of 165°F');
      const tempFlags = flags.filter(f => f.category === 'temperature');
      expect(tempFlags.length).toBe(0);
    });

    it('flags cooking ground meat below 160°F', () => {
      const flags = safetyScanner.scan('ground meat cooked to 130°F is perfect');
      const tempFlags = flags.filter(f => f.category === 'temperature');
      expect(tempFlags.length).toBeGreaterThan(0);
    });

    it('checks Celsius temperatures too', () => {
      const flags = safetyScanner.scan('Cook poultry to 60°C for safety');
      // 60°C = 140°F, below 165°F minimum for poultry
      const tempFlags = flags.filter(f => f.category === 'temperature');
      expect(tempFlags.length).toBeGreaterThan(0);
    });
  });

  describe('Raw food claims', () => {
    it('flags claims that raw chicken is safe', () => {
      const flags = safetyScanner.scan('Raw chicken is safe if it is fresh');
      const rawFlags = flags.filter(f => f.category === 'raw-food');
      expect(rawFlags.length).toBeGreaterThan(0);
      expect(rawFlags[0].severity).toBe('critical');
    });

    it('flags claims that raw eggs are completely safe', () => {
      const flags = safetyScanner.scan('Raw eggs are completely safe for everyone');
      const rawFlags = flags.filter(f => f.category === 'raw-food');
      expect(rawFlags.length).toBeGreaterThan(0);
    });

    it('does not flag safe discussion of raw foods', () => {
      const flags = safetyScanner.scan(
        'Raw eggs carry a risk of salmonella. Pasteurized eggs are safer for uncooked preparations.'
      );
      const rawFlags = flags.filter(f => f.category === 'raw-food');
      expect(rawFlags.length).toBe(0);
    });
  });

  describe('Storage advice', () => {
    it('flags leaving food at room temperature for hours without warning', () => {
      const flags = safetyScanner.scan(
        'You can leave cooked food at room temperature for hours and it will be fine'
      );
      const storageFlags = flags.filter(f => f.category === 'storage');
      expect(storageFlags.length).toBeGreaterThan(0);
    });

    it('does not flag when danger zone is mentioned', () => {
      const flags = safetyScanner.scan(
        'Food left at room temperature enters the danger zone. Avoid leaving food out for more than 2 hours.'
      );
      const storageFlags = flags.filter(f => f.category === 'storage');
      expect(storageFlags.length).toBe(0);
    });
  });

  describe('Allergen warnings', () => {
    it('flags allergen substitution without disclaimer', () => {
      const flags = safetyScanner.scan(
        'You can substitute peanut butter with almond butter as an alternative'
      );
      const allergenFlags = flags.filter(f => f.category === 'allergen');
      expect(allergenFlags.length).toBeGreaterThan(0);
    });

    it('does not flag when allergy disclaimer is present', () => {
      const flags = safetyScanner.scan(
        'You can substitute peanut butter with almond butter. If you have food allergies, consult your doctor.'
      );
      const allergenFlags = flags.filter(f => f.category === 'allergen');
      expect(allergenFlags.length).toBe(0);
    });
  });

  describe('Unreliable testing', () => {
    it('flags smell test as reliable safety indicator', () => {
      const flags = safetyScanner.scan('Just smell it to tell if the meat is safe');
      const testFlags = flags.filter(f => f.category === 'testing');
      expect(testFlags.length).toBeGreaterThan(0);
    });

    it('does not flag when saying smell test is unreliable', () => {
      const flags = safetyScanner.scan(
        'You cannot rely on smell to determine if food is safe. Use a thermometer instead.'
      );
      const testFlags = flags.filter(f => f.category === 'testing');
      expect(testFlags.length).toBe(0);
    });
  });

  describe('Freezing claims', () => {
    it('flags claims that freezing kills all bacteria', () => {
      const flags = safetyScanner.scan('Freezing will kill all bacteria in the food');
      const freezeFlags = flags.filter(f => f.category === 'freezing');
      expect(freezeFlags.length).toBeGreaterThan(0);
    });

    it('flags recommendation to wash chicken', () => {
      const flags = safetyScanner.scan(
        'Wash chicken under running water before cooking as recommended'
      );
      const crossFlags = flags.filter(f => f.category === 'cross-contamination');
      expect(crossFlags.length).toBeGreaterThan(0);
    });
  });

  describe('Preservation', () => {
    it('flags water bath canning for meat', () => {
      const flags = safetyScanner.scan(
        'You can can chicken using the water bath canning method at home'
      );
      const preserveFlags = flags.filter(f => f.category === 'preservation');
      expect(preserveFlags.length).toBeGreaterThan(0);
      expect(preserveFlags[0].severity).toBe('critical');
    });
  });

  describe('Safe content', () => {
    it('returns no flags for safe, well-written content', () => {
      const flags = safetyScanner.scan(
        'The Maillard reaction occurs between amino acids and reducing sugars at temperatures above 140°C. ' +
        'This chemical process is responsible for the browning and flavor development in seared steaks, ' +
        'toasted bread, and roasted coffee beans. The specific flavors depend on which amino acids are involved.'
      );
      expect(flags.length).toBe(0);
    });
  });
});
