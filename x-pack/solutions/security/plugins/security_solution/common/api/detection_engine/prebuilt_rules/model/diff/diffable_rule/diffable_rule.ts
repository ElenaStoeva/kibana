/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import {
  AlertSuppression,
  AnomalyThreshold,
  HistoryWindowStart,
  InvestigationFields,
  InvestigationGuide,
  MachineLearningJobId,
  MaxSignals,
  NewTermsFields,
  RelatedIntegrationArray,
  RequiredFieldArray,
  RiskScore,
  RiskScoreMapping,
  RuleDescription,
  RuleFalsePositiveArray,
  RuleName,
  RuleReferenceArray,
  RuleSignatureId,
  RuleTagArray,
  RuleVersion,
  SetupGuide,
  Severity,
  SeverityMapping,
  ThreatArray,
  ThreatIndex,
  ThreatIndicatorPath,
  ThreatMapping,
  Threshold,
  ThresholdAlertSuppression,
} from '../../../../model/rule_schema';

import {
  BuildingBlockObject,
  InlineKqlQuery,
  RuleDataSource,
  RuleEqlQuery,
  RuleEsqlQuery,
  RuleKqlQuery,
  RuleNameOverrideObject,
  TimelineTemplateReference,
  TimestampOverrideObject,
} from './diffable_field_types';
import { RuleSchedule } from '../../../../model/rule_schema/rule_schedule';

export type DiffableCommonFields = z.infer<typeof DiffableCommonFields>;
export const DiffableCommonFields = z.object({
  // Technical fields
  // NOTE: We might consider removing them from the schema and returning from the API
  // not via the fields diff, but via dedicated properties in the response body.
  rule_id: RuleSignatureId,
  version: RuleVersion,

  // Main domain fields
  name: RuleName,
  tags: RuleTagArray,
  description: RuleDescription,
  severity: Severity,
  severity_mapping: SeverityMapping,
  risk_score: RiskScore,
  risk_score_mapping: RiskScoreMapping,

  // About -> Advanced settings
  references: RuleReferenceArray,
  false_positives: RuleFalsePositiveArray,
  threat: ThreatArray,
  note: InvestigationGuide,
  setup: SetupGuide,
  related_integrations: RelatedIntegrationArray,
  required_fields: RequiredFieldArray,

  // Other domain fields
  rule_schedule: RuleSchedule, // NOTE: new field
  max_signals: MaxSignals,

  // Optional fields
  investigation_fields: InvestigationFields.optional(),
  rule_name_override: RuleNameOverrideObject.optional(), // NOTE: new field
  timestamp_override: TimestampOverrideObject.optional(), // NOTE: new field
  timeline_template: TimelineTemplateReference.optional(), // NOTE: new field
  building_block: BuildingBlockObject.optional(), // NOTE: new field
});

export type DiffableCustomQueryFields = z.infer<typeof DiffableCustomQueryFields>;
export const DiffableCustomQueryFields = z.object({
  type: z.literal('query'),
  kql_query: RuleKqlQuery, // NOTE: new field
  data_source: RuleDataSource.optional(), // NOTE: new field
  alert_suppression: AlertSuppression.optional(),
});

export type DiffableSavedQueryFields = z.infer<typeof DiffableSavedQueryFields>;
export const DiffableSavedQueryFields = z.object({
  type: z.literal('saved_query'),
  kql_query: RuleKqlQuery, // NOTE: new field
  data_source: RuleDataSource.optional(), // NOTE: new field
  alert_suppression: AlertSuppression.optional(),
});

export type DiffableEqlFields = z.infer<typeof DiffableEqlFields>;
export const DiffableEqlFields = z.object({
  type: z.literal('eql'),
  eql_query: RuleEqlQuery, // NOTE: new field
  data_source: RuleDataSource.optional(), // NOTE: new field
  alert_suppression: AlertSuppression.optional(),
});

// this is a new type of rule, no prebuilt rules created yet.
// new properties might be added here during further rule type development
export type DiffableEsqlFields = z.infer<typeof DiffableEsqlFields>;
export const DiffableEsqlFields = z.object({
  type: z.literal('esql'),
  esql_query: RuleEsqlQuery, // NOTE: new field
  alert_suppression: AlertSuppression.optional(),
});

export type DiffableThreatMatchFields = z.infer<typeof DiffableThreatMatchFields>;
export const DiffableThreatMatchFields = z.object({
  type: z.literal('threat_match'),
  kql_query: RuleKqlQuery, // NOTE: new field
  threat_query: InlineKqlQuery, // NOTE: new field
  threat_index: ThreatIndex,
  threat_mapping: ThreatMapping,
  data_source: RuleDataSource.optional(), // NOTE: new field
  threat_indicator_path: ThreatIndicatorPath.optional(),
  alert_suppression: AlertSuppression.optional(),
});

export type DiffableThresholdFields = z.infer<typeof DiffableThresholdFields>;
export const DiffableThresholdFields = z.object({
  type: z.literal('threshold'),
  kql_query: RuleKqlQuery, // NOTE: new field
  threshold: Threshold,
  data_source: RuleDataSource.optional(), // NOTE: new field
  alert_suppression: ThresholdAlertSuppression.optional(),
});

export type DiffableMachineLearningFields = z.infer<typeof DiffableMachineLearningFields>;
export const DiffableMachineLearningFields = z.object({
  type: z.literal('machine_learning'),
  machine_learning_job_id: MachineLearningJobId,
  anomaly_threshold: AnomalyThreshold,
  alert_suppression: AlertSuppression.optional(),
});

export type DiffableNewTermsFields = z.infer<typeof DiffableNewTermsFields>;
export const DiffableNewTermsFields = z.object({
  type: z.literal('new_terms'),
  kql_query: InlineKqlQuery, // NOTE: new field
  new_terms_fields: NewTermsFields,
  history_window_start: HistoryWindowStart,
  data_source: RuleDataSource.optional(), // NOTE: new field
  alert_suppression: AlertSuppression.optional(),
});

export const DiffableFieldsByTypeUnion = z.discriminatedUnion('type', [
  DiffableCustomQueryFields,
  DiffableSavedQueryFields,
  DiffableEqlFields,
  DiffableEsqlFields,
  DiffableThreatMatchFields,
  DiffableThresholdFields,
  DiffableMachineLearningFields,
  DiffableNewTermsFields,
]);

/**
 * Represents a normalized rule object that is suitable for passing to the diff algorithm.
 * Every top-level field of a diffable rule can be compared separately on its own.
 *
 * It's important to do such normalization because:
 *
 * 1. We need to compare installed rules with prebuilt rule content. These objects have similar but not exactly
 * the same interfaces. In order to compare them we need to convert them to a common interface.
 *
 * 2. It only makes sense to compare certain rule fields in combination with other fields. For example,
 * we combine `index` and `data_view_id` fields into a `RuleDataSource` object, so that later we could
 * calculate a diff for this whole object. If we don't combine them the app would successfully merge the
 * following values independently from each other without a conflict:
 *
 *   Base version: index=[logs-*], data_view_id=undefined
 *   Current version: index=[], data_view_id=some-data-view // user switched to a data view
 *   Target version: index=[logs-*, filebeat-*], data_view_id=undefined // Elastic added a new index pattern
 *   Merged version: index=[filebeat-*], data_view_id=some-data-view ???
 *
 * Instead, semantically such change represents a conflict because the data source of the rule was changed
 * in a potentially incompatible way, and the user might want to review the change and resolve it manually.
 * The user must either pick index patterns or a data view, but not both at the same time.
 *
 * NOTE: Every top-level field in a DiffableRule MUST BE LOGICALLY INDEPENDENT from other
 * top-level fields.
 */
export type DiffableRule = z.infer<typeof DiffableRule>;
export const DiffableRule = z.intersection(DiffableCommonFields, DiffableFieldsByTypeUnion);

/**
 * Union of all possible rule types
 */
export type DiffableRuleTypes = z.infer<typeof DiffableRuleTypes>;
export const DiffableRuleTypes = z.union([
  DiffableCustomQueryFields.shape.type,
  DiffableSavedQueryFields.shape.type,
  DiffableEqlFields.shape.type,
  DiffableEsqlFields.shape.type,
  DiffableThreatMatchFields.shape.type,
  DiffableThresholdFields.shape.type,
  DiffableMachineLearningFields.shape.type,
  DiffableNewTermsFields.shape.type,
]);

/**
 * This is a merge of all fields from all rule types into a single TS type.
 * This is NOT a union discriminated by rule type, as DiffableRule is.
 */
export type DiffableAllFields = z.infer<typeof DiffableAllFields>;
export const DiffableAllFields = DiffableCommonFields.merge(
  DiffableCustomQueryFields.omit({ type: true })
)
  .merge(DiffableSavedQueryFields.omit({ type: true }))
  .merge(DiffableEqlFields.omit({ type: true }))
  .merge(DiffableEsqlFields.omit({ type: true }))
  .merge(DiffableThreatMatchFields.omit({ type: true }))
  .merge(DiffableThresholdFields.omit({ type: true }))
  .merge(DiffableMachineLearningFields.omit({ type: true }))
  .merge(DiffableNewTermsFields.omit({ type: true }))
  .merge(z.object({ type: DiffableRuleTypes }));

const getRuleTypeFields = (schema: z.ZodObject<z.ZodRawShape>): string[] =>
  Object.keys(schema.shape);

const createDiffableFieldsPerRuleType = (specificFields: z.ZodObject<z.ZodRawShape>): string[] => [
  ...getRuleTypeFields(DiffableCommonFields),
  ...getRuleTypeFields(specificFields),
];

export const DIFFABLE_RULE_TYPE_FIELDS_MAP = new Map<DiffableRuleTypes, string[]>([
  ['query', createDiffableFieldsPerRuleType(DiffableCustomQueryFields)],
  ['saved_query', createDiffableFieldsPerRuleType(DiffableSavedQueryFields)],
  ['eql', createDiffableFieldsPerRuleType(DiffableEqlFields)],
  ['esql', createDiffableFieldsPerRuleType(DiffableEsqlFields)],
  ['threat_match', createDiffableFieldsPerRuleType(DiffableThreatMatchFields)],
  ['threshold', createDiffableFieldsPerRuleType(DiffableThresholdFields)],
  ['machine_learning', createDiffableFieldsPerRuleType(DiffableMachineLearningFields)],
  ['new_terms', createDiffableFieldsPerRuleType(DiffableNewTermsFields)],
]);
