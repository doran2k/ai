import { describe, it, expect } from '@jest/globals';

describe('Core Package Tests', () => {
    it('should return true for true', () => {
        expect(true).toBe(true);
    });

    it('should add numbers correctly', () => {
        expect(1 + 1).toBe(2);
    });
});