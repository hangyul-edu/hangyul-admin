import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AiPurpose, type ConnectionTestResult, type IntegrationSettings, type SettingsPageData } from "../../api";
import { errorMessage } from "../../../lib/http";
import { guessProvider, suggestedModel } from "../../components/ModelPicker";
import {
  MODELS_KEY,
  QUERY_KEY,
  effectiveEdits,
  fieldErrors,
  savedValue,
  toChanges,
  toTrial,
  type Edit,
  type Edits,
  type ModelsState,
} from "./model";

/** What the save bar reports after a save. */
export type Outcome = { tone: "success" | "warning" | "danger"; text: string; at: Date };
export type TestResult = ConnectionTestResult & { at: Date };

/**
 * One integration's form: its pending edits, the save and the connection test,
 * and what each reported. The component only renders; every rule about edits
 * (an empty secret is no change, a provider change moves its model along, a
 * result goes stale once values change) lives here.
 */
export function useIntegrationForm(integration: IntegrationSettings, onDirtyChange: (dirty: boolean) => void) {
  const qc = useQueryClient();
  const isAi = integration.id === "ai";
  // The AI card also shows the models configured now and what can be chosen.
  const models = useQuery({ queryKey: MODELS_KEY, queryFn: () => adminApi.aiModels(), enabled: isAi, staleTime: 60_000 });
  const refreshModels = useMutation({
    mutationFn: () => adminApi.aiModels(true),
    onSuccess: (data) => qc.setQueryData(MODELS_KEY, data),
  });
  const [edits, setEdits] = useState<Edits>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const changes = effectiveEdits(edits);
  const changeCount = Object.keys(changes).length;
  const dirty = changeCount > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const replace = (next: IntegrationSettings) => {
    qc.setQueryData<SettingsPageData>(QUERY_KEY, (page) =>
      page
        ? {
            ...page,
            groups: page.groups.map((g) => ({
              ...g,
              integrations: g.integrations.map((i) => (i.id === next.id ? next : i)),
            })),
          }
        : page,
    );
    // The page-wide restart notice may have changed too. MODELS_KEY sits under
    // QUERY_KEY, so this also refetches the AI model summary — which is what
    // keeps it current after a provider's key is saved on that provider's own
    // card.
    void qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: (enabled?: boolean) =>
      adminApi.saveIntegration(integration.id, {
        changes: toChanges(integration.fields, changes),
        ...(enabled === undefined ? {} : { enabled }),
      }),
    onSuccess: (result) => {
      const restart = Object.values(result.applied).includes("restart");
      setEdits({});
      setErrors({});
      // A result from before the save described unsaved values.
      setTestResult(null);
      // Shown in the sticky save bar, right where the admin pressed 저장 (a
      // toast would cover that bar and repeat it).
      setOutcome({ tone: restart ? "warning" : "success", text: result.message, at: new Date() });
      replace(result.integration);
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setOutcome({ tone: "danger", text: `저장하지 못했습니다. ${errorMessage(error)}`, at: new Date() });
    },
  });

  const test = useMutation({
    mutationFn: () => adminApi.testIntegration(integration.id, toTrial(integration.fields, changes)),
    onSuccess: (result) => {
      setTestResult({ ...result, at: new Date() });
      setErrors({});
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setTestResult({ ok: false, message: errorMessage(error), latency_ms: 0, details: [], used_unsaved_values: dirty, at: new Date() });
    },
  });

  const setEdit = (key: string, edit: Edit | null) => {
    setOutcome(null);
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
    setEdits((current) => {
      const next = { ...current };
      if (edit === null) delete next[key];
      else next[key] = edit;
      return next;
    });
  };

  // The value a field has in the form: its pending edit, else the saved one.
  const valueOf = (key: string): string => {
    const edit = edits[key];
    if (edit?.kind === "value") return String(edit.value);
    return savedValue(integration.fields, key);
  };

  // Changing a purpose's provider also moves its model to that provider's best
  // fit, so the pair never ends up mismatched (the admin can still pick
  // another model).
  const setProvider = (providerKey: string, next: string) => {
    setEdit(providerKey, next === savedValue(integration.fields, providerKey) ? null : { kind: "value", value: next });
    const modelKey = providerKey.replace(/_provider$/, "_model");
    const purpose: AiPurpose = modelKey.includes("generation") ? "generation" : "reasoning";
    const current = valueOf(modelKey);
    const fits =
      (current && guessProvider(current) === next) ||
      (models.data?.models ?? []).some((m) => m.provider === next && m.id === current && m.compatible);
    if (!fits) {
      const suggestion = suggestedModel(next, purpose, models.data);
      const savedModel = savedValue(integration.fields, modelKey);
      if (suggestion) setEdit(modelKey, suggestion === savedModel ? null : { kind: "value", value: suggestion });
    }
  };

  const discard = () => {
    setEdits({});
    setErrors({});
    setOutcome(null);
  };

  const modelsState: ModelsState = { data: models.data, loading: models.isPending };

  return {
    edits,
    errors,
    outcome,
    testResult,
    changeCount,
    dirty,
    busy: save.isPending || test.isPending,
    save,
    test,
    models,
    modelsState,
    refreshModels,
    setEdit,
    valueOf,
    setProvider,
    discard,
  };
}
