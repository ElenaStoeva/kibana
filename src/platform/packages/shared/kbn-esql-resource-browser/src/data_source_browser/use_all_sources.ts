/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useRef, useState } from 'react';
import type {
  ESQLCallbacks,
  ESQLSourceResult,
  IndicesAutocompleteResult,
} from '@kbn/esql-types';

const normalizeTimeseriesIndices = ({
  indices,
}: Pick<IndicesAutocompleteResult, 'indices'>): ESQLSourceResult[] => {
  return (
    indices?.map((index) => ({
      name: index.name,
      type: 'timeseries',
      title: index.name,
      hidden: false,
    })) ?? []
  );
};

export interface UseAllSourcesParams {
  isOpen: boolean;
  preloadedSources?: ESQLSourceResult[];
  esqlCallbacks?: Pick<ESQLCallbacks, 'getSources' | 'getTimeseriesIndices'>;
  queryText?: string;
  isTimeseries: boolean;
}

export const useAllSources = ({
  isOpen,
  preloadedSources,
  esqlCallbacks,
  queryText,
  isTimeseries,
}: UseAllSourcesParams): { allSources: ESQLSourceResult[]; isLoading: boolean } => {
  const [allSources, setAllSources] = useState<ESQLSourceResult[]>([]);
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

    if (preloadedSources?.length) {
      setAllSources(preloadedSources);
      setIsLoading(false);
      return;
    }

    const fetchSources = async () => {
      setIsLoading(true);
      try {
        if (isTimeseries) {
          const result = (await esqlCallbacks?.getTimeseriesIndices?.()) ?? { indices: [] };
          const normalized = normalizeTimeseriesIndices(result);
          if (isMountedRef.current) setAllSources(normalized);
        } else {
          const fetched = (await esqlCallbacks?.getSources?.()) ?? [];
          if (isMountedRef.current) setAllSources(fetched);
        }
      } catch {
        if (isMountedRef.current) setAllSources([]);
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    };

    fetchSources();
  }, [
    esqlCallbacks,
    isTimeseries,
    isOpen,
    preloadedSources,
    queryText,
  ]);

  return { allSources, isLoading };
};

