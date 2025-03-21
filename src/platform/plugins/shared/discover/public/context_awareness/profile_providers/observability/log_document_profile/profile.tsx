/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import type { DocumentProfileProvider } from '../../../profiles';
import { DocumentType } from '../../../profiles';
import type { ProfileProviderServices } from '../../profile_provider_services';
import { createGetDocViewer } from './accessors';
import { OBSERVABILITY_ROOT_PROFILE_ID } from '../consts';

export const createObservabilityLogDocumentProfileProvider = (
  services: ProfileProviderServices
): DocumentProfileProvider => ({
  profileId: 'observability-log-document-profile',
  profile: {
    getDocViewer: createGetDocViewer(services),
  },
  resolve: ({ record, rootContext }) => {
    if (rootContext.profileId !== OBSERVABILITY_ROOT_PROFILE_ID) {
      return { isMatch: false };
    }

    const isLogRecord = getIsLogRecord(record, services.logsContextService.isLogsIndexPattern);

    if (!isLogRecord) {
      return { isMatch: false };
    }

    return {
      isMatch: true,
      context: {
        type: DocumentType.Log,
      },
    };
  },
});

const getIsLogRecord = (
  record: DataTableRecord,
  isLogsIndexPattern: ProfileProviderServices['logsContextService']['isLogsIndexPattern']
) => {
  return (
    getDataStreamType(record).includes('logs') ||
    hasFieldsWithPrefix('log.')(record) ||
    getIndices(record).some(isLogsIndexPattern)
  );
};

const getFieldValues =
  (field: string) =>
  (record: DataTableRecord): unknown[] => {
    const value = record.flattened[field];
    return Array.isArray(value) ? value : [value];
  };

const getDataStreamType = getFieldValues('data_stream.type');
const getIndices = getFieldValues('_index');

const hasFieldsWithPrefix = (prefix: string) => (record: DataTableRecord) => {
  return Object.keys(record.flattened).some(
    (field) => field.startsWith(prefix) && record.flattened[field] != null
  );
};
