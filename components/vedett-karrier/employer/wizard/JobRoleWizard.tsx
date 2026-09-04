'use client'
/**
 * Védett Karrier – Job Role Wizard Controller
 * Sprint 4
 *
 * 7 lépéses UX grouping. Az adatmodell (10 VKMM dimenzió) érintetlen.
 * Mentés lépésváltásnál + explicit Mentés gombbal.
 * Nincs: suitability, score, autizmusbarát, neurodivergens-barát.
 */

import { useState, useCallback } from 'react'
import type { JobRoleRow, WorkplaceRow, EmployerDimensionValue } from '../../../../lib/vedett-karrier/types/employer'
import type { VkmmSubDimension } from '../../../../lib/vedett-karrier/types/index'
import type { JobFamilyRow } from '../../../../lib/vedett-karrier/types/discovery'
import Step1Basics from './Step1Basics'
import StepDimensions from './StepDimensions'
import Step7Review from './Step7Review'
import { WIZARD_STEP_LABELS, WIZARD_STEP_DIMENSIONS } from '../../../../lib/vedett-karrier/types/employer'
import type { JobRoleEnvValueRow } from '../../../../lib/vedett-karrier/types/employer'

interface Props {
  role: JobRoleRow
  workplaces: WorkplaceRow[]
  allFamilies: JobFamilyRow[]
  allSubDimensions: VkmmSubDimension[]
  savedEnvValues: JobRoleEnvValueRow[]
}

export default function JobRoleWizard({ role, workplaces, allFamilies, allSubDimensions, savedEnvValues }: Props) {
  const [currentStep, setCurrentStep] = useState<number>(Math.max(1, role.last_saved_step || 1))
  const [completionPct, setCompletionPct] = useState<number>(role.profile_completion_pct)
  // Track saved env values locally for review step
  const [localEnvValues, setLocalEnvValues] = useState<JobRoleEnvValueRow[]>(savedEnvValues)

  const handleDimensionSaved = useCallback((code: string, value: EmployerDimensionValue, pct: number) => {
    setCompletionPct(pct)
    // Update local env values for review step display
    setLocalEnvValues(prev => {
      const existing = prev.findIndex(v => v.sub_dimension_code === code)
      const newRow: JobRoleEnvValueRow = {
        id: existing >= 0 ? prev[existing].id : '',
        job_role_id: role.id,
        sub_dimension_code: code,
        ordinal_value: value?.type === 'ordinal' ? value.value : null,
        categorical_value: value?.type === 'categorical' ? value.value : null,
        boolean_value: value?.type === 'boolean' ? value.value : null,
        frequency_value: value?.type === 'frequency' ? value.value : null,
        data_source: (value?.dataSource as 'SELF_REPORTED' | 'CONFIRMED') ?? 'SELF_REPORTED',
        employer_note: null,
        public_context_note: null,
        last_reviewed_at: new Date().toISOString(),
        created_at: existing >= 0 ? prev[existing].created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (existing >= 0) {
        const next = [...prev]; next[existing] = newRow; return next
      }
      return [...prev, newRow]
    })
  }, [role.id])

  const steps = Object.keys(WIZARD_STEP_LABELS).map(Number).sort((a, b) => a - b)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Step indicator */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {steps.map(step => (
              <button
                key={step}
                type="button"
                onClick={() => setCurrentStep(step)}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  step === currentStep
                    ? 'bg-sni-brand-teal text-white'
                    : step < currentStep
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
                aria-label={`${step}. lépés: ${WIZARD_STEP_LABELS[step]}`}
                aria-current={step === currentStep ? 'step' : undefined}
              >
                <span className="font-bold">{step}</span>
                <span className="hidden sm:inline">{WIZARD_STEP_LABELS[step]}</span>
              </button>
            ))}
          </div>

          {/* Completion bar */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-sni-brand-teal h-1.5 rounded-full transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">{completionPct}% kitöltve</span>
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {currentStep}. {WIZARD_STEP_LABELS[currentStep]}
        </h1>

        {currentStep === 1 && (
          <Step1Basics
            role={role}
            workplaces={workplaces}
            allFamilies={allFamilies}
            onSaved={() => setCurrentStep(2)}
          />
        )}

        {currentStep >= 2 && currentStep <= 6 && (
          <StepDimensions
            stepNumber={currentStep}
            roleId={role.id}
            allSubDimensions={allSubDimensions}
            savedEnvValues={localEnvValues}
            dimensionCodes={WIZARD_STEP_DIMENSIONS[currentStep] ?? []}
            onSaved={handleDimensionSaved}
            onNext={() => setCurrentStep(prev => Math.min(7, prev + 1))}
            onBack={() => setCurrentStep(prev => Math.max(1, prev - 1))}
          />
        )}

        {currentStep === 7 && (
          <Step7Review
            role={{ ...role, profile_completion_pct: completionPct }}
            workplaces={workplaces}
            allSubDimensions={allSubDimensions}
            savedEnvValues={localEnvValues}
            onBack={() => setCurrentStep(6)}
          />
        )}

        {/* Navigation */}
        {currentStep >= 2 && currentStep <= 5 && (
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
              className="rounded-full border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              ← Vissza
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(prev => Math.min(7, prev + 1))}
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Következő →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
