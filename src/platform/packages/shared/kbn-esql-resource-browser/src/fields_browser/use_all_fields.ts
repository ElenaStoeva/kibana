/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useRef, useState } from 'react';
import type { HttpStart } from '@kbn/core/public';
import type { ESQLFieldWithMetadata, RecommendedField } from '@kbn/esql-types';
import type { TimeRange } from '@kbn/es-query';
import type { KibanaProject as SolutionId } from '@kbn/projects-solutions-groups';
import type { ISearchGeneric } from '@kbn/search-types';
import { getEditorExtensions, getEsqlColumns } from '@kbn/esql-utils';
// `simplifiedQuery` is expected to be the final ES|QL query passed to `getEsqlColumns`
// (e.g. "FROM logs-*" or a simplified pipeline), computed by the consumer.

export interface UseAllFieldsParams {
  isOpen: boolean;
  preloadedFields?: Array<{ name: string; type?: string }>;
  preloadedRecommendedFields?: RecommendedField[];
  simplifiedQuery?: string;
  /** Query used for deriving recommended fields; defaults to `fullQuery` then `simplifiedQuery`. */
  fullQuery?: string;
  http?: HttpStart;
  activeSolutionId?: SolutionId;
  search?: ISearchGeneric;
  getTimeRange?: () => TimeRange;
  signal?: AbortSignal;
}

export const useAllFields = ({
  isOpen,
  preloadedFields,
  preloadedRecommendedFields,
  simplifiedQuery,
  fullQuery,
  http,
  activeSolutionId,
  search,
  getTimeRange,
  signal,
}: UseAllFieldsParams): {
  allFields: ESQLFieldWithMetadata[];
  recommendedFields: RecommendedField[];
  isLoading: boolean;
} => {
  const [allFields, setAllFields] = useState<ESQLFieldWithMetadata[]>([]);
  const [recommendedFields, setRecommendedFields] = useState<RecommendedField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (preloadedRecommendedFields) {
      setRecommendedFields(preloadedRecommendedFields);
    } else {
      const queryForRecommendations = (fullQuery ?? simplifiedQuery ?? '').trim();
      const canFetchRecommendations = Boolean(http && activeSolutionId && queryForRecommendations);
      if (!canFetchRecommendations) {
        setRecommendedFields([]);
      } else {
        getEditorExtensions(http!, queryForRecommendations, activeSolutionId!).then((extensions) => {
          if (isMountedRef.current) {
            setRecommendedFields(extensions?.recommendedFields ?? []);
          }
        });
      }
    }

    if (preloadedFields?.length) {
      const fieldsFromNames: ESQLFieldWithMetadata[] = preloadedFields.map((f) => ({
        name: f.name,
        type: (f.type as ESQLFieldWithMetadata['type']) ?? 'keyword',
        userDefined: false,
      }));
      setAllFields(fieldsFromNames);
      setIsLoading(false);
      return;
    }

    const canFetch = Boolean(simplifiedQuery && search && getTimeRange);
    if (!canFetch) {
      setAllFields([]);
      setIsLoading(false);
      return;
    }

    const fetchFields = async () => {
      setIsLoading(true);
      try {
        const fetched = await getEsqlColumns({
          esqlQuery: simplifiedQuery!.trim(),
          search: search!,
          timeRange: getTimeRange!(),
          signal,
        });
        if (isMountedRef.current) setAllFields(fetched);
      } catch {
        if (isMountedRef.current) setAllFields([]);
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    };

    fetchFields();
  }, [
    activeSolutionId,
    getTimeRange,
    http,
    isOpen,
    preloadedFields,
    preloadedRecommendedFields,
    simplifiedQuery,
    fullQuery,
    search,
    signal,
  ]);

  return { allFields, recommendedFields, isLoading };
};

