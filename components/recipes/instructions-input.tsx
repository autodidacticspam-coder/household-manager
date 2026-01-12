'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { Instruction } from '@/types/recipe';

interface InstructionsInputProps {
  instructions: Instruction[];
  onChange: (instructions: Instruction[]) => void;
}

export function InstructionsInput({ instructions, onChange }: InstructionsInputProps) {
  const t = useTranslations();

  const addInstruction = () => {
    const nextStep = instructions.length + 1;
    onChange([...instructions, { step: nextStep, text: '' }]);
  };

  const removeInstruction = (index: number) => {
    // Remove and renumber steps
    const updated = instructions
      .filter((_, i) => i !== index)
      .map((inst, i) => ({ ...inst, step: i + 1 }));
    onChange(updated);
  };

  const updateInstruction = (index: number, text: string) => {
    const updated = [...instructions];
    updated[index] = { ...updated[index], text };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('recipes.instructions')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
          <Plus className="h-4 w-4 mr-1" />
          {t('recipes.addStep')}
        </Button>
      </div>

      {instructions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No instructions added yet. Click &quot;Add Step&quot; to start.
        </p>
      ) : (
        <div className="space-y-3">
          {instructions.map((instruction, index) => (
            <div key={index} className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                {instruction.step}
              </div>
              <div className="flex-1 space-y-1">
                <Textarea
                  value={instruction.text}
                  onChange={(e) => updateInstruction(index, e.target.value)}
                  placeholder={`${t('recipes.stepNumber', { number: instruction.step })}...`}
                  rows={2}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeInstruction(index)}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
