/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { FC } from 'react';
import React from 'react';
import { pick } from 'lodash';

import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { StorageContextProvider } from '@kbn/ml-local-storage';
import { UrlStateProvider } from '@kbn/ml-url-state';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import { DatePickerContextProvider, type DatePickerDependencies } from '@kbn/ml-date-picker';
import { UI_SETTINGS } from '@kbn/data-plugin/common';

import { DataSourceContext } from '../../hooks/use_data_source';
import type { AiopsAppContextValue } from '../../hooks/use_aiops_app_context';
import { AIOPS_STORAGE_KEYS } from '../../types/storage';
import { AiopsAppContext } from '../../hooks/use_aiops_app_context';

import { LogCategorizationPage } from './log_categorization_page';
import { timeSeriesDataViewWarning } from '../../application/utils/time_series_dataview_check';

const localStorage = new Storage(window.localStorage);

/**
 * Props for the LogCategorizationAppState component.
 */
export interface LogCategorizationAppStateProps {
  /** The data view to analyze. */
  dataView: DataView;
  /** The saved search to analyze. */
  savedSearch: SavedSearch | null;
  /** App context value */
  appContextValue: AiopsAppContextValue;
  /** Optional flag to indicate whether kibana is running in serverless */
  showFrozenDataTierChoice?: boolean;
}

export const LogCategorizationAppState: FC<LogCategorizationAppStateProps> = ({
  dataView,
  savedSearch,
  appContextValue,
  showFrozenDataTierChoice = true,
}) => {
  if (!dataView) return null;

  const warning = timeSeriesDataViewWarning(dataView, 'log_categorization');

  if (warning !== null) {
    return <>{warning}</>;
  }

  const datePickerDeps: DatePickerDependencies = {
    ...pick(appContextValue, [
      'data',
      'http',
      'notifications',
      'theme',
      'uiSettings',
      'userProfile',
      'i18n',
    ]),
    uiSettingsKeys: UI_SETTINGS,
    showFrozenDataTierChoice,
  };

  const CasesContext = appContextValue.cases?.ui.getCasesContext() ?? React.Fragment;
  const casesPermissions = appContextValue.cases?.helpers.canUseCases();

  return (
    <AiopsAppContext.Provider value={appContextValue}>
      <CasesContext owner={[]} permissions={casesPermissions!}>
        <UrlStateProvider>
          <DataSourceContext.Provider value={{ dataView, savedSearch }}>
            <StorageContextProvider storage={localStorage} storageKeys={AIOPS_STORAGE_KEYS}>
              <DatePickerContextProvider {...datePickerDeps}>
                <LogCategorizationPage />
              </DatePickerContextProvider>
            </StorageContextProvider>
          </DataSourceContext.Provider>
        </UrlStateProvider>
      </CasesContext>
    </AiopsAppContext.Provider>
  );
};
