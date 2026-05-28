import { describe, it, expect } from 'vitest'
import { CR_STATUS_LABELS, RISK_LEVELS, STEP_KEYS } from '@/lib/types'

describe('change request utilities', () => {
  describe('CR number format validation', () => {
    const CR_NUMBER_REGEX = /^CR-\d{4}-\d{5}$/

    function isValidCRNumber(crNumber: string): boolean {
      return CR_NUMBER_REGEX.test(crNumber)
    }

    it('accepts valid CR number format CR-YYYY-NNNNN', () => {
      expect(isValidCRNumber('CR-2025-00001')).toBe(true)
      expect(isValidCRNumber('CR-2024-12345')).toBe(true)
      expect(isValidCRNumber('CR-2030-99999')).toBe(true)
    })

    it('rejects invalid CR number formats', () => {
      expect(isValidCRNumber('CR-2025-1')).toBe(false)       // too short
      expect(isValidCRNumber('CR-2025-000001')).toBe(false)    // too long
      expect(isValidCRNumber('CR-25-00001')).toBe(false)       // 2-digit year
      expect(isValidCRNumber('cr-2025-00001')).toBe(false)     // lowercase
      expect(isValidCRNumber('CR202500001')).toBe(false)       // missing dashes
      expect(isValidCRNumber('XX-2025-00001')).toBe(false)    // wrong prefix
      expect(isValidCRNumber('')).toBe(false)
      expect(isValidCRNumber('CR-2025')).toBe(false)
    })
  })

  describe('status badge text mapping', () => {
    it('maps all known statuses to human-readable labels', () => {
      const knownStatuses = [
        'draft',
        'pending_user_supervisor',
        'pending_it_pickup',
        'pending_it_impact',
        'pending_it_supervisor',
        'pending_section_head',
        'pending_director',
        'pending_cost_estimate',
        'pending_design',
        'pending_development',
        'pending_sit_test_case',
        'pending_sit_execution',
        'pending_uat_test_case',
        'pending_uat_execution',
        'pending_committee',
        'pending_deployment',
        'pending_deployment_check',
        'completed',
        'rejected',
        'cancelled',
      ]

      knownStatuses.forEach(status => {
        const label = CR_STATUS_LABELS[status]
        expect(label).toBeDefined()
        expect(typeof label).toBe('string')
        expect(label.length).toBeGreaterThan(0)
      })
    })

    it('returns undefined for unknown status', () => {
      const label = CR_STATUS_LABELS['unknown_status_xyz']
      expect(label).toBeUndefined()
    })

    it('returns capitalized label for draft', () => {
      expect(CR_STATUS_LABELS['draft']).toBe('Draft')
    })

    it('returns human-readable labels with spaces', () => {
      expect(CR_STATUS_LABELS['pending_user_supervisor']).toBe('Pending User Supervisor')
      expect(CR_STATUS_LABELS['pending_it_impact']).toBe('Pending IT Impact Analysis')
      expect(CR_STATUS_LABELS['pending_deployment_check']).toBe('Pending Deployment Check')
    })
  })

  describe('step timeline ordering', () => {
    it('defines step keys with sequential ordering', () => {
      const stepKeys = [
        STEP_KEYS.SUBMIT,
        STEP_KEYS.USER_SUPERVISOR_APPROVE,
        STEP_KEYS.IT_PICKUP,
        STEP_KEYS.IT_IMPACT_ANALYSIS,
        STEP_KEYS.IT_SUPERVISOR_APPROVE,
        STEP_KEYS.SECTION_HEAD_APPROVE,
        STEP_KEYS.DIRECTOR_APPROVE,
        STEP_KEYS.COST_ESTIMATE,
        STEP_KEYS.SYSTEM_DESIGN,
        STEP_KEYS.DEVELOPMENT,
        STEP_KEYS.SIT_TEST_CASE,
        STEP_KEYS.SIT_TEST_EXECUTION,
        STEP_KEYS.UAT_TEST_CASE,
        STEP_KEYS.UAT_TEST_EXECUTION,
        STEP_KEYS.COMMITTEE_REVIEW,
        STEP_KEYS.DEPLOYMENT,
        STEP_KEYS.DEPLOYMENT_CHECK,
        STEP_KEYS.COMPLETE,
      ]

      // Verify all step keys are unique
      const uniqueKeys = new Set(stepKeys)
      expect(uniqueKeys.size).toBe(stepKeys.length)

      // Verify no empty step keys
      stepKeys.forEach(key => {
        expect(key).toBeTruthy()
        expect(key.length).toBeGreaterThan(0)
      })
    })

    it('step keys are in correct workflow order', () => {
      expect(STEP_KEYS.SUBMIT).toBe('submit')
      expect(STEP_KEYS.USER_SUPERVISOR_APPROVE).toBe('user_supervisor_approve')
      expect(STEP_KEYS.IT_PICKUP).toBe('it_pickup')
      expect(STEP_KEYS.IT_IMPACT_ANALYSIS).toBe('it_impact_analysis')
      expect(STEP_KEYS.IT_SUPERVISOR_APPROVE).toBe('it_supervisor_approve')
      expect(STEP_KEYS.SECTION_HEAD_APPROVE).toBe('section_head_approve')
      expect(STEP_KEYS.DIRECTOR_APPROVE).toBe('director_approve')
    })
  })

  describe('risk level to badge color mapping', () => {
    const RISK_COLORS: Record<string, string> = {
      high: 'red',
      medium: 'yellow',
      low: 'green',
    }

    it('maps all valid risk levels to colors', () => {
      RISK_LEVELS.forEach(risk => {
        const color = RISK_COLORS[risk]
        expect(color).toBeDefined()
        expect(['red', 'yellow', 'green']).toContain(color)
      })
    })

    it('high risk maps to red', () => {
      expect(RISK_COLORS['high']).toBe('red')
    })

    it('medium risk maps to yellow', () => {
      expect(RISK_COLORS['medium']).toBe('yellow')
    })

    it('low risk maps to green', () => {
      expect(RISK_COLORS['low']).toBe('green')
    })

    it('risk levels are limited to high, medium, low', () => {
      expect(RISK_LEVELS).toHaveLength(3)
      expect(RISK_LEVELS).toContain('high')
      expect(RISK_LEVELS).toContain('medium')
      expect(RISK_LEVELS).toContain('low')
    })
  })
})